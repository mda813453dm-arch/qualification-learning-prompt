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
  firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com

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
LIFECYCLE="$(mktemp)"
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":2}}]}' > "$LIFECYCLE"
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$LIFECYCLE" >/dev/null

echo "== 4/7 トークン（自動で作成し、Secret Manager に保存）"
for name in qlp-api-token qlp-parser-token; do
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    openssl rand -hex 32 | tr -d '\n' | gcloud secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
  fi
done

echo "== 5/7 権限（プログラムが Firestore・Cloud Storage・トークンを使えるようにする）"
# cloudbuild.builds.builder：新しいプロジェクトでは、プログラムの組み立て（Cloud Build）にもこのアカウントが使われるため
for role in roles/datastore.user roles/secretmanager.secretAccessor roles/cloudbuild.builds.builder roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUNTIME_SA" --role="$role" --condition=None >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectAdmin >/dev/null

echo "== 6/7 分解サーバー（qlp-parser）を配置（初回は10分ほどかかります）"
gcloud run deploy qlp-parser --source "$ROOT/parser" --region "$REGION" --allow-unauthenticated \
  --cpu 2 --memory 2Gi --timeout 300 --max-instances 2 --concurrency 4 \
  --set-secrets PARSER_TOKEN=qlp-parser-token:latest --quiet
PARSER_URL="$(gcloud run services describe qlp-parser --region "$REGION" --format='value(status.url)')"

echo "== 7/7 学習エンジン（qlp-engine）を配置"
gcloud run deploy qlp-engine --source "$ROOT/engine" --region "$REGION" --allow-unauthenticated \
  --cpu 1 --memory 512Mi --timeout 300 --max-instances 3 \
  --set-env-vars "FIGURE_BUCKET=$BUCKET,PARSER_URL=$PARSER_URL" \
  --set-secrets API_TOKEN=qlp-api-token:latest,PARSER_TOKEN=qlp-parser-token:latest --quiet
ENGINE_URL="$(gcloud run services describe qlp-engine --region "$REGION" --format='value(status.url)')"
gcloud run services update qlp-engine --region "$REGION" --update-env-vars "PUBLIC_BASE_URL=$ENGINE_URL" --quiet >/dev/null

# ChatGPT の GPT に貼る API 定義（URL を書き込んだもの）
sed "s#https://REPLACE-WITH-CLOUD-RUN-URL#$ENGINE_URL#" "$ROOT/engine/openapi.yaml" > "$HOME/qlp-openapi.yaml"

echo
echo "完了しました。"
echo "  学習エンジンのURL：$ENGINE_URL"
echo "  GPTに貼るAPI定義：  cloudshell edit ~/qlp-openapi.yaml で開いて、全文をコピー"
echo "  GPTに入れるトークン：次のコマンドで表示（チャットには貼らないでください）"
echo "    gcloud secrets versions access latest --secret=qlp-api-token; echo"
echo "  Claude・Perplexity に登録するURL（MCP）：次のコマンドで表示（トークン入りなのでチャットには貼らないでください）"
echo "    echo $ENGINE_URL/mcp/\$(gcloud secrets versions access latest --secret=qlp-api-token)"
echo
echo "動作確認：curl -s $PARSER_URL/healthz   （\"ocr\": true なら日本語OCRが使えます）"
