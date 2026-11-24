#!/usr/bin/env bash
# Authorized v211 engine-only release; no parser or learner writes.
set -eEuo pipefail
umask 077
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
export CLOUDSDK_CORE_DISABLE_USAGE_REPORTING=true
PROJECT=qualification-learning
REGION=asia-northeast1
SERVICE=qlp-engine
PRIOR=qlp-engine-v210-7fd2f0268c
CANDIDATE=ec31376be3fbf93418b348670441164491a27b95
RESOURCE="projects/$PROJECT/locations/$REGION/services/$SERVICE"
API=https://run.googleapis.com/v2
PREFIX="新システム開発/engine"
TMP="$(mktemp -d)"
TAG="v211-$(openssl rand -hex 5)"
REV="$SERVICE-$TAG"
STATE=untouched
HTTP_STATUS=0
PROJECT_NUMBER=774945236720
PRIOR_DIGEST=sha256:c3704ca0924cebef4c664eed18bc7e3ba321978fce641f8b3cf8b65870fd2271
say() { printf '%s\n' "$*"; }
die() { say "STOP: $*" >&2; exit 1; }
# Only log machine-readable status labels and numeric codes; never raw API payloads.
brief_op() {
  jq -c 'if type!="object" then {invalid:true}
    else {done: (if (.done|type)=="boolean" then .done else null end),
      name_present: ((.name|type)=="string"),
      error_code: (if (.error.code|type)=="number" then .error.code else null end),
      error_status: (if ((.error.status|type)=="string") and (.error.status|test("^[A-Z_]{1,48}$")) then .error.status else null end)}
    end' "$1" 2>/dev/null || printf '{"invalid_json":true}\n'
}
http() {
  local method="$1" url="$2" dst="$3" body="${4:-}" label="${5:-service/read}" auth code
  HTTP_STATUS=0
  auth="$(gcloud auth print-access-token)" || return 1
  local args=(--silent --show-error --max-time 35 -X "$method" -o "$dst" -w '%{http_code}' "$url")
  if [[ -n "$body" ]]; then args+=(-H 'Content-Type: application/json' --data-binary "@$body"); fi
  code="$(printf 'header = "Authorization: Bearer %s"\n' "$auth" | curl --config - "${args[@]}")" || {
    say "Cloud Run [$label] transport failure" >&2
    return 1
  }
  unset auth
  HTTP_STATUS="$code"
  if ! [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    say "Cloud Run [$label] HTTP $code $(brief_op "$dst")" >&2
    return 1
  fi
}
read_svc() { http GET "$API/$RESOURCE" "$1" '' "${2:-service/read}"; }
op_success() {
  jq -e 'type=="object" and (.error? == null)' "$1" >/dev/null
}
wait_op() {
  local p="$1" label="$2" name op_prefix call_status i
  op_success "$p" || { say "Cloud Run [$label] invalid/error operation $(brief_op "$p")" >&2; return 1; }
  if jq -e '.done == true' "$p" >/dev/null; then return 0; fi
  name="$(jq -er '.name' "$p")" || return 1
  if [[ "$name" == "projects/$PROJECT/locations/$REGION/operations/"* ]]; then
    op_prefix="projects/$PROJECT/locations/$REGION/operations/"
  elif [[ "$name" == "projects/$PROJECT_NUMBER/locations/$REGION/operations/"* ]]; then
    op_prefix="projects/$PROJECT_NUMBER/locations/$REGION/operations/"
  else
    say "Cloud Run [$label] unexpected operation resource scope" >&2
    return 1
  fi
  [[ "${name#"$op_prefix"}" =~ ^[A-Za-z0-9_-]+$ ]] || return 1
  for ((i=0;i<120;i++)); do
    if http GET "$API/$name" "$TMP/op-result.json" '' "$label/operation-poll"; then
      op_success "$TMP/op-result.json" || {
        say "Cloud Run [$label] operation failed $(brief_op "$TMP/op-result.json")" >&2
        return 1
      }
      if jq -e '.done == true' "$TMP/op-result.json" >/dev/null; then return 0; fi
    else
      call_status="$HTTP_STATUS"
      # Only repeat read-only polling. Initial replication may delay operation lookup.
      if [[ "$call_status" == 404 && $i -lt 6 || "$call_status" == 429 || "$call_status" == 503 ]]; then
        sleep 5
        continue
      fi
      return 1
    fi
    sleep 5
  done
  say "Cloud Run [$label] operation poll timed out; no PATCH retry." >&2
  return 1
}
patch() {
  local mask="$1" body="$2" label="$3"
  say "Cloud Run [$label] request validation (read-only)"
  http PATCH "$API/$RESOURCE?updateMask=$mask&allowMissing=false&validateOnly=true" "$TMP/op-validate.json" "$body" "$label/validate" ||
    return 1
  op_success "$TMP/op-validate.json" || {
    say "Cloud Run [$label] validation rejected $(brief_op "$TMP/op-validate.json")" >&2
    return 1
  }
  # validateOnly is expressly non-persisting. A returned Operation-shaped validation
  # acknowledgement is not necessarily a retrievable long-running operation.
  say "Cloud Run [$label] validation accepted $(brief_op "$TMP/op-validate.json"); no operation GET for validation"
  say "Cloud Run [$label] applying one etag-guarded PATCH"
  http PATCH "$API/$RESOURCE?updateMask=$mask&allowMissing=false" "$TMP/op.json" "$body" "$label/apply" ||
    return 1
  wait_op "$TMP/op.json" "$label/apply"
}
# Positive traffic must be exactly one explicit prior/current revision. Understand only the
# already-confirmed untagged production shape; stop on concurrent change or unexpected tags.
assert_state() {
  local file="$1" serving="$2" tagged="$3" latest="$4"
  jq -e --arg serving "$serving" --arg tag "$TAG" --arg rev "$REV" --arg tagged "$tagged" --arg latest "$latest" '
    (.reconciling != true) and (.terminalCondition.state == "CONDITION_SUCCEEDED") and
    ((.latestReadyRevision|split("/")|last)==$latest) and
    ((.latestCreatedRevision|split("/")|last)==$latest) and
    ([.trafficStatuses[]|select((.percent//0)>0)]|length)==1 and
    any(.trafficStatuses[]; (.percent//0)==100 and ((.revision|split("/")|last)==$serving)) and
    ([.trafficStatuses[]|select((.tag//"")!="")]|
      if $tagged=="yes" then length==1 and .[0].tag==$tag and (.[0].revision|split("/")|last)==$rev
      else length==0 end) and
    (.etag|type)=="string" and (.etag|length)>0' "$file" >/dev/null
}
# Check entire service config except exclusively approved template fields and routing.
normal_config() {
  jq -cS 'del(.template.revision,.template.containers[0].image,.traffic,
    .uid,.generation,.createTime,.updateTime,.deleteTime,.expireTime,.creator,.lastModifier,
    .client,.clientVersion,.observedGeneration,.terminalCondition,.conditions,.latestReadyRevision,
    .latestCreatedRevision,.trafficStatuses,.uri,.urls,.satisfiesPzs,.threatDetectionEnabled,
    .reconciling,.etag)' "$1"
}
# Update only traffic using a fresh service etag. Once pinning, never route to LATEST.
traffic() {
  jq -n --arg etag "$(jq -er '.etag' "$1")" --arg service "$RESOURCE" --arg target "$2" '
    {name:$service,etag:$etag,traffic:[{type:"TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",revision:$target,percent:100}]}' > "$TMP/traffic.json"
  patch traffic "$TMP/traffic.json" "${3:-traffic-change}"
}
assert_current_config() {
  test "$(normal_config "$1")" = "$(cat "$TMP/prior-config.json")"
}

cleanup_or_rollback() {
  local ec=$?
  trap - EXIT
  set +e
  if [[ $ec != 0 && $STATE != untouched && $STATE != done ]]; then
    if read_svc "$TMP/failure.json"; then
      if [[ "$STATE" == promoting ]] &&
         { assert_state "$TMP/failure.json" "$REV" yes "$REV" || assert_state "$TMP/failure.json" "$REV" no "$REV"; } &&
         assert_current_config "$TMP/failure.json"; then
        say "Post-promotion check failed; rolling back to $PRIOR and removing candidate tag"
        traffic "$TMP/failure.json" "$PRIOR" rollback-and-untag && read_svc "$TMP/rolledback.json" &&
          assert_state "$TMP/rolledback.json" "$PRIOR" no "$REV" ||
          say "MANUAL CHECK REQUIRED: rollback was not verified" >&2
      elif assert_state "$TMP/failure.json" "$PRIOR" yes "$REV" &&
           assert_current_config "$TMP/failure.json"; then
        say "Production traffic stayed on $PRIOR; removing candidate tag"
        traffic "$TMP/failure.json" "$PRIOR" rollback-and-untag && read_svc "$TMP/rolledback.json" &&
          assert_state "$TMP/rolledback.json" "$PRIOR" no "$REV" ||
          say "MANUAL CHECK REQUIRED: tag cleanup was not verified" >&2
      elif ! assert_state "$TMP/failure.json" "$PRIOR" no "$PRIOR"; then
        say "MANUAL CHECK REQUIRED: unknown or concurrently changed production state; no blind overwrite" >&2
      fi
    else
      say "MANUAL CHECK REQUIRED: cannot inspect production traffic" >&2
    fi
  fi
  rm -rf -- "$TMP"
  exit "$ec"
}
trap cleanup_or_rollback EXIT

[[ -n "${GITHUB_RUN_ID:-}" ]] || die 'run only in the reviewed workflow'
say "v211 release: verifying prior production revision before any write"
read_svc "$TMP/prior.json" initial-production-state
assert_state "$TMP/prior.json" "$PRIOR" no "$PRIOR" || die 'prior ready revision/traffic/tag invariant not met'
jq -e '(.template.containers|length)==1' "$TMP/prior.json" >/dev/null || die 'expected one engine container'
normal_config "$TMP/prior.json" > "$TMP/prior-config.json"
say "Verified prior: $PRIOR serves 100%; no traffic tags; current ready/created revision unchanged."

# Preserve the established parser endpoint and authentication gate, without its secret
# or any parser deployment. No successful parse or data mutation is requested.
PARSER_URL="$(jq -er '.template.containers[0].env[]|select(.name=="PARSER_URL")|.value' "$TMP/prior.json")"
[[ "$PARSER_URL" == https://*.run.app ]] || die 'unexpected parser URL'
canonical_parser_url="$(gcloud run services describe qlp-parser --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
[[ "$PARSER_URL" == "$canonical_parser_url" ]] || die 'engine parser endpoint does not match existing service'
parser_smoke() {
  local status
  status="$(curl --silent --show-error --output "$TMP/parser-status.json" --write-out '%{http_code}' --max-time 45 "$PARSER_URL/v1/status")"
  [[ "$status" == 200 ]] &&
    jq -e '.ok == true and (.parserVersion|type)=="string" and (.parserVersion|length)>0' "$TMP/parser-status.json" >/dev/null || return 1
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 30 \
    --request POST --header 'content-type: application/json' --data '{}' "$PARSER_URL/v1/parse")"
  [[ "$status" == 401 ]]
}
parser_smoke || die 'existing parser status/auth check failed'
parser_version="$(jq -er '.parserVersion' "$TMP/parser-status.json")"


# Build only the exact three verified source files, over the proven live v210 image.
git archive "$CANDIDATE" -- "$PREFIX/src" "$PREFIX/data" \
  "$PREFIX/package.json" "新システム開発/deploy/check-explanation.mjs" | tar -xf - -C "$TMP"
project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$project_number" == "$PROJECT_NUMBER" ]] || die 'unexpected project number'
gcloud run revisions describe "$PRIOR" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/prior-revision.json"
current_image="$(jq -er '.status.imageDigest' "$TMP/prior-revision.json")"
image_path="$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$SERVICE"
[[ "$current_image" == "$image_path@$PRIOR_DIGEST" ]] || die 'serving image differs from the verified overlay parent digest'
gcloud artifacts repositories describe cloud-run-source-deploy --project "$PROJECT" --location "$REGION" \
  --format='value(format)' | grep -qx DOCKER
mkdir "$TMP/build"
{
  printf 'FROM %s\n' "$current_image"
  for n in mcp.js widget-current.js widget-v211.js; do
    git show "$CANDIDATE:$PREFIX/src/$n" > "$TMP/build/$n"
    printf 'COPY ["%s","/app/src/%s"]\n' "$n" "$n"
  done
} > "$TMP/build/Dockerfile"
build_tag="$image_path:$TAG"
build_bucket="run-sources-$PROJECT-$REGION"
gcloud storage buckets describe "gs://$build_bucket" --raw --project "$PROJECT" --format=json > "$TMP/build-bucket.json"
jq -e --arg n "$project_number" --arg region "$REGION" '
  ((.project_number // .projectNumber)|tostring)==$n and (.location|ascii_downcase)==$region' \
  "$TMP/build-bucket.json" >/dev/null || die 'existing staging bucket ownership/region not verified'
say "Verified prior image $PRIOR_DIGEST. Building exact three-file v211 overlay."
build_id="$(gcloud builds submit "$TMP/build" --project "$PROJECT" --region "$REGION" \
  --gcs-source-staging-dir "gs://$build_bucket/ci-q018/source" \
  --gcs-log-dir "gs://$build_bucket/ci-q018/logs" --tag "$build_tag" --async --format='value(id)' --quiet)"
[[ "$build_id" =~ ^[0-9a-f-]{36}$ ]] || die 'unexpected Cloud Build identifier'
say "Cloud Build $build_id submitted; no Cloud Run writes yet."
for ((i=0;i<120;i++)); do
  gcloud builds describe "$build_id" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/build-evidence.json"
  build_status="$(jq -er --arg id "$build_id" 'select(.id==$id)|.status' "$TMP/build-evidence.json")"
  case "$build_status" in
    SUCCESS) break ;;
    QUEUED|PENDING|WORKING) sleep 5 ;;
    *) die "Cloud Build $build_id stopped with status $build_status" ;;
  esac
done
[[ "$build_status" == SUCCESS ]] || die 'Cloud Build did not reach success'
digest="$(jq -er --arg name "$build_tag" 'select(.images|index($name)!=null)|[.results.images[]|select(.name==$name)|.digest] | select(length==1) | .[0]' "$TMP/build-evidence.json")"
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ && "$digest" != "$PRIOR_DIGEST" ]] || die 'unexpected candidate digest'
image="$image_path@$digest"
resolved="$(gcloud artifacts docker images describe "$image" --project "$PROJECT" --format='value(image_summary.digest)')"
[[ "$resolved" == "$digest" ]] || die 'exact candidate digest unavailable in existing registry'
say "Verified Cloud Build $build_id and immutable digest $digest."

# Single CAS operation pins all normal traffic to the prior revision while creating the tagged revision.
read_svc "$TMP/before-create.json"
assert_state "$TMP/before-create.json" "$PRIOR" no "$PRIOR" || die 'production state changed during verification'
assert_current_config "$TMP/before-create.json" || die 'service configuration changed during verification'
jq -n --slurpfile current "$TMP/before-create.json" --arg name "$RESOURCE" \
  --arg prior "$PRIOR" --arg rev "$REV" --arg tag "$TAG" --arg image "$image" '
  { name:$name, etag:$current[0].etag,
    template:($current[0].template | .revision=$rev | .containers[0].image=$image),
    traffic:[{type:"TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",revision:$prior,percent:100},
      {type:"TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",revision:$rev,percent:0,tag:$tag}]}' > "$TMP/create.json"
STATE=creating
patch template,traffic "$TMP/create.json" staged-revision
read_svc "$TMP/staged.json"
assert_state "$TMP/staged.json" "$PRIOR" yes "$REV" || die 'staged revision not ready with prior still serving'
assert_current_config "$TMP/staged.json" || die 'unapproved template/service configuration change'
jq -e --arg image "$image" '.template.containers[0].image==$image' "$TMP/staged.json" >/dev/null
stage_url="$(jq -er --arg tag "$TAG" '.trafficStatuses[]|select(.tag==$tag)|.uri' "$TMP/staged.json")"
public_url="$(jq -er '.uri' "$TMP/staged.json")"
[[ "$stage_url" == https://"$TAG"---*.run.app && "$public_url" == https://*.run.app ]] || die 'unexpected Cloud Run service/preview URI'

QLP_TEST_TOKEN="$(gcloud secrets versions access latest --secret qlp-api-token --project "$PROJECT")"
[[ -n "$QLP_TEST_TOKEN" && "$QLP_TEST_TOKEN" != *$'\n'* ]] || die 'unable to read configured runtime token'
printf '::add-mask::%s\n' "$QLP_TEST_TOKEN"
export QLP_TEST_TOKEN
smoke() {
  local base="$1"
  QLP_BASE_URL="$base" QLP_SOURCE_ROOT="$TMP/$PREFIX/src" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
const base=process.env.QLP_BASE_URL;
const auth={authorization:'Bearer '+process.env.QLP_TEST_TOKEN};
const digest=text=>createHash('sha256').update(text).digest('hex');
const signal=()=>AbortSignal.timeout(30000);
const health=await fetch(base+'/v1/release',{signal:signal()});
assert.equal(health.status,200);
assert.equal((await health.json()).build,'2026-11-01-v164-confirmation-bank');
let id=0;
const rpc=async (method,params={})=>{
  const res=await fetch(base+'/app',{method:'POST',signal:signal(),headers:{
    authorization:'Bearer '+process.env.QLP_TEST_TOKEN,'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
  assert.equal(res.status,200);
  const x=await res.json(); assert.ok(!x.error);
  return x.result;
};
const list=await rpc('tools/list');
const desc=list.tools.find(x=>x.name==='explainSpec')?.description??'';
for(const marker of ['公式採点区分の詳説','正解肢なし','複数正解','要再照合']) assert.ok(desc.includes(marker));
assert.ok(!desc.includes('全choices・grade.correctAnswer'));
const resources=(await rpc('resources/list')).resources;
assert.equal(resources[0].uri,'ui://qlp/question-v211.html');
for(const version of [205,206,207,208,209,210,211]){
  const expected=await import(pathToFileURL(process.env.QLP_SOURCE_ROOT+'/widget-v'+version+'.js'));
  assert.ok(resources.some(item=>item.uri===expected.WIDGET_URI));
  const got=(await rpc('resources/read',{uri:expected.WIDGET_URI})).contents[0].text;
  assert.equal(digest(got),digest(expected.widgetHtml()));
  if (version===211) {
    for (const marker of ['handoffDisplayId','hoToggle','hoStatus','引継ぎデータをコピー','全文を表示','<pre id="ho"'])
      assert.ok(got.includes(marker), 'Missing v211 handoff marker');
  }
}
const missing=await fetch(base+'/v1/sessions/'+randomUUID()+'/restore?publishedExplanationOnly=1',{signal:signal(),headers:auth});
assert.equal(missing.status,404);
const init=await rpc('initialize',{protocolVersion:'2024-11-05'});
assert.ok(init.instructions.includes('公式採点区分の詳説'));
console.log('PASS v211 and immutable v205-v210 resource digests; missing strict-restore UUID denied; q018 policy retained');
JS
  # This documented read-only smoke verifies widget versions, binding and both absent E-ref
  # paths; it emits only aggregate diagnostic events and exercises a non-existent lesson ref.
  QLP_BASE_URL="$base" node "$TMP/新システム開発/deploy/check-explanation.mjs"
}
smoke "$stage_url"
say "Verified staged v211 smoke at zero normal traffic; prior still serves."
read_svc "$TMP/before-promotion.json"
assert_state "$TMP/before-promotion.json" "$PRIOR" yes "$REV" || die 'production traffic changed before promotion'
assert_current_config "$TMP/before-promotion.json" || die 'configuration changed before promotion'
jq -e --arg image "$image" '.template.containers[0].image==$image' "$TMP/before-promotion.json" >/dev/null
# Keep our temporary tag during the public smoke so rollback can verify ownership.
jq -n --arg name "$RESOURCE" --arg etag "$(jq -er '.etag' "$TMP/before-promotion.json")" \
  --arg target "$REV" --arg tag "$TAG" '
  {name:$name,etag:$etag,traffic:[{type:"TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",revision:$target,percent:100,tag:$tag}]}' > "$TMP/promote.json"
STATE=promoting
patch traffic "$TMP/promote.json" promote-exact-revision
read_svc "$TMP/promoted.json"
assert_state "$TMP/promoted.json" "$REV" yes "$REV" || die 'promotion is not confirmed'
assert_current_config "$TMP/promoted.json" || die 'configuration changed during promotion'
smoke "$public_url"
parser_smoke && [[ "$(jq -er '.parserVersion' "$TMP/parser-status.json")" == "$parser_version" ]] ||
  die 'existing parser no longer passes status/auth or version changed'
read_svc "$TMP/before-cleanup.json"
assert_state "$TMP/before-cleanup.json" "$REV" yes "$REV" || die 'unexpected traffic/tag before cleanup'
assert_current_config "$TMP/before-cleanup.json" || die 'unexpected configuration before cleanup'
traffic "$TMP/before-cleanup.json" "$REV" cleanup-preview-tag
read_svc "$TMP/final.json"
assert_state "$TMP/final.json" "$REV" no "$REV" || die 'cleanup or final routing not verified'
assert_current_config "$TMP/final.json" || die 'final configuration changed'
STATE=done
unset QLP_TEST_TOKEN
say "PASS candidate $CANDIDATE deployed as revision $REV, digest $digest, 100% traffic, tag removed; rollback revision $PRIOR."
