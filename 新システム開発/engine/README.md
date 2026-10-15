# 学習エンジン（T4）

AIアプリから呼ばれる学習エンジン。出題順・正誤・復習・次問はここで決め、AIは返ってきた内容を表示するだけにする
（AI裁量排除、文書61）。Cloudflare Workers で動き、保存は Workers KV だけを使う（R2 はカード登録が必要なため使わない）。

## 合格条件との対応（設計計画 82_T1 §7）

| 条件 | 確かめているテスト |
|---|---|
| 5. 24時間以内は取り直さない | `test/cache-ingest.test.js`「24時間以内の2回目は…」 |
| 5. 期限後は取り直す | 同「24時間を過ぎたら…」「期限後に公式PDFが差し替わっていたら…」 |
| 5. 差し替えられた公式PDFの問は出題しない | 同「引継ぎで再開したとき…」「24時間の控えの間に…」「指定のSHA-256と違う…」 |
| 6. 問番号・本文・正答の誤結合なし | `test/engine-worker.test.js`「出題中と違う問番号の回答は採点しない」 |
| 6. 採点済みを採点保留へ戻さない | 同「採点済みの問に再回答しても…」 |
| 6. 通常採点で再検索しない | 同「経路B：…保存データを読み直さない」（採点中の読み出しがセッション1件だけであることを確認） |

```bash
npm run test:engine          # 新システム開発/ で実行
```

本物の分解結果で通しで確かめるとき（任意）：

```bash
python3 -m qlp_parser.cli --adapter surveyor --year 2026 --section main \
  --question-pdf Q.pdf --question-url https://... --answer-pdf A.pdf --answer-url https://... \
  --assets-dir out/ > out.json        # parser/ で実行
QLP_REAL_JSON=out.json QLP_REAL_ASSETS=out QLP_REAL_Q=Q.pdf QLP_REAL_A=A.pdf node --test engine/test/real-result.test.js
```

## 仕組み

- **24時間保存**（`src/cache.js`）：分解結果・図のPNG・公式PDFのSHA-256の控えを保存する。期限はプログラムが判定し、
  KV の自動削除（26時間）は掃除用。キーに利用者IDは入れない。PDF本体は保存しない。
- **取り込み**（`src/ingest.js`）：公式PDFを取得 → SHA-256 → 保存があれば使う → 無ければ分解 → 検査 → 保存。
  1回の呼び出しで時間の許す分だけ進め（既定15秒）、20秒を過ぎると利用者向けの案内文を付ける。
  1つのPDFが失敗しても、ほかは続ける。届いた分解結果は経路を問わず検査し、形の崩れた問はその問だけ外す。
- **分解の経路**（`src/parser-client.js`）
  - 経路A：`PARSER_URL` が無いとき。アプリが分解して `POST /v1/jobs/:qid/sources/:index/result` で送る。
    エンジンは公式PDFのSHA-256と照合してから受け取る。
  - 経路B：`PARSER_URL` があるとき。Cloud Run の分解サーバー（T5）に公式PDFを渡す。
- **出題・採点**（`src/engine.js`）：出題時に正答と出典を控え、採点はその控えだけで行う。出題に正答は入れない。
  OCRで読んだ問には「読み違いがある場合がある・原本は公式PDF」の案内を付ける。
- **引継ぎ**（`src/handoff.js`）：問題本文を入れない `qlp-handoff-v1`。再開時に公式PDFのSHA-256を照合し、
  差し替え・削除された問は出題せず理由を返す。

## API（`src/worker.js`）

図の取得以外は `Authorization: Bearer <API_TOKEN>` が必要。

| メソッド・パス | 内容 |
|---|---|
| `POST /v1/sessions` | `{qualificationId, sources:[{adapter, year, section, questionUrl, answerUrl}], plan}` 取り込み開始・セッション作成 |
| `POST /v1/sessions/:id/next` | 次の問（`status`: question / waiting / finished） |
| `POST /v1/sessions/:id/answer` | `{questionId, value, confidence}` 採点 |
| `GET /v1/sessions/:id/handoff` | 引継ぎデータ |
| `POST /v1/handoff/import` | `{handoff, sources}` 引継ぎから再開 |
| `GET /v1/jobs/:qid` | 取り込みの状況（進める） |
| `POST /v1/jobs/:qid/sources/:index/result` | 経路A：分解結果 `{result, assets:{file: base64}}` |
| `GET /v1/figure/:qsha/:pv/:file` | 図のPNG（トークン不要） |

公式PDFは https だけ受け付け、取り込み元は1回40件まで。

## 公開の手順（未実施）

1. `cp wrangler.toml.example wrangler.toml`、`npx wrangler kv namespace create QLP_CACHE` の id を書く
2. `npx wrangler secret put API_TOKEN`
3. `npx wrangler deploy`

KV の無料枠は書き込み1日1,000回。1問あたり2回（出題・採点）、取り込みは図の数＋数回なので、
開発中の1人利用なら足りる見込み。超える場合は Workers 有料プラン（月5ドル）。
