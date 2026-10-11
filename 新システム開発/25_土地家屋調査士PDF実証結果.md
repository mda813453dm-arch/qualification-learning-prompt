# 土地家屋調査士の手動添付PDF検証

更新：2026-10-11

令和7年度午後の部について、利用者がChatGPTへ添付した問題PDF（48ページ）と正答PDF（1ページ）を実際に解析した。第1〜20問のページ、各問5個の選択肢、正答表20件を確認した。結果は20問・100選択肢・20正答のPASS。

再実行用：`integration/verify_surveyor_2025.py`。実行にはPython、pdftotext、利用者が入手した問題PDF・正答PDFが必要。GitHubには利用者添付PDFそのものは登録しない。

実行例：`python integration/verify_surveyor_2025.py QUESTION.pdf ANSWER.pdf`

このテストはPDF内の見出し・選択肢の形式と正答番号を照合する。問題全文の意味的な正確性、添付PDFと法務省サーバー上のバイト列同一性、記述式の自動採点、ChatGPT外部システム接続は検証していない。現時点では汎用103資格対応ではなく土地家屋調査士2025年度専用の実証コード。

掲載先：問題 https://www.moj.go.jp/MINJI/minji05_00732.html 、正答 https://www.moj.go.jp/MINJI/minji05_00734.html 。法務省からAIが直接取得できない場合、ユーザー添付によって検証する。
