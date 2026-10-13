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
- コミット `6737212` と監査記録更新コミット `bbf1c33` は監査記録Markdownだけを変更し、各headに対応するCI runはなかった。`1a9f19d` から `bbf1c33` へのGitHub比較結果でも変更は監査記録1ファイルのみ。後続のコードコミット `5d09a12` と `c354068` ではActionsが実行されているため、Run 38365071560をそれらのCI結果としては扱わない。
- 水野さんは共通接続方式として「外部サーバーの共通APIをChatGPT・Claude等から呼び出す」を選択した。新規の有料サーバー／従量課金APIを必須にしない既存条件を維持する。
- この決定に基づき `src/cross-ai-learning-api.js` を追加。Node標準HTTPサーバー用アダプターと共通REST controllerを提供し、セッション開始、表示受領、サーバー側次問prefetch、回答、解説、質問、次問commit等を扱う。AIが設問・正答・次問packetをリクエスト本文から注入する入力は拒否し、画像は別チャット／AIでも参照できるHTTPS PNGに限定する。
- 認証、セッション保存、初問生成、次問候補取得はサーバー所有アダプターとして必須。未設定でのAPI起動を拒否し、初問／次問payloadが不完全ならfail closed。これらの本番アダプター、ホスト、AIクライアント接続、PDF添付受け渡しは未実装・未配備であり、今回のファイルだけでは学習システムは稼働しない。
- Run [38368426026](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38368426026)（head `5d09a125072312306f6402cdf68f515040f93782`）：216件、176 PASS、35 FAIL、5 SKIP。追加した共通APIテスト7件はPASS。CIログで35件すべてが `PIPELINE_CONFIGURATION_REQUIRED` と確認。Actions全体はFAIL。
- OpenAPI契約追加後のhead `c354068e307ca74e862bbd4dfb74bb53cb49bb05` では、Run [38368750431](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38368750431)（run number 198）のJS全件結果が216件、176 PASS、35 FAIL、5 SKIP。ログ上の35件はすべて `PIPELINE_CONFIGURATION_REQUIRED`。別workflowのRun [38368750527](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38368750527)（run number 64、official-pdf-integration）はSUCCESS。
- `integration/cross_ai_learning_runtime/openapi.yaml` を追加し、共通RESTのsession/action契約を記載。hostは仮値、認証schemeは未選択を明記。YAML構文をローカルでparseしてPASS確認した。
- APIテストはテスト専用fake flow・session adapterを用いたAPI境界検査であり、本番依存の実装やChatGPT/Claude実接続の証拠ではない。

- 35件は9ファイル（guarded-practice-controller、legacy-pipeline-factory、official-entry-span-integration、official-practice-controller、official-practice-entry、official-registry-identity、official-retrieval-pipeline、pdf-bound-practice-entry、provenance-checked-pipeline）にあり、全て `PIPELINE_CONFIGURATION_REQUIRED`。
- `resolveCandidates` と `buildInlinePayload` の本番境界を `src/official-runtime-dependencies.js` に追加した。候補解決は注入された承認済み計画と既存公式候補ソースを照合し、現行 `official-pdf-pins.js` のPDF URL・SHA-256一致を必須にする。表示payloadは既存Bundle compilerを呼び、完全なordered payloadとHTTPS PNG参照を検査し、PNG実体を再取得してMIME・PNG signature・SHA-256を照合する。候補ソースとcompilerの運用実体はまだ設定されておらず、現行固定台帳にも単元別候補対応行がないため、この関数群だけでは候補を返さずfail closedとなる。
- question-bundle-gateの異常系9件は、fixtureに必須の `studyUnitId` と承認済み計画hashがなかったため、先行して `STUDY_UNIT_MISMATCH` になっていた。fixtureに正しいbindingを追加し、それぞれの検査まで到達するよう修正済み。
- 以前のローカル報告は209件、168 PASS／36 FAIL／5 SKIPで、失敗の1件はpdfjs-dist不足という報告だった。今回のCIはAPIテスト7件を含め216件。現時点でこの環境では、最新ブランチ全体のローカル一括実行はできていない。
- 過去のCI198件と209件の差は、source test 11件を統合した実行範囲の差として整理済み。現行CI件数はAPI test追加後の216件。
- `integration/cross_ai_figure_service/openapi.yaml` は添付PDFから図を抽出するAPIの仕様で、server URLは仮値。別途 `integration/cross_ai_learning_runtime/openapi.yaml` を共通学習REST契約として追加した。後者もhostは仮値で認証scheme未設定のため、クライアントへ登録・本番接続する状態ではない。学習セッション、候補解決、公式採点、解説、次問遷移を提供する本番ランタイムは未配備。

## 変更範囲の分類
- 本番コード（今回追加）：`src/cross-ai-learning-api.js`。共通HTTP/JSON API境界とNode標準HTTP adapter。実行に必要な認証・session・学習pipelineは注入必須で、未設定では停止。
- API契約：`integration/cross_ai_learning_runtime/openapi.yaml`。host placeholder／auth scheme未決定の契約ひな型。
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
1. 接続方式の選択自体は決定済み：外部サーバーの共通APIをChatGPT・Claude等から呼び出す。ホスト・認証・セッション保存（新規の有料サーバー／従量課金APIを必須としない条件を含む）。
2. 各AIクライアントから現会話のPDF添付をランタイムへ渡す方式。
3. `resolveCandidates`（承認済み候補台帳）と `buildInlinePayload`（表示payload）の実装・運用環境。
4. 問29・問30の対象資格・単元・年度、公式問題・正答の入力元、反復試験で固定する回答・説明の手順。
5. 最新216件CIと以前のローカル209件の全体差分（最新ブランチでのローカル一括実行は未実施）。
6. 最新監査記録コミットとCI runのhead対応（CIはコードコミット `c354068` を検証、監査記録更新後のheadはworkflow path対象外）。

## 次の検証ゲート
1. 未決定のホスト・認証・session・添付転送を水野さんが決めた後、ChatGPTとClaudeの両方に共通APIを登録し、API呼出し結果を会話へ確実に渡す。
2. 承認済み候補台帳・payload builder・本番依存を実装し、35件の既存ゲートテストを本番と同じ依存で実行する。期待値や安全ゲートは変更しない。
3. 本番ランタイムを接続し、プログラム未呼出しでは採点・解説・次問へ進めないことをエンドツーエンドで確認する。
3. 接続とデータ準備後に、問29回答→公式採点→解説→問30完全表示をChatGPTで複数回実行する。各回の日時、呼出ログ、プログラム出力、AI表示本文、差分、PASS/FAILを記録する。
4. 実機反復完了まで総合合格・フェーズ完了にしない。


## 2026-10-13 承認作業の実装差分
- 対象ブランチの作業開始時HEAD：`920dd4b30352a4624592dfcd46cf2ca3910bface`。変更先は `ai-learning-system` のみ。
- 本番コード `src/official-runtime-dependencies.js`：候補を承認済み計画hash・資格・単元・既存PDF pinへ結び付け、順序・重複・固定年度を検証する `createResolveCandidates` を追加。該当する公式候補データがない場合は `SAME_UNIT_OFFICIAL_CANDIDATES_NOT_FOUND` で停止する。表示は既存Bundle compilerの出力を完全表示payloadとして検証し、HTTPS PNG実体を取得してMIME・PNG signature・SHA-256を照合する `createBuildInlinePayload` を追加した。
- 本番コード `src/learning-runtime-server.js` と `package.json`：環境変数 `LEARNING_RUNTIME_ADAPTER_MODULE`、`LEARNING_RUNTIME_HOST`、`PORT` から認証・セッション保存・初問生成・次問取得を提供する外部adapter moduleをロードするcomposition rootと起動scriptを追加。必須設定またはadapterが欠けると起動を拒否する。認証provider、host、session backend、PDF取込adapterの実配備設定は未提供のため、本番URLはまだない。
- テスト専用 `src/official-runtime-dependencies.test.js`：pin一致、候補なし、hash差し替え、PNG実体hash不一致、未完payloadを確認。 `src/learning-runtime-server.test.js`：未設定時停止と外部adapter読込を確認。 `src/cross-ai-learning-api-boundary.test.js`：状態機械が回答・解説・次問を許可しないAPI要求がすべて拒否されることを確認。
- ローカルで実行した4テストファイルはPASS（4 file-level pass、0 fail）。これは既存全件CIや本番候補台帳の実装確認を代替しない。既存35件は期待値変更やtest stub化をしていない。
- 実装時に現行 `official-pdf-pins.js` と候補関連ファイル一覧を再確認した。pinは土地家屋調査士2025午後の問題・正答PDF URL/hashだけを持ち、同一単元の問題ID候補台帳は存在しない。したがって候補ソースを外部adapterで設定し、既存の承認済み公式データを入力するまで、35件は本番と同じ依存でPASSと確認できない。これは記録・期待値変更・ゲート緩和では解決しない。
- 81番記録更新を含む新HEADへpush後、workflow run ID・件数・失敗内訳を追記する。実ChatGPT反復試験は0回のままとし、総合未合格を維持する。

## 水野さん決定待ち事項（選択肢・特徴のみ。推奨なし）
### A. 公開hostと認証
1. 既に保有するサーバー／ドメインに配置し、購入者ごとのBearer tokenで認証する。新規サービス費用を避けられる可能性がある一方、購入者へのtoken配布・失効管理が必要で、既存hostの保守責任を負う。
2. 無料枠のあるhostに配置し、購入者別tokenで認証する。初期費用なしで試せる場合がある一方、無料枠上限・休止・仕様変更・可用性制約があり、利用規約や最新条件の確認が必要。
3. 既存記事の購入者共有リンクを共通Bearer secretとして使う。購入者ごとの管理を省きやすい一方、リンク転送で第三者も使える可能性があり、流出時は全購入者に影響する。
4. OAuth/OIDCで利用者を認証する。個人単位の認証・失効がしやすい一方、認証provider設定、client登録、アカウント連携が必要。
### B. セッション保存
1. プロセスメモリ（無料・追加DB不要）。実装が簡単な一方、再起動で消え、複数server instance間で共有できない。
2. host上のSQLiteファイル（追加DB料金なし）。再起動後も保持できる一方、backup・ディスク永続化・同時書込・複数instance運用を管理する必要がある。
3. 既存の無料枠付きDBを利用する。host外へのbackupや複数instance共有が可能な場合がある一方、quota・free tier条件・vendor依存・将来の課金条件がある。
### C. AIクライアントから現会話PDFを渡す方法
1. AI clientのAPI toolからPDF multipart uploadを直接送る。会話内の添付を一段で渡せる一方、各clientのtool仕様・file size・binary forwarding対応が異なる。
2. 購入者が共通uploadページへPDFをアップロードし、返されたfile IDをAI clientからAPIへ渡す。client差を減らせる一方、会話から別ページへ移動する操作とfile ID管理が増える。
3. serverが公式公開URLからPDFを直接取得する。利用者のuploadが不要な一方、公式サイトの403・network制限・URL変更で停止し、会話に添付されたPDFを使わない。
4. AI clientがPDF bytesをbase64化しAPIへ送る。binary tool非対応のclientでも実装できる場合がある一方、payloadが大きくなり、転送量・request limit・変換処理の負荷が増える。
### D. 問29・問30の固定試験データ
1. 宅地建物取引士の同一単元から選ぶ。資格・単元・年度・問番号、公式問題PDF・正答資料の入力元を指定する必要がある。法律問題の根拠付き解説フローを試せる一方、今回の既存pinはこの対象の取得情報を含まない。
2. 測量士または測量士補の同一単元から選ぶ。資格・単元・年度・問番号、公式問題PDF・正答資料を指定する必要がある。図表を含む実問題で確認できる一方、図表assetの公開・hash登録と選択肢・正答の個別照合が必要。
3. 土地家屋調査士の同一単元から選ぶ。資格・単元・年度・午前午後・問番号と公式問題・正答の入力元を指定する必要がある。既存の実機確認経緯に続けられる一方、現行pinは2025午後のみで、指定する問29・30との一致を別途確認する必要がある。
4. 別の資格・単元を指定する。公式資料の取得可能性・同一単元候補・表示素材が揃うかを確認する必要がある。
いずれの案でも、問29・30の回答値、各回答後の解説要否選択、解説中の質問を入れるか、次問出題までの固定手順を水野さんが指定する。未指定の部分は試験手順に組み込まない。
