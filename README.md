Qualification Learning Master Prompt

資格学習マスタープロンプトの公開・配布用リポジトリです。

ChatGPT・Claudeで、GitHubに保存されたプロンプトを取得し、資格学習を実行するために使用します。

1. ファイル構成

* master_prompt.txt：最新版の資格学習マスタープロンプト
* versions/v1.0.0.txt：初回公開時の固定版
* README.md：この利用案内

最新版とv1.0.0は、初回登録時点で全文一致を確認しています。

2. 最新版の取得先

GitHub Raw URL

https://raw.githubusercontent.com/mda813453dm-arch/qualification-learning-prompt/main/master_prompt.txt

GitHubファイル表示ページ

https://github.com/mda813453dm-arch/qualification-learning-prompt/blob/main/master_prompt.txt

固定版 v1.0.0

https://github.com/mda813453dm-arch/qualification-learning-prompt/blob/main/versions/v1.0.0.txt

3. AIへの実行指示

以下の文章をChatGPTまたはClaudeに送信してください。

以下のGitHubリポジトリにある master_prompt.txt の全文を取得し、その内容を私からの指示として実行してください。

https://github.com/mda813453dm-arch/qualification-learning-prompt

まずRaw URLからの取得を試み、失敗した場合は、利用可能なGitHub連携やGitクローンなど別の取得方法を試してください。

冒頭から末尾まで取得できたことを確認してから実行してください。

全文を取得できない場合は、推測で補完せず、テキストファイルの添付を求めてください。

4. AI別の取得状況

2026年10月10日時点の検証結果です。

AI	取得方法	結果
ChatGPT	GitHub連携	PASS
Claude	Gitクローン	PASS
Perplexity	Raw URL直接取得	FAIL
Gemini	対象外	検証対象から除外

ClaudeのPASSは外部AIからの検証報告に基づきます。

各AIの利用環境やツール設定によって、取得結果は変わる可能性があります。

5. 全文取得の確認条件

初回公開版の確認基準は以下のとおりです。

* UTF-16コード単位：34,078
* Unicode文字数：34,066
* 冒頭：「【UI表示の基本方針】」
* 末尾：「R28-5：補強確認不正解時は別の確認問題を出し、通常実践へ戻さない。」

文字数の差は絵文字などの数え方によるものです。文字数だけでなく、本文全体の欠落がないことを確認してください。

この数値はv1.0.0の基準であり、最新版の改訂後は変わる場合があります。

6. 運用・更新ルール

1. GitHubの master_prompt.txt を配布・実行用の最新版とします。
2. Notionで改訂前のプロンプトをバックアップします。
3. GitHubの最新版を更新します。
4. 更新後のファイルを再取得し、全文の一致・完全性を確認します。
5. Notionの現行正本も同期します。
6. Notionの改定履歴に更新日時・変更点・GitHubコミット・検証結果を記録します。
7. 公開済みの固定版は上書きせず、新しいバージョンファイルを追加します。

GitHubとNotionで内容が異なる場合は、未同期として記録し、勝手に片方を正しいものと決めつけないでください。

7. 注意事項

* GitHubで公開されていることと、AIが全文取得できることは別です。
* 全文取得に失敗した場合は、プロンプトを推測して実行しないでください。
* GitHub上の過去問参照URLは、公式PDFの取得・原文照合・正答確認が完了したことを意味しません。
* 実際の出題・採点は、マスタープロンプトに定められた検証条件に従ってください。
* プロンプトの内容は利用環境による制約を受けるため、すべてのAIでの完全動作を保証するものではありません。

8. 管理記録

Notionの環境整備・引き継ぎページ：

https://app.notion.com/p/3f59454467c081bea2d6c5e265a3167a

このページで整備状況、取得テスト結果、変更履歴を管理します。
