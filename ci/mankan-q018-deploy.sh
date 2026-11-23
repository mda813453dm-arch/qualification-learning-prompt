#!/usr/bin/env bash
# DRAFT ONLY: must be reviewed in context of current Cloud Run config and approved CI.
set -eEuo pipefail
umask 077
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
export CLOUDSDK_CORE_DISABLE_USAGE_REPORTING=true
PROJECT=qualification-learning
REGION=asia-northeast1
SERVICE=qlp-engine
PRIOR=qlp-engine-00807-9bp
CANDIDATE=4e3fb751c1a88ad2fd50aecd9b3e940e0903cc81
RESOURCE="projects/$PROJECT/locations/$REGION/services/$SERVICE"
API=https://run.googleapis.com/v2
PREFIX="新システム開発/engine"
TMP="$(mktemp -d)"
TAG="q018-$(openssl rand -hex 5)"
REV="$SERVICE-$TAG"
STATE=untouched

say() { printf '%s\n' "$*"; }
die() { say "STOP: $*" >&2; exit 1; }
http() {
  local method="$1" url="$2" dst="$3" body="${4:-}" auth code
  auth="$(gcloud auth print-access-token)"
  local args=(--silent --show-error --max-time 35 -X "$method" -o "$dst" -w '%{http_code}' "$url")
  if [[ -n "$body" ]]; then args+=(-H 'Content-Type: application/json' --data-binary "@$body"); fi
  code="$(printf 'header = "Authorization: Bearer %s"\n' "$auth" | curl --config - "${args[@]}")"
  unset auth
  if ! [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    say "Cloud Run API $method failed HTTP $code (response suppressed)" >&2
    return 1
  fi
}
read_svc() { http GET "$API/$RESOURCE" "$1"; }
wait_op() {
  local p="$1" name
  if jq -e '.done == true' "$p" >/dev/null; then
    jq -e 'has("error")|not' "$p" >/dev/null
    return
  fi
  name="$(jq -er '.name' "$p")"
  [[ "$name" == "projects/$PROJECT/locations/$REGION/operations/"* ]] || return 1
  for ((i=0;i<120;i++)); do
    http GET "$API/$name" "$TMP/op-result.json" || return 1
    if jq -e '.done == true' "$TMP/op-result.json" >/dev/null; then
      jq -e 'has("error")|not' "$TMP/op-result.json" >/dev/null
      return
    fi
    sleep 5
  done
  return 1
}
patch() {
  local mask="$1" body="$2"
  http PATCH "$API/$RESOURCE?updateMask=$mask&allowMissing=false&validateOnly=true" "$TMP/op-validate.json" "$body" &&
    wait_op "$TMP/op-validate.json" &&
    http PATCH "$API/$RESOURCE?updateMask=$mask&allowMissing=false" "$TMP/op.json" "$body" &&
    wait_op "$TMP/op.json"
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
  patch traffic "$TMP/traffic.json"
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
         assert_state "$TMP/failure.json" "$REV" yes "$REV" &&
         assert_current_config "$TMP/failure.json"; then
        say "Post-promotion check failed; rolling back to $PRIOR and removing candidate tag"
        traffic "$TMP/failure.json" "$PRIOR" && read_svc "$TMP/rolledback.json" &&
          assert_state "$TMP/rolledback.json" "$PRIOR" no "$REV" ||
          say "MANUAL CHECK REQUIRED: rollback was not verified" >&2
      elif assert_state "$TMP/failure.json" "$PRIOR" yes "$REV" &&
           assert_current_config "$TMP/failure.json"; then
        say "Production traffic stayed on $PRIOR; removing candidate tag"
        traffic "$TMP/failure.json" "$PRIOR" && read_svc "$TMP/rolledback.json" &&
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
read_svc "$TMP/prior.json"
assert_state "$TMP/prior.json" "$PRIOR" no "$PRIOR" || die 'prior ready revision/traffic/tag invariant not met'
jq -e '(.template.containers|length)==1' "$TMP/prior.json" >/dev/null || die 'expected one engine container'
normal_config "$TMP/prior.json" > "$TMP/prior-config.json"

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

# Check-explanation imports the exact candidate Widget implementation locally.
# This archive is NOT the build context; the cloud build receives only the changed files.
git archive "$CANDIDATE" -- "$PREFIX/src" "$PREFIX/data" \
  "$PREFIX/package.json" "新システム開発/deploy/check-explanation.mjs" | tar -xf - -C "$TMP"
gcloud run revisions describe "$PRIOR" --project "$PROJECT" --region "$REGION" --format=json > "$TMP/prior-revision.json"
current_image="$(jq -er '.status.imageDigest' "$TMP/prior-revision.json")"
expected_repo="$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy"
[[ "$current_image" == "$expected_repo/"*'@sha256:'* ]] || die 'unexpected current image/repository'
image_path="${current_image%@*}"
[[ "$image_path" == "$expected_repo/$SERVICE" ]] || die 'unexpected engine image name'
gcloud artifacts repositories describe cloud-run-source-deploy --project "$PROJECT" --location "$REGION" \
  --format='value(name)' >/dev/null
# Build an overlay on the currently serving digest, not a fresh npm/base image.
# Thus the three validated source files are the only changed container filesystem inputs.
[[ "$current_image" =~ @sha256:[0-9a-f]{64}$ ]] || die 'current image digest is not immutable'
mkdir "$TMP/build"
for n in app.js explain.js mcp.js; do
  git show "$CANDIDATE:$PREFIX/src/$n" > "$TMP/build/$n"
done
printf 'FROM %s\nCOPY ["app.js","/app/src/app.js"]\nCOPY ["explain.js","/app/src/explain.js"]\nCOPY ["mcp.js","/app/src/mcp.js"]\n' \
  "$current_image" > "$TMP/build/Dockerfile"
build_tag="$image_path:$TAG"
# Existing Cloud Run source deployment bucket only; fail before staging rather
# than let Cloud Build implicitly create default staging/log buckets.
build_bucket="run-sources-$PROJECT-$REGION"
project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$project_number" =~ ^[0-9]+$ ]] || die 'cannot confirm project number'
gcloud storage buckets describe "gs://$build_bucket" --raw --project "$PROJECT" --format=json > "$TMP/build-bucket.json"
jq -e --arg n "$project_number" --arg region "$REGION" '
  ((.project_number // .projectNumber)|tostring)==$n and (.location|ascii_downcase)==$region' \
  "$TMP/build-bucket.json" >/dev/null || die 'existing staging bucket ownership/region not verified'
gcloud builds submit "$TMP/build" --project "$PROJECT" --region "$REGION" \
  --gcs-source-staging-dir "gs://$build_bucket/ci-q018/source" \
  --gcs-log-dir "gs://$build_bucket/ci-q018/logs" --tag "$build_tag" --quiet
digest="$(gcloud artifacts docker images describe "$build_tag" --project "$PROJECT" --format='value(image_summary.digest)')"
[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die 'cannot pin built image digest'
image="$image_path@$digest"
[[ "$image" != "$current_image" ]] || die 'candidate image digest unexpectedly equals existing release'

# Single CAS operation pins all normal traffic to the prior revision while creating the tagged revision.
read_svc "$TMP/before-create.json"
assert_state "$TMP/before-create.json" "$PRIOR" no "$PRIOR" || die 'production state changed during build'
assert_current_config "$TMP/before-create.json" || die 'service configuration changed during build'
jq -n --slurpfile current "$TMP/before-create.json" --arg name "$RESOURCE" \
  --arg prior "$PRIOR" --arg rev "$REV" --arg tag "$TAG" --arg image "$image" '
  { name:$name, etag:$current[0].etag,
    template:($current[0].template | .revision=$rev | .containers[0].image=$image),
    traffic:[{type:"TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",revision:$prior,percent:100},
      {type:"TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",revision:$rev,percent:0,tag:$tag}]}' > "$TMP/create.json"
STATE=creating
patch template,traffic "$TMP/create.json"
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
  QLP_BASE_URL="$base" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const base=process.env.QLP_BASE_URL;
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
const init=await rpc('initialize',{protocolVersion:'2024-11-05'});
assert.ok(init.instructions.includes('公式採点区分の詳説'));
console.log('PASS endpoint release metadata and revised q018 policy');
JS
  # This documented read-only smoke verifies widget versions, binding and both absent E-ref
  # paths; it emits only aggregate diagnostic events and exercises a non-existent lesson ref.
  QLP_BASE_URL="$base" node "$TMP/新システム開発/deploy/check-explanation.mjs"
}
smoke "$stage_url"
read_svc "$TMP/before-promotion.json"
assert_state "$TMP/before-promotion.json" "$PRIOR" yes "$REV" || die 'production traffic changed before promotion'
assert_current_config "$TMP/before-promotion.json" || die 'configuration changed before promotion'
jq -e --arg image "$image" '.template.containers[0].image==$image' "$TMP/before-promotion.json" >/dev/null
# Keep our temporary tag during the public smoke so rollback can verify ownership.
jq -n --arg name "$RESOURCE" --arg etag "$(jq -er '.etag' "$TMP/before-promotion.json")" \
  --arg target "$REV" --arg tag "$TAG" '
  {name:$name,etag:$etag,traffic:[{type:"TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",revision:$target,percent:100,tag:$tag}]}' > "$TMP/promote.json"
STATE=promoting
patch traffic "$TMP/promote.json"
read_svc "$TMP/promoted.json"
assert_state "$TMP/promoted.json" "$REV" yes "$REV" || die 'promotion is not confirmed'
assert_current_config "$TMP/promoted.json" || die 'configuration changed during promotion'
smoke "$public_url"
parser_smoke && [[ "$(jq -er '.parserVersion' "$TMP/parser-status.json")" == "$parser_version" ]] ||
  die 'existing parser no longer passes status/auth or version changed'
read_svc "$TMP/before-cleanup.json"
assert_state "$TMP/before-cleanup.json" "$REV" yes "$REV" || die 'unexpected traffic/tag before cleanup'
assert_current_config "$TMP/before-cleanup.json" || die 'unexpected configuration before cleanup'
traffic "$TMP/before-cleanup.json" "$REV"
read_svc "$TMP/final.json"
assert_state "$TMP/final.json" "$REV" no "$REV" || die 'cleanup or final routing not verified'
assert_current_config "$TMP/final.json" || die 'final configuration changed'
STATE=done
unset QLP_TEST_TOKEN
say "PASS candidate $CANDIDATE deployed as revision $REV, digest $digest, 100% traffic, tag removed; rollback revision $PRIOR."
