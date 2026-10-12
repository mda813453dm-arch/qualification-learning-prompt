# 75｜図表付き実問題の採点・次問進行MVP

2026-10-12。利用者がiPhoneで表示確認した2025年度土地家屋調査士午前第4問・第5問を使い、公式問題PDF（SHA-256: 4a90ae3875c14c1eeda4b3ac9a32c6387b69b5cc15d0f5b62a99514af78267d0）と公式正答PDF（SHA-256: 3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad）からPNG生成・採点・次問進行を結合した。

第4問はPDF7ページ・公式正答3、第5問はPDF8ページ・公式正答2。ローカルの実PDFテスト4/4 PASS（問題画像と正答、正解/不正解の採点と次問遷移、誤ハッシュ拒否、無効入力時の状態保持）。

GitHub開発ブランチへ integration/mvp_two_question.py と test_mvp_two_question.py を追加。GitHub上で実PDFテストを動かすには SURVEYOR_MORNING_QUESTION_PDF と SURVEYOR_ANSWER_PDF を設定する必要がある。GitHub CI実行は未確認。

注意：これはPythonローカル結合テスト。ChatGPTスマホ会話にプログラムが自動接続され、解説・次問が自動表示されることは未実証。解説生成・実機連続動作も未完了。既存マスタープロンプトとmainは変更しない。新機能拡張は凍結し、MVP5条件の実証を優先。
