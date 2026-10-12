# 73｜GitHub Actions失敗通知の大量発生対策

2026-10-12。利用者からGitHubの失敗通知メールが大量に届くとの報告。開発ブランチのワークフロー2件を調査したところ、両方ともpush時に自動実行する設定だった。`.github/workflows/gsi-surveyor-visual-evidence.yml` と `.github/workflows/ai-learning-system-tests.yml` からpushトリガーを除去し、`workflow_dispatch`（手動実行）のみに変更。GitHubから再取得して設定を確認した。

変更対象は開発ブランチの2ワークフローのみ。main・既存マスタープロンプトは未変更。過去の失敗通知は取り消せず、ほかのワークフローやGitHub個人設定の通知は別途確認が必要。今後テストを実行する際は意図的に手動起動する必要がある。

同時に、利用者のiPhoneスクリーンショットで2025年土地家屋調査士午前第4問・第5問の図表付きPDFページ画像を表示できていることを確認。測量士補公式PDFでの実機表示は未実証。