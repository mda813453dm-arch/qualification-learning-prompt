# 71｜測量士補PDFの取得済みファイル対応

2026-10-12。国土地理院の公式PDFをローカル環境から再取得したがDNSエラー。そこで、GitHub Actionsの自動取得とは別に、外部で取得済みのPDFを入力して図表ページをPNG化する `integration/offline_survey_visual.py` を追加した。

対象は2026年測量士補の第7問（PDF9ページ）・第27問（PDF29ページ）。入力PDFの形式・20MB制限・29ページ以上・対象ページの文字の有無を検査し、全ページPNG2枚とPDF/PNG SHA-256、出題不可フラグをJSONで出力する。取得済みファイルの出所は自動認証できないため `sourceProvenance=USER_OR_EXTERNAL_FILE_UNVERIFIED` と明示。問題番号・図表・正答の内容照合やiPhoneでの表示確認が済むまでは出題不可。

模擬PDFによるローカルテスト4/4 PASS（2ページPNG生成、ページ数不足拒否、文字なしページ拒否、HTML拒否）。既存の図表切り抜き安全テストもローカル4/4 PASS。GitHub Actionsにもオフライン検証テストを組み込んだが、CI実行結果は未確認。

既存マスタープロンプト・mainは変更なし。追加有料サービスなし。