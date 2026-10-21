#!/usr/bin/env bash
# 資格学習システムを Google Cloud（東京リージョン）に配置する。Google Cloud の「Cloud Shell」で実行する。
#
#   bash 新システム開発/deploy/cloudshell-deploy.sh
#
# 何度実行してもよい（作成済みのものはそのまま使い、プログラムだけ更新する）。
# トークンはこのスクリプトが自動で作り、Secret Manager に保存する。画面やチャットには出さない。
set -euo pipefail

REGION="asia-northeast1"
PROJECT="$(gcloud config get-value project 2>/dev/null)"
if [ -z "$PROJECT" ]; then
  echo "プロジェクトが選ばれていません。画面上部でプロジェクトを選んでから、もう一度実行してください。" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUCKET="${PROJECT}-qlp-figures"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "== 1/7 必要な機能を有効にする（初回は数分かかります）"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com vision.googleapis.com

echo "== 2/7 Firestore（データベース）"
if ! gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  gcloud firestore databases create --location="$REGION" --type=firestore-native
fi
# 24時間保存の掃除用（期限切れの判定自体はプログラムが行う）
gcloud firestore fields ttls update expireAt --collection-group=qlp --enable-ttl --async >/dev/null 2>&1 || true

echo "== 3/7 図の保存場所（Cloud Storage）"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
fi
# 学習者ごとの図は期限なしで持つため、自動削除の設定はしない（以前の設定があれば外す）
gcloud storage buckets update "gs://$BUCKET" --clear-lifecycle >/dev/null 2>&1 || true

echo "== 4/7 トークン（自動で作成し、Secret Manager に保存）"
for name in qlp-api-token qlp-parser-token; do
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    openssl rand -hex 32 | tr -d '\n' | gcloud secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
  fi
done

echo "== 5/7 権限（プログラムが Firestore・Cloud Storage・トークンを使えるようにする）"
# cloudbuild.builds.builder：新しいプロジェクトでは、プログラムの組み立て（Cloud Build）にもこのアカウントが使われるため
# serviceusage.serviceUsageConsumer：紙をスキャンしたページの文字を Google Cloud Vision で読むため
for role in roles/datastore.user roles/secretmanager.secretAccessor roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/logging.logWriter roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUNTIME_SA" --role="$role" --condition=None >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectAdmin >/dev/null

echo "== 6/7 分解サーバー（qlp-parser）を配置（初回は10分ほどかかります）"
# 分解サーバーのプログラムが前回の配置から変わっていなければ、組み立て直さない（時間と費用を使わないため）
PARSER_SRC="$(cd "$ROOT/parser" && find qlp_parser Dockerfile requirements.txt -type f -not -name '*.pyc' | sort | xargs sha1sum | sha1sum | cut -c1-16)"
PARSER_MARK="gs://$BUCKET/deploy/parser-src.txt"
DEPLOYED_SRC="$(gcloud storage cat "$PARSER_MARK" 2>/dev/null || true)"
# 追跡印がなければ、古いサーバーを現行コードと推定せず必ずビルドする。
# 偽の印を先に記録すると原本PDFを処理できない旧解析器が残るため、印はヘルス検査後だけ更新する。
if [ -z "$DEPLOYED_SRC" ]; then
  echo "分解サーバーの配置履歴がないため、必ず現在のコードを配置します"
fi
if [ "$DEPLOYED_SRC" = "$PARSER_SRC" ]; then
  echo "分解サーバーのプログラムは変わっていないので、配置し直しません"
else
  gcloud run deploy qlp-parser --source "$ROOT/parser" --region "$REGION" --allow-unauthenticated \
    --cpu 2 --memory 2Gi --timeout 900 --max-instances 2 --concurrency 4 \
    --set-env-vars "QLP_OCR=vision,OCR_CACHE_BUCKET=$BUCKET" \
    --set-secrets PARSER_TOKEN=qlp-parser-token:latest --quiet
fi
PARSER_URL="$(gcloud run services describe qlp-parser --region "$REGION" --format='value(status.url)')"
# 新しい解析器の公開前検査。404や接続失敗を無視してエンジンだけ配置すると、
# 学習画面で「問題を準備しています」を繰り返すので、この段階で止める。
PARSER_HEALTH_STATUS=""
for TRY in 1 2 3; do
  PARSER_HEALTH_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$PARSER_URL/healthz" || true)"
  if [ "$PARSER_HEALTH_STATUS" = "200" ]; then break; fi
  echo "分解サーバー待機：HTTP ${PARSER_HEALTH_STATUS:-unknown}（${TRY}/3）"
  sleep 5
done
if [ "$PARSER_HEALTH_STATUS" != "200" ]; then
  echo "ERROR: 分解サーバーの/healthzが成功しません（HTTP ${PARSER_HEALTH_STATUS:-unknown}）。学習エンジンは配置しません。" >&2
  exit 1
fi
echo "分解サーバーの健康状態：HTTP 200"
# 新しい分解サーバーを確認できた後だけ、配置済みコードの印を更新する。
if [ "$DEPLOYED_SRC" != "$PARSER_SRC" ]; then
  echo "$PARSER_SRC" | gcloud storage cp - "$PARSER_MARK" >/dev/null
fi

echo "== 7/7 学習エンジン（qlp-engine）を配置"
gcloud run deploy qlp-engine --source "$ROOT/engine" --region "$REGION" --allow-unauthenticated \
  --cpu 1 --memory 512Mi --timeout 900 --max-instances 3 \
  --set-env-vars "FIGURE_BUCKET=$BUCKET,PARSER_URL=$PARSER_URL" \
  --set-secrets API_TOKEN=qlp-api-token:latest,PARSER_TOKEN=qlp-parser-token:latest --quiet
ENGINE_URL="$(gcloud run services describe qlp-engine --region "$REGION" --format='value(status.url)')"
gcloud run services update qlp-engine --region "$REGION" --update-env-vars "PUBLIC_BASE_URL=$ENGINE_URL" --quiet >/dev/null

# 学習者が貼るプロンプト（URL を書き込んだもの）
sed "s#https://REPLACE-WITH-CLOUD-RUN-URL#$ENGINE_URL#" "$ROOT/deploy/start-prompt.txt" > "$HOME/qlp-start-prompt.txt"

# ChatGPT の GPT に貼る API 定義（URL を書き込んだもの）
sed "s#https://REPLACE-WITH-CLOUD-RUN-URL#$ENGINE_URL#" "$ROOT/engine/openapi.yaml" > "$HOME/qlp-openapi.yaml"

echo
echo "完了しました。"
echo "  学習エンジンのURL：$ENGINE_URL"
echo "  学習者が貼るプロンプト：cloudshell edit ~/qlp-start-prompt.txt で開いて、全文をコピー（トークンは入っていません）"
echo "  以下は、GPT やコネクタで使う場合（通常は不要）"
echo "  GPTに貼るAPI定義：  cloudshell edit ~/qlp-openapi.yaml で開いて、全文をコピー"
echo "  GPTに入れるトークン：次のコマンドで表示（チャットには貼らないでください）"
echo "    gcloud secrets versions access latest --secret=qlp-api-token; echo"
echo "  Claude・Perplexity に登録するURL（MCP）：次のコマンドで表示（トークン入りなのでチャットには貼らないでください）"
echo "    echo $ENGINE_URL/mcp/\$(gcloud secrets versions access latest --secret=qlp-api-token)"
echo
echo "動作確認：curl -s $PARSER_URL/healthz   （\"ocr\": true なら日本語OCRが使えます）"
