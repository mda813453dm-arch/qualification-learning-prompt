# 連続対話ゲートとChatGPT実機確認記録（2026-10-13）

## 対象と保護条件
- 対象ブランチ：`ai-learning-system`
- 対象要件：ユーザー提供のClaude監査意見（監査記録v31〜v34の失敗傾向と4条件）
- `main` と既存 `master_prompt.txt` は変更しない。
- `master_prompt.txt` のblob SHAはmainとai-learning-systemの両方で `c627c91b78dcd739e5e2f78a726301fa7a0b380f`。
- コードテストと実ChatGPT試験を分け、未確認を合格としない。

## 2026-10-13の再監査・修正
- 以前の「全JavaScriptテストおよびPython統合テスト success」という記載は、JavaScriptテスト全体のPASSを意味していなかった。以前のworkflowはnpmテスト群を実行しておらず、記載を訂正した。
- `.github/workflows/qualification-system-tests.yml` を更新し、`tests/**` とnpm設定ファイルをpush triggerに追加。Node依存（pdfjs-dist）を導入し、Python統合テストと全JavaScriptテストをCIで実行する。
- `新システム開発/package.json` の `npm test` を `node --test src/*.test.js tests/*.test.js` に変更し、別実行されていたsource testも同じTAP集計へ含めた。
- 統一後のRun [38365071560](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38365071560)（head `1a9f19d4ed4a0dfa69ebeac69b9a3932005999a1`）：209件、169 PASS、35 FAIL、5 SKIP。Python統合テストとpdfjs-distによるPDF本文抽出はPASS。Actions全体はFAIL。
- 現在確認したブランチ先頭 `6737212589b6697cf2c4de40ab8e085128e57365`（`6737212`）に対応するActions runは0件（GitHub Actions APIの `head_sha` 検索結果）。このコミットは監査記録Markdownのみを変更しており、workflowのpush pathsには監査記録が含まれないため自動実行されていない。したがってRun 38365071560の結果を6737212のCI結果として扱わない。6737212以降の新しいCI結果は未取得。
- 水野さんは共通接続方式として「外部サーバーの共通APIをChatGPT・Claude等から呼び出す」を選択した。新規の有料サーバー／従量課金APIを必須にしない既存条件を維持する。
- この決定に基づき `src/cross-ai-learning-api.js` を追加。Node標準HTTPサーバー用アダプターと共通REST controllerを提供し、セッション開始、表示受領、サーバー側次問prefetch、回答、解説、質問、次問commit等を扱う。AIが設問・正答・次問packetをリクエスト本文から注入する入力は拒否し、画像は別チャット／AIでも参照できるHTTPS PNGに限定する。
- 認証、セッション保存、初問生成、次問候補取得はサーバー所有アダプターとして必須。未設定でのAPI起動を拒否し、初問／次問payloadが不完全ならfail closed。これらの本番アダプター、ホスト、AIクライアント接続、PDF添付受け渡しは未実装・未配備であり、今回のファイルだけでは学習システムは稼働しない。
- Run [38368426026](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38368426026)（head `5d09a125072312306f6402cdf68f515040f93782`）：216件、176 PASS、35 FAIL、5 SKIP。追加した共通APIテスト7件はPASS。CIログで35件すべてが `PIPELINE_CONFIGURATION_REQUIRED` と確認。Actions全体はFAIL。
- このRunの35件は、resolver/payload builder等の本番依存が未供給の従来テスト群。追加APIのテストはテスト専用fake flow・session adapterを用いたAPI境界検査であり、本番依存の実装やChatGPT/Claude実接続の証拠ではない。

- 35件は9ファイル（guarded-practice-controller、legacy-pipeline-factory、official-entry-span-integration、official-practice-controller、official-practice-entry、official-registry-identity、official-retrieval-pipeline、pdf-bound-practice-entry、provenance-checked-pipeline）にあり、全て `PIPELINE_CONFIGURATION_REQUIRED`。
- `resolveCandidates` と `buildInlinePayload` は本番実装が未存在。`src/official-retrieval-pipeline.js` 26–43行でサーバー所有の関数依存として受け取り、未供給なら設定エラーにする。公開入口群からこれらの依存を転送する配線は追加済みだが、それ自体は関数本体・候補台帳・payload builderの実装ではない。テスト内のスタブは `src/official-retrieval-pipeline.test.js` 11行・34行等だけで、本番依存として数えない。35件は未解消であり、期待値変更・安全ゲート緩和でPASSにしていない。
- question-bundle-gateの異常系9件は、fixtureに必須の `studyUnitId` と承認済み計画hashがなかったため、先行して `STUDY_UNIT_MISMATCH` になっていた。fixtureに正しいbindingを追加し、それぞれの検査まで到達するよう修正済み。
- ローカル報告は209件、168 PASS／36 FAIL／5 SKIPで、失敗の1件はpdfjs-dist不足。CIの209件、169 PASS／35 FAIL／5 SKIPとの差は1件で、CIではpdfjs-dist抽出がPASSしたという報告と一致する。ローカルのcheckout内容そのものはこの環境から独立検証していない。
- CI件数198とローカル209の差は、CIが別扱いだったsrcの11テストを統合集計へ含めなかった実行範囲の差だった。現在のCIは同じ209件を集計している。
- `新システム開発/integration/cross_ai_figure_service/openapi.yaml` は `Cross-AI Official PDF Figure API`（添付PDFから図を抽出するAPI）のOpenAPIで、9–10行のserver URLは `https://YOUR-DEPLOYED-HOST` のまま。これは図表抽出APIの公開先記載であり、学習ランタイムのOpenAPIではない。学習セッション、候補解決、公式採点、解説、次問遷移を提供するランタイムの接続・配備は確認できていない。

## 変更範囲の分類
- 本番コード（今回追加）：`src/cross-ai-learning-api.js`。共通HTTP/JSON API境界とNode標準HTTP adapter。実行に必要な認証・session・学習pipelineは注入必須で、未設定では停止。
- 本番コード（過去の依存受け渡し配線のみ）：`src/provenance-checked-pipeline.js`、`src/guarded-practice-controller.js`、`src/official-practice-controller.js`、`src/official-practice-entry.js`、`src/pdf-bound-practice-entry.js`、`src/legacy-pipeline-factory.js`。候補解決関数・表示payload builder本体や稼働ランタイムは追加していない。
- テスト専用：`src/question-bundle-gate.test.js` のfixtureへ必須bindingを追加。検査目的・期待値の緩和はしていない。
- CI/テスト設定：`package.json` の全JSテスト統合実行、`.github/workflows/qualification-system-tests.yml` のCI実行範囲・依存導入。
- 監査記録：本ファイル。結果と未達条件の記録のみ。

## Claude提示の4条件に対する現状
| 条件 | 結果 | 根拠 |
|---|---|---|
| 1. プログラム未呼出しでは次へ進ませない | 未達 | 共通API adapterは追加したが、認証・session・学習pipeline未供給で未配備。ChatGPT／Claudeから必ず呼ぶ接続はない。 |
| 2. 正答・次問をAIに生成させない | 部分実装 | 固定packetを使うコードはある。公開入口の実依存設定とAI会話全体への強制接続は未完了。 |
| 3. 実行結果と表示文の不一致をFAIL記録 | 一部コードテストPASS | APIのcomplete payload検証と表示receipt検証をテスト。実AI送信文を独立取得する接続はなく、実表示差分の監査は未達。 |
| 4. 実ChatGPTで同じ手順を複数回確認 | 未実施（0回） | 学習ランタイムの接続がなく、問29・問30の実行可能な入力データもそろっていない。 |

総合判定：**未合格**。Actions全体がFAILで、4条件の実機証拠もない。

## 未決定事項（水野さん決定待ち。採否・推奨なし）
1. ChatGPT通常会話とClaude等で共通に使う実行接続方式。
2. ランタイムの公開先、認証方式、セッション保存。
3. 各AIクライアントから現会話のPDF添付をランタイムへ渡す方式。
4. `resolveCandidates`（承認済み候補台帳）と `buildInlinePayload`（表示payload）の実装・運用環境。
5. 問29・問30の対象資格・単元・年度、公式問題・正答の入力元、反復試験で固定する回答・説明の手順。

## 次の検証ゲート
1. 上記未決定事項が決まり、承認済み計画・同一単元候補列・完全表示payload builderを実装した後、本番と同じ依存を明示して35件の既存テストを実行する。期待値や安全ゲートは変更しない。
2. 本番ランタイムを接続し、プログラム未呼出しでは採点・解説・次問へ進めないことをエンドツーエンドで確認する。
3. 接続とデータ準備後に、問29回答→公式採点→解説→問30完全表示をChatGPTで複数回実行する。各回の日時、呼出ログ、プログラム出力、AI表示本文、差分、PASS/FAILを記録する。
4. 実機反復完了まで総合合格・フェーズ完了にしない。
