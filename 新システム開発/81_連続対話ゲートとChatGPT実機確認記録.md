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
- 35件は9ファイル（guarded-practice-controller、legacy-pipeline-factory、official-entry-span-integration、official-practice-controller、official-practice-entry、official-registry-identity、official-retrieval-pipeline、pdf-bound-practice-entry、provenance-checked-pipeline）にあり、全て `PIPELINE_CONFIGURATION_REQUIRED`。
- 以前の実装では各公開入口が `resolveCandidates` と `buildInlinePayload` を内部へ渡していなかったため、Provenance/Guarded/Official/PDF-bound入口およびlegacy factoryに依存の受け渡しを追加した。しかし、承認済み候補台帳・payload builderの実装と本番供給元は存在せず、テストもこれらの必須依存を渡していない。35件は未解消であり、テスト期待値変更・安全ゲート緩和で通していない。
- question-bundle-gateの異常系9件は、fixtureに必須の `studyUnitId` と承認済み計画hashがなかったため、先行して `STUDY_UNIT_MISMATCH` になっていた。fixtureに正しいbindingを追加し、それぞれの検査まで到達するよう修正済み。
- ローカル報告は209件、168 PASS／36 FAIL／5 SKIPで、失敗の1件はpdfjs-dist不足。CIの209件、169 PASS／35 FAIL／5 SKIPとの差は1件で、CIではpdfjs-dist抽出がPASSしたという報告と一致する。ローカルのcheckout内容そのものはこの環境から独立検証していない。
- CI件数198とローカル209の差は、CIが別扱いだったsrcの11テストを統合集計へ含めなかった実行範囲の差だった。現在のCIは同じ209件を集計している。
- リポジトリ内の `integration/cross_ai_figure_service` は添付PDFから図を抽出するAPIであり、学習セッション、候補解決、公式採点、解説、次問遷移を提供するランタイムではない。OpenAPI上のhostは未設定の `YOUR-DEPLOYED-HOST`。学習APIとの接続・配備は確認できていない。

## Claude提示の4条件に対する現状
| 条件 | 結果 | 根拠 |
|---|---|---|
| 1. プログラム未呼出しでは次へ進ませない | 未達 | JS状態機械内では遷移を制限するが、通常のChatGPT／他AI会話が学習ランタイムを必ず呼ぶ接続はない。 |
| 2. 正答・次問をAIに生成させない | 部分実装 | 固定packetを使うコードはある。公開入口の実依存設定とAI会話全体への強制接続は未完了。 |
| 3. 実行結果と表示文の不一致をFAIL記録 | コード内PASS | 表示受領値とpayloadの一致検証・セッション内記録・不一致拒否を自動テスト。実AIの送信文を独立取得する監査接続はない。 |
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
