# PDF解析環境の実証
更新日：2026-10-11
## 今回の変更
- `package.json` に旧runtimeと同じ `pdfjs-dist@4.10.38` を固定。
- GitHub Actionsの実行手順に `npm install --no-audit --no-fund` を追加。
- `tests/pdf-extraction-smoke.test.js` で自動生成した小さなPDFを `extractPdfPages` に渡し、本文の抽出を確認する。
## 検証の範囲
検証用PDFはコード内で生成する1ページの簡易英字PDF。公式PDFではなく、日本語・図表・複雑な選択肢・ページ跨ぎへの対応は未確認。
## 次の工程
1. CIでPDF解析スモークテスト成功を確認。
2. 公式公開PDFの取得先と正答の対応を確認。
3. 実PDFで本文・選択肢・正答を抽出して旧検証関数へ渡す。
4. 出題から採点までの実データ結合テストを記録。
