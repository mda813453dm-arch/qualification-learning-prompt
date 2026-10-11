# 旧MCP試作の評価（2026-10-11）
## 調査した実ファイル
`runtime-engine-candidate` ブランチの `runtime/chatgpt-mcp/README.md`、`worker/index.js`、`worker/evidence-contract.js`、`migrations/0001_study_sessions.sql`、`test/worker.test.js`、および `runtime/README.md` を取得して内容を確認した。
## 機能別判定
| 機能 | 既存資産 | 判定 |
|---|---|---|
| MCPツールの定義 | worker/index.js | 再利用候補。ChatGPT実接続は未確認 |
| セッションの保存 | SQLマイグレーション、worker | 再利用候補。D1実環境未配置 |
| ユーザー識別・状態の分離 | worker、テスト | 実装候補。実認証設定は未確認 |
| 過去問索引CSVの検索 | find_question_sources | 候補探索のみ。PDF確認とは別 |
| 公式根拠の検証 | evidence-contract.js | 再利用候補。AI申告だけで検証済みにできない設計 |
| PDFの実取得・問題・正答照合 | runtime/src/retrieval-engine.js | 別部品として存在。MCPには未接続 |
| 出題・採点・解説後の継続 | MCP試作 | 未完成 |
| 自由な学習相談・話題変更 | 旧状態機械 | 要再設計。固定の手順が強い |
## 技術判断
旧MCP試作をそのまま完成品として公開しない。最初に状態の読み書きだけを接続検証し、資格や話題を固定しない会話を妨げないかを確認する。公式出題・採点のゲートは、PDF照合がMCPに接続されるまで閉じたままにする。
## 次に必要な実証
1. ChatGPTから利用できるMCP接続方法・プラン条件・スマホでの設定を確認。
2. 個人情報を使わないテスト環境でMCPを配置。
3. ChatGPTから開始→保存→読み出し→再開を実行。
4. 成功・失敗の実ログを残す。
## 現状
コード静的確認：実施済み。旧候補ブランチのCI：過去の成功記録あり。新システムとの実結合：未実施。ChatGPT実機接続：未実施。
