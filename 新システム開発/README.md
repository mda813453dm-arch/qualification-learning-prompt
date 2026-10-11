# AI対話型学習支援システム｜開発の入口

このプロジェクトは現行資格学習マスタープロンプトと別枠です。ChatGPTの会話画面で、学習者がその時に必要な過去問、解説、復習、質問を自然な日本語で依頼できる学習支援システムを目指します。将来のnote紹介・収益化は目標であり、公開・販売は別途承認が必要です。

## 最初に読む文書
1. [01_ファイル配置と役割.md](01_ファイル配置と役割.md) — GitHubの各ブランチ・ファイル・配置・役割を調べる台帳
2. [02_開発履歴と判断記録.md](02_開発履歴と判断記録.md) — いつ、なぜ、何を変更したか
3. [03_設計と実装方針.md](03_設計と実装方針.md) — 利用者体験、AIと検証プログラムの役割
4. [04_削除・移行判定.md](04_削除・移行判定.md) — 古い資産を残す・移す・削除する判断
5. [05_完成までのロードマップ.md](05_完成までのロードマップ.md) — 現在地、各工程の完了条件、早期ローンチの進め方

## 開発担当
- ChatGPT：主担当（設計・実装・テスト・記録）
- Claude：必要時の独立監査
- Perplexity：必要時の技術調査
- 利用者：重要方針・公開判断

## 作業ルール
- このブランチ `ai-learning-system` で新システムを開発する。
- `main/master_prompt.txt` や現行の固定版、過去問CSVは変更しない。
- 旧 `runtime-engine-candidate` のコードは評価してから必要なものを移植する。
- 変更時はファイル配置台帳と開発履歴を更新する。文書は日本語で分かりやすく記す。
- テスト未実施の機能を完成と呼ばない。

## 管理先
[Notion 開発管理](https://app.notion.com/p/3f69454467c081d3bbc1d2a89f7c57b4)

## 現在の進捗（2026-10-11）
日本語の管理文書を整備し、既存候補ブランチの資産を確認。削除実施0件。ChatGPTの会話画面への実接続や総合学習動作は未完成。

## 初期実装
- [接続実証計画](06_接続実証とMVP検証.md)
- [意図分類補助コード](src/intent-router.js)
- [意図分類テスト](tests/intent-router.test.js)
コード保存済み。実行テストとChatGPT接続は未確認。

## 会話切替の試作
- [軽量セッション](src/study-session.js)
- [軽量セッションのテスト](tests/study-session.test.js)
- [実装範囲と安全な接続境界](08_実装範囲と安全な接続境界.md)

## 保存の試作
- [開発用セッション保存](src/session-store.js)
- [保存・復帰のテスト](tests/session-store.test.js)
- [本番化条件](09_保存インターフェースと本番化条件.md)

## サービス層の試作
- [学習サービスAPI](src/study-service.js)
- [サービスAPIのテスト](tests/study-service.test.js)
- [認証・接続境界の注意](10_外部呼出し境界と認証の注意.md)

## 接続境界の試作
- [検証済み主体の受け渡し](src/verified-context.js)
- [接続境界のテスト](tests/verified-context.test.js)
- [接続境界の制限と検証](11_接続境界の実装と検証.md)

## 公式採点ゲートの試作
- [公式採点の安全ゲート](src/verified-question-gate.js)
- [安全ゲートのテスト](tests/verified-question-gate.test.js)
- [公式採点ゲートの本番化条件](12_公式採点ゲートの試作.md)

## 公式取得と採点の結合試作
- [旧検証結果の変換](src/retrieval-evidence-adapter.js)
- [取得・検証・採点パイプライン](src/official-retrieval-pipeline.js)
- [パイプライン結合テスト](tests/official-retrieval-pipeline.test.js)
- [結合試作の達成範囲](14_公式取得から採点までの結合試作.md)

## 旧PDF照合エンジン直接接続
- [旧エンジン全文コピー](src/legacy-retrieval-engine.js)
- [新採点パイプラインへの接続](src/legacy-pipeline-factory.js)
- [旧照合関数の実呼出しテスト](tests/legacy-pipeline-factory.test.js)
- [直接接続の検証範囲](15_旧エンジン直接接続.md)
