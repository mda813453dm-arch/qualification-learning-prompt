# ChatGPT接続方式の調査（2026-10-11）

公式ヘルプによると、従来のカスタムMCPアプリ開発者モードはWeb版向けで、モバイル非対応と記載されている。スマホのChatGPT画面を必須とするため、これだけに依存して完成扱いにしない。

公式資料：https://help.openai.com/ja-jp/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

新しいプラグイン認証の開発資料：https://developers.openai.com/plugins/build/auth

確認事項：プラグイン方式のスマホ利用可否、個人向けプランの開発・配布条件、認証、ファイル添付の受け渡し、継続保存。いずれも実機接続は未確認。

既存MCP試作の利用者識別は公開前に認証検証が必要。ユーザーが提出したPDFを安全に扱う方式を別途実証する。
