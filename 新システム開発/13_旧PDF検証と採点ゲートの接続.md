# 旧PDF検証と新採点ゲートの接続
更新日：2026-10-11
## 実装
- `src/retrieval-evidence-adapter.js`：旧 `runtime/src/retrieval-engine.js` の `verifyQuestionEvidence` が返す構造を、新 `verified-question-gate.js` に渡す試作。
- `tests/retrieval-evidence-adapter.test.js`：架空データでの成功条件と問題ID・年度・区分・出典・選択肢・正答根拠の不備をテスト。
## 重要な制限
- **これはデータ構造の接続試作**。旧検証エンジンを実際に呼び出していない。公式PDFを取得した証拠ではない。
- `trustedServerVerification` は現在、呼び出し側が指定できる真偽値であり、本人認証や信頼できる検証の証明にはならない。公開APIから直接指定させてはいけない。
- 本番では旧 `verifyQuestionEvidence` とサーバー所有のPDF取得・解析処理を直接連結し、検証フラグを外部入力に依存させない。
- 旧実装のPDF解析は資格ごとの形式差がある。資格横断の実動作は未検証。
## 次の実装ゲート
1. 旧検証コードを安全に取り込むか依存モジュールとして扱うか決める。
2. サーバー所有の公式PDF取得・解析→旧検証→新採点ゲートの一連処理をテスト。
3. 取得失敗時の複数年度・再試行・手動PDF添付を設計。
4. 実PDFで問題番号・本文・選択肢・正答を照合し、ログを残す。
