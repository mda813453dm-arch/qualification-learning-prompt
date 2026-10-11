# 公式PDF実データ統合テスト
更新日：2026-10-11
## 実装
- `integration/official-retio-2025.test.js`：RETIO公式2025年度PDFの取得、全50問の本文・選択肢・正答照合、採点ゲート通過を確認するテスト。
- `.github/workflows/ai-learning-official-pdf-integration.yml`：通常の単体テストから分離してGitHub Actionsで実行する。
## 取得先
https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf
## 成功条件
公式URLでHTTP200、PDF形式とシグネチャを確認、30ページを解析、50問の問題・正答の同一性を照合、全問を採点ゲートへ通す。
## 注意
2025年度の宅建1資格・1年度の検証であり、全資格対応を証明しない。公式サイトのアクセス制限やPDF構成変更で失敗する場合がある。成功・失敗はGitHub Actions実行結果で確認する。
