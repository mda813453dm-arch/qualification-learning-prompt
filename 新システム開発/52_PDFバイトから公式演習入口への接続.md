# 52｜PDFバイトから公式演習入口への接続（2026-10-12 JST）

## 実装
1. integration/surveyor_verified_spans.py を追加。2025年度土地家屋調査士午後の部PDFの問1〜20の見出し、選択肢5件、正答表の午後列を保守的に抽出。問題文スパンとページ番号・SHA-256を返す。PDFの画像・図表は未検証。
2. integration/test_surveyor_verified_spans.py を追加。異常系4件、実PDFを環境変数で指定した場合の確認1件。実PDFは公開GitHubへアップロードしない。
3. src/pdf-bound-practice-entry.js を追加。PDFバイト照合→原文スパンの同一性→正答証拠の存在→従来の原文照合→公式PDF実取得・固定台帳照合→出題・採点ゲートの順で処理。
4. tests/pdf-bound-practice-entry.test.js に証拠欠落・未知台帳・偽PDF・内部解析器未設定の拒否テスト4件を追加。

## 実行確認
- ローカルNode.jsでpdf-byte-evidence-gate.jsの同内容の7件を実行、7/7 PASS。
- 手元の実PDF問題001450011.pdf・正答001450015.pdfのSHA-256は固定台帳と一致。
- ローカルPythonの実PDF解析5件を実行、5/5 PASS。問題20問・午後正答20問を抽出。
- GitHubに新規追加した統合入口4件のCI実行結果は未確認。GitHub上のPythonテストもCIに組み込んでいないため未確認。

## 未完了
- Python PDF抽出器とJavaScriptの統合入口の自動データ受渡しは未接続。現在は個別に実装・検証している。
- PDFバイト紐付けと文字列包含だけでは、PDFの図表の完全性、選択肢の意味、問番号と正答の対応を完全証明できない。
- 公式サイトからのPDFライブ取得、ChatGPTスマホ画面への接続、実認証、永続化は未実証。
- システムの公開入口に任意のextractText・retrieveAndVerifyを利用者から注入させないデプロイ構成が必要。

追加有料サービスなし。main・既存マスタープロンプトは未変更。フェーズ4進行中。
