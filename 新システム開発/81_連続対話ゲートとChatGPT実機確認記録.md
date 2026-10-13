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


## 2026-10-13 CI確認（本番依存境界・composition root追加）
- GitHub Actions Run [38370990863](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38370990863)（run number 199、head `059d1794406ba81f12c6e7b27e43ddbf66aad5be`）を確認。Python統合test stepはPASS。JavaScript全件は224件、184 PASS、35 FAIL、5 SKIP。Actions全体はFAIL。
- 35 FAILはいずれも `PIPELINE_CONFIGURATION_REQUIRED`。既存テストの期待値変更やtest stubでのPASS化はしていない。追加した8件（resolver・payload・composition root・API境界）はPASS。
- mainとai-learning-systemの `master_prompt.txt` blob SHAを再照合し、双方 `c627c91b78dcd739e5e2f78a726301fa7a0b380f` で一致。mainに変更なし。
- Run #199はコードhead `059d179` を検証した。以後の本記録更新は記録ファイルのみで、CI path filter外の変更である。
- 総合判定：**未合格**。実ChatGPT反復試験は0回。composition rootとAPI境界が追加されたが、候補データを返す既存の単元別公式候補ソース、運用adapter、host・認証・session・PDF受渡しの選択と配備がないため、既存35件は未解消。選択肢A〜Dは記録したが、水野さんの決定待ち。


## 2026-10-13 17:45｜試験対象の決定と候補データ準備状況
- **水野さんの決定**：試験対象は両方。順番は (1) 土地家屋調査士 2025午後、(2) 宅地建物取引士 2025 問29→問30。
- **土地家屋調査士 2025午後の既存pin**：`src/official-pdf-pins.js` のregistry key `土地家屋調査士:2025:午後`。問題PDF `https://www.moj.go.jp/content/001450011.pdf`、SHA-256 `928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c`。正答PDF `https://www.moj.go.jp/content/001450015.pdf`、SHA-256 `3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad`。これは午後の問題・正答PDF対の固定情報であり、特定のstudyUnitId、個別questionId、当該問題の正答を特定する情報ではない。個別問題候補へ使う前に、当該PDFの対象問題・単元・正答を照合する必要がある。
- **宅建2025公式PDF**：RETIO「令和7年度問題・正解番号」PDF、<https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf>。公式PDFはWeb PDF閲覧で30ページとして開き、問題冊子の問29・問30（監査記録v34の記録ではPDF 0始まり16ページ／冊子16頁）と正答表（PDF 0始まり29ページ）を確認した。問29=2、問30=3。問29・問30の本文と選択肢は当該公式PDFに掲載されている。問題ページのテキスト抽出上、図表記載は見当たらないが、この作業ではPDF画像データの図表不存在を別途機械照合していないため「図表なし」の最終確定は未確認。
- **取得hash**：この実行環境では公式PDFをブラウザ閲覧できたが、PDFバイト列の直接downloadは実行環境のnetwork proxy接続失敗で未達。SHA-256は算出していない。推測hashは作成せず、`official-pdf-pins.js` に宅建pinを追加していない。公式Web PDFが表示できることと、バイト列を固定できることは別の確認である。
- **宅建問29（冊子16頁）**：37条書面に関する正誤問題。選択肢は、(1) 媒介による事業用宅地の賃貸借契約で当事者が宅建業者なら交付不要、(2) 自ら売主として既存建物を売買する場合に構造耐力上主要部分等の状況について当事者双方が確認した事項を記載、(3) 天災等の損害負担の定めがない場合も「定めなし」を記載、(4) 金銭貸借あっせんが不成立の場合の措置は記載不要。公式正答表は2。
- **宅建問30（冊子16頁）**：宅地建物取引業者3社が工事完了前の分譲マンション一室を個人へ売却する場合の、宅建業法違反事項数。ア〜エは順に、重要事項説明を幹事会社1社だけが行う扱い、事務所で申込み・契約した場合のクーリングオフ書面省略、規約案の重要事項説明書記載省略、500万円の手付金に関する手付金保全措置の概要の記載省略。選択肢は違反が「1つ／2つ／3つ／4つ」。公式正答表は3。本文・全肢の逐語的な実データ取込・照合は候補packet化の際に必要で、ここでは要約を新規問題文として使用しない。
- **単元 binding**：宅建問29と問30が同一の承認済みstudyUnitIdに属するかは未確認。問番号が連続していることだけで同単元と見なさない。土地家屋調査士側も、既存pinから特定の個別問29・30や単元は確定できない。
- **現行resolverの必須入力**：`createResolveCandidates` は承認済み `studyPlanSha256` と `studyUnitId` を含む行を要求し、`registryKey` とURL／hashが `OFFICIAL_PDF_PINS` に一致しなければ拒否する。よって、現時点で両試験対象を承認済み単元別候補として供給する候補レコードは未完成。候補source未設定時のfail-closedを維持し、test stubや推定ID/hashで埋めない。
- **候補台帳形式（水野さん選択待ち。採否・推奨なし）**：
  1. JSON配列（resolver rowを1候補1objectで保存）。型・入れ子データを表しやすい。一方、複数人の表計算編集や差分レビューに慣れない場合がある。
  2. NDJSON（1行1候補JSON）。追記・行単位diff・逐次検証がしやすい。一方、全体一括編集や参照整合性の確認は別処理が必要。
  3. CSV（1行1候補、resolver fieldsを列化）。表計算で確認しやすい。一方、スキーマ変更・空値・文字コード・複合データの型検証が別途必要。
  4. DB/API adapter（レコードを外部データストアから返す）。検索・更新権限・複数利用者運用を分けられる。一方、DB/APIの実装、運用設定、障害時動作が必要。
  いずれの形式でも最低限、`qualificationId, studyUnitId, studyPlanSha256, year, section, questionId, registryKey, questionPdfUrl, answerPdfUrl, questionPdfSha256, answerPdfSha256` を扱い、公式pin照合と承認済み計画照合を省略しない。形式は未選択のため候補台帳ファイルを新設していない。
- **既存35件の結果**：最新に記録済みのRun [38370990863](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38370990863) はhead `059d1794406ba81f12c6e7b27e43ddbf66aad5be`、JS 224件（184 PASS／35 FAIL／5 SKIP）、35件すべて `PIPELINE_CONFIGURATION_REQUIRED`。現在のbranchは当該headより監査記録1ファイルだけaheadであることをGitHub compareで確認した。最新run後に本番コード・テストは変わっていないため、これは同一コードのテスト結果だが、監査記録だけの新headに対応する新runではない。35件は本番同等データ依存を供給して実行した結果ではなく、依存未設定による失敗。期待値変更・安全ゲート緩和・スタブ化は行っていない。
- **宅建実データ追加後のCI**：宅建PDF pin/hashと単元別候補行が未確定のため、本番候補sourceへの追加は未実施。したがって今回、新しいCI実行は発生していない。Run 38370990863を現在headのrunとして扱わない。
- **記録更新によるhead**：この追記を含む監査記録コミットは `3414672acc97450ba76a8ce19bec34f2c2b22ecf`。比較上、`059d1794406ba81f12c6e7b27e43ddbf66aad5be` から監査記録1ファイルのみ追加変更。workflowのコードpath filter対象外なので新規CI runなし。総合判定は引き続き **未合格**。実ChatGPTでの反復試験は0回。


## 2026-10-13｜宅建2025公式PDF添付照合とSHA-256 pin
- **台帳の正本確認**：`mda813453dm-arch/shikaku-kakomon-urls` の `main/shikaku_kakomon_urls.csv` を読み、blob SHA `413b13d2a2df37beee5f0354e5806b8266209e14` を確認した。宅地建物取引士・問題・2025年度のURL欄は `https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf`。正解行は問題と同一PDF内に正解番号表を含むと記載。URL文字列は変更・再構成していない。
- **直接取得**：公式URLからPDF bytesを取得する直接アクセスは、先行の一回で実行環境のbrowser-proxy接続失敗となり、bytesは得られなかった。指示に従い直接取得を再試行していない。
- **添付と識別**：水野さん添付 `R7_question_answer.pdf` を使用。ChatGPT scratch受領時のファイルmtimeは2026-10-13 18:00:20 JST。取得者は水野さん。元のWebサイトからのダウンロード時刻は未提供のため、添付受領時刻と区別して記録する。サイズ1,071,555 bytes、30 pages、SHA-256 `829cde5778e22d1a8f0050ce2ff8b4b8089749bcab5456fbde6d1d843a3ed8ed`。PDF metadata title `AB.indd`。添付から `sha256sum` と `pdfinfo` で実測。
- **公式資料との同一性確認**：公式CSV記載URLをPDF閲覧し、表示タイトル `AB.indd`・30 pagesを確認。添付PDFの印刷頁16（PDF index 16）を画像表示し、問29・問30の本文・各肢を確認した。添付30頁目の公式正答表で問29=2、問30=3を画像確認した。公式URL側のPDF抽出結果と添付PDFの問29・問30本文および正答番号は一致。CSVが同一PDF内に正答表を含むとする記載とも一致。したがって同じ公式文書として確認済み。なお直接取得bytesがないためURL配信物とのbyte-for-byte比較を行ったという意味ではない。
- **pin登録**：`src/official-pdf-pins.js` に `宅地建物取引士:2025:年度共通` を追加。問題URLと正答URLはCSV由来の同じURL、問題SHAと正答SHAは同じ添付PDFから算出した値。`年度共通` はCSVに試験区分の分割がない2025年度一体資料を表すregistry section名。
- **土地家屋調査士照合**：同CSVの土地家屋調査士2025年度「午後」問題URLは `https://www.moj.go.jp/content/001450011.pdf`、正解URLは `https://www.moj.go.jp/content/001450015.pdf`。`src/official-pdf-pins.js` の既存pinと両方とも文字列完全一致。
- **回帰テスト**：`src/official-pdf-pins.test.js` を追加。CSV URLと既存pinの完全一致、宅建pin URL・hash、正しいpinの検証、URL/hash差替え拒否の4ケース。GitHubから再取得したソース内容でローカルNode実行し4/4 PASS。`node --test` によるこの追加テストのActions runは現時点で取得できていないため、CI PASSとは記録しない。
- **変更範囲**：本番 `src/official-pdf-pins.js`、テスト専用 `src/official-pdf-pins.test.js`、本記録。`main` と既存 `master_prompt.txt` は変更対象外。公式取得pipelineの運用依存、同一単元の承認済み候補、ChatGPT実機反復試験は引き続き未完了。
- **総合判定**：未合格。今回の作業は公式PDFのURL/hash pin固定であり、学習runtimeの稼働や実ChatGPTの連続対話を合格とするものではない。


## 2026-10-13 18:12｜段階2：宅建の単元確認と候補台帳形式案
- **対象・範囲**：水野さん承認後、段階2の確認のみを実施。作業対象は `ai-learning-system`。台帳ファイルは作成しない。変更するGitHubファイルは本記録のみ。
- **宅建問29／問30の単元確認**：問29（37条書面）と問30（重要事項説明・クーリングオフ・手付金保全等の違反事項数）を同一の承認済み `studyUnitId` に割り当てた学習計画または単元定義資料は、確認した開発管理記録、現行GitHubブランチのファイル一覧、既存公式URL台帳から見つからなかった。問番号が連続することだけでは同単元と扱わない。単元IDと個別questionIdは**未確認**。推測で単元を作成していない。
- **確認した宅建CSV**：`mda813453dm-arch/shikaku-kakomon-urls` の `qualifications/宅地建物取引士.csv`。列は分野グループ、資格種別、資格名、実施団体、過去問一覧URL、種別、年度、区分・状況、URL。年度・公式URLは記録できるが、`studyUnitId`、個別 `questionId`、PDF hash／pin参照の列はない。従って、現行ファイルをそのまま単元別候補台帳として使えるかは列要件を満たさず、現状のままでは不足。
- **土地家屋調査士2025午後の確認**：`qualifications/土地家屋調査士.csv` の問題URL `https://www.moj.go.jp/content/001450011.pdf` と正答URL `https://www.moj.go.jp/content/001450015.pdf` は、`src/official-pdf-pins.js` のregistry key `土地家屋調査士:2025:午後` の既存pinと文字列完全一致。両資料は年度・午後区分のPDF対を特定するが、個別questionId、studyUnitId、単元別候補行の入力元は持たないため**未確認**。
- **候補台帳の形式案（水野さん選択待ち、採否・推奨なし）**：
  A. 単元ごとに問題IDを並べるJSON（`studyUnitId`、`questionId`、`year`、`section`、公式PDFのpin参照）。型と入れ子構造を明示できる。一方、表計算で一覧確認・直接編集しにくい場合がある。
  B. CSV（1行1問、Aと同じ列構成）。表計算で一覧・編集しやすい。一方、型、必須項目、複数値の扱いを別途検証する必要がある。
  C. 既存の `qualifications/宅地建物取引士.csv` をそのまま候補台帳として使う。既存の公式取得URL一覧を再利用できる。一方、現在の列に単元ID、個別問題ID、PDF hash／pin参照がなく、候補台帳要件への適合は未確認（今回の列確認では不足）。
- **選択待ち**：水野さんがA〜Cから形式を選択するまで、候補台帳ファイル・候補データは作成しない。
- **総合判定**：未合格を維持。候補台帳の選択・入力、同一単元判定、本番依存での35件の検証、実ChatGPT反復試験は未完了。


## 2026-10-13 18:45以降｜段階3：E-1〜E-4決定とNDJSON台帳初期化
- **ユーザー承認**：NDJSON配置 `新システム開発/data/question-candidates.ndjson` と段階3作業着手を承認。ただし各studyUnitIdは個別承認が必須。
- **E-1**：NDJSON（1行1候補）採用。上記ファイルを空ファイルとして新設（commit `fd731deac44f04b28b27fc141401163bd17b1fb3`）。承認済み候補がゼロのため、登録行は0件。公式pin未照合の行・未承認のIDを追加していない。
- **E-2**：既存資料からAIが単元ID候補を提示し、水野さんが1件ずつ承認。未承認IDは使用しない。現時点で承認済みstudyUnitIdは0件。studyPlanSha256も未生成。
- **E-3**：出題数が不明なら公式科目の記載順（現行B03と一致）。決定Dの末尾「AIが学習効果で判断」をこの決定で置換。公式試験概要の分類と分野別出題数の多い順は維持。
- **E-4**：新システムの内部原因による取得・解析失敗時は添付依頼禁止。プログラムが理由と「未確認」を報告して停止。現行master_prompt.txtは変更しない。
- **A/B/C維持**：ChatGPT画面とプログラム制御、既存X4/B20引き継ぎ（新規DB前提なし）、公式過去問の自動取得と外部要因時のみの手動添付。
- **既存プロンプトの読取照合**：D03は具体的項目ID・学習順を持ち、B03は出題数不明時「公式科目の記載順」。B20は引き継ぎ■1〜■8を復元、X4は終了ログと引き継ぎ。外部プログラムの強制制御はプロンプトだけでは保証されない。B07〜B10の外部要因限定添付条件の完全一致は未確認。
- **資料所在**：公式PDFのURL一覧とpinは既存資料に確認。公式試験概要の分野分類データの確定所在は未確認。宅建2025問29・問30および土地家屋調査士2025午後の個別questionId・承認済みstudyUnitId・学習計画hashは未確認。
- **変更分類**：記録＝本ファイル。本番データ＝空NDJSON台帳（候補0件）。テスト専用＝なし。CI設定＝なし。
- **検証状況**：本番同等依存による既存35件は未実行。追加E-3/E-4テスト未実装。新headのCI実行番号・結果は未確認。過去のCI結果を今回のPASSとはしない。総合判定「未合格」。
