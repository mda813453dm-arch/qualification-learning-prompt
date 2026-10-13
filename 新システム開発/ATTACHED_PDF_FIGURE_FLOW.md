# 添付PDFからの図表抽出・表示契約

## 目的
図表付き問題では、利用者がそのチャットに添付した公式問題PDFを唯一の画像元にする。過去チャットのPNG、保存済みPNG、別サイト画像、画像リンクのみの提示では出題可能にしない。

## 実行順
1. 現在のチャットに添付されたPDFを受領する。接続層が serverReceived、receivedInCurrentChat、fileId、chatId、PDF SHA-256 を設定する。値をユーザー文やファイル名から推測しない。
2. 公式PDF検証と問題ID照合を行い、問題本文・全選択肢・正答資料との組合せを確定する。
3. 検証済みBundleの図表ページとcrop座標を使い、integration/extract_attached_pdf_figure.py の extract_attached_pdf_figure を今回添付のPDFパスで呼び出す。毎回、新しい出力先を生成する。
4. 戻り値の derivedFromPdf、PNGの imagePath と imageSha256 を接続層で確認する。imagePath は当該チャットの sandbox 画像参照に変換する。
5. Asset Registryには、少なくとも questionId、verified: true、mime: image/png、inlineRef、PNG sha256、generatedInChatId、derivedFromPdf を渡す。
6. buildChatTurn(question, assetRegistry, {sourcePdfAttachment}) が ready を返し、完成した一つの messageBody を送信する。
7. 本文中の画像表示が確認された後に限り、表示受領証を作成して ANSWER_WAIT に進む。

## 停止条件
現在チャットのPDF受領証、公式PDFハッシュ、確認済みcrop範囲、今回生成したPNG、PDFとの出典一致のいずれかを確認できなければ blocked とする。図の代替、〔図〕という文字だけの表示、他会話のsandboxパス再利用を禁止する。

このリポジトリの単体テストは、データ契約とfail-closed動作を検証する。実機で本文中に画像が見えるかどうかは、別チャットにPDFを添付した状態で行うiPhone表示確認が必要である。
