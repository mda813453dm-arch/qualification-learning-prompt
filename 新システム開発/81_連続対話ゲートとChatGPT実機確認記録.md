# 連続対話ゲートとChatGPT実機確認記録（2026-10-13）

## 対象と保護条件
- 対象ブランチ：`ai-learning-system`
- 対象要件：ユーザー提供のClaude監査意見（監査記録v31〜v34の失敗傾向と4条件）
- `main` と既存 `master_prompt.txt` は変更しない。
- コードテストと実ChatGPT試験を分け、未確認を合格としない。

## 2026-10-13の再監査・修正
- 以前の「全JavaScriptテストおよびPython統合テスト success」という記載は、`src/*.test.js` とPythonテストだけを指し、`新システム開発/tests/*.test.js` のnpmテスト群を含んでいなかった。したがって「全件PASS」と受け取れる記載は不正確だった。ここに訂正する。
- `.github/workflows/qualification-system-tests.yml` を更新し、`tests/**` とnpm設定ファイルをpush triggerへ追加。Node依存（pdfjs-dist）をインストールし、従来のsrc/Pythonテストに加えて `npm test` を実行するようにした。
- npm実行によりPDF抽出テストも動作し、`pdfjs-distでPDF本文を実際に抽出` はPASS。
- `src/question-bundle-gate.js` の異常系9テストは、テストBundle側に必須の `studyUnitId` と承認済み計画hashがなく、他の検査より先に `STUDY_UNIT_MISMATCH` で止まっていた。テストfixtureへ正しいバインドを加え、欠落図、誤正答、ページ、配置などを各固有理由まで検査できるようにした。
- 35件の旧取得・採点テストは、新しいパイプライン必須依存 `resolveCandidates` と `buildInlinePayload` を各公開入口が内部へ渡していなかったため、動作検査以前に `PIPELINE_CONFIGURATION_REQUIRED` で停止していた。Provenance/Guarded/Official/PDF-bound入口およびlegacy factoryで、このサーバー所有依存を明示的に受け渡す修正を行った。依存の実装・配備はまだないため、既存の35テストは引き続き未構成で失敗している。
- 全JavaScript source test 11ファイルは最新のActions実行でPASS。
- 最新確認Run [38359978597](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38359978597)（head `ea182511ec41d2c81e32f73dd31330e710a58637`）：npm suite 198件、158 PASS、35 FAIL、5 SKIP。35件はすべて `PIPELINE_CONFIGURATION_REQUIRED`。PDF.js抽出テストはPASS。Actions全体はFAILである。
- このテスト数は今回のCIが実際に数えた198件。ユーザー報告の209件と件数が異なるため、実行環境／ブランチ／テストスナップショットの差は未照合。
- 前のRun [38358791180](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38358791180) が成功したのはsrc/Pythonの限定対象だけであり、npmテストを含む全体PASSではない。

## Claude提示の4条件に対する現状
| 条件 | 結果 | 根拠 |
|---|---|---|
| 1. プログラム未呼出しでは次へ進ませない | 未達 | JS状態機械内では遷移を制限するが、通常のChatGPT／他AI会話がこのランタイムを必ず呼ぶ接続はない。 |
| 2. 正答・次問をAIに生成させない | 部分実装 | 固定packetの正答・次問を使うコードはある。公開入口の実依存設定およびAI会話全体への強制接続は未完了。 |
| 3. 実行結果と表示文の不一致をFAIL記録 | コード内PASS | 表示受領値とpayloadの一致検証・セッション内記録および不一致拒否を自動テスト。実AIの送信文を独立取得する監査接続はない。 |
| 4. 実ChatGPTで同じ手順を複数回確認 | 未実施（0回） | 現在のChatGPT会話から学習ランタイムを呼び出せず、問29・問30の実行可能な接続・データもない。 |

総合判定：**未合格**。GitHub Actions全体がFAILであり、4条件すべてを満たした証拠はない。

## 未決定事項（採否・推奨なし）
1. ChatGPT通常会話とClaude等で使う共通の実行接続方式。
2. ランタイムの公開先、認証方式、セッション永続化。
3. 各AIクライアントから現会話のPDF添付をランタイムへ渡す方式。
4. `resolveCandidates` の承認済み候補台帳と `buildInlinePayload` の実装・運用環境。
5. 問29・問30の対象資格、単元、年度、公式問題・正答Bundle、および反復試験で固定する回答・説明の手順。
6. 今回CIの198件とユーザー側報告の209件の差。

## 次の検証ゲート
1. 上記35件の呼出側へ、承認済みの学習計画、同一単元候補列、完全表示payloadビルダーを明示して、既存の検証目的を保ったテストfixtureにする。安全ゲートを緩めたり、単に期待結果を変更してPASSにしない。
2. 本番で同じ依存を供給するruntime/APIを確定・接続し、AI呼び出しなしで次問・採点・解説へ進めないことをエンドツーエンドで確認する。
3. 上記が準備できた後、問29回答→公式採点→解説要否→説明または質問処理→問30完全表示をChatGPTで複数回実行する。各回の日時、呼出ログ、プログラム出力、AI表示本文、差分、PASS/FAILを記録する。画像問題は添付PDF由来PNGの本文内表示も照合する。
4. 実機反復完了まで総合合格・フェーズ完了にしない。
