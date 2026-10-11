# 41｜土地家屋調査士アップロードPDFの固定ハッシュ検証（2026-10-11）

## 実装
src/pinned-pdf-verifier.js：問題・正答PDFの先頭マジックバイトとSHA-256を検査。既知の令和7年度アップロードファイルに固定した値と異なる場合は拒否。検証結果は uploaded_pinned_pdf とし、公式配布元の真正性と図表完全性を false として返す。
tests/pinned-pdf-verifier.test.js：一致・問題改変・正答改変・非PDF・実アップロードPDF（ファイルが指定された場合のみ）の5ケース。PDFは公開しないためCIでは実PDFテストをスキップする。

## 実測
問題 001450011.pdf SHA-256: 928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c
正答 001450015.pdf SHA-256: 3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad
ローカルのPDF解析器 surveyor_verified_spans.py による5件テストPASS、実ファイルから問題20問・正答20件を抽出。追加のPython固定ハッシュ検証3件PASS（元ファイル受理、問題改変拒否、正答改変拒否）。Python版はローカル検証のみでGitHub未収録。

## セキュリティ上の残課題
固定ハッシュは同一バイト列の照合であって公式配布元の証明ではない。ハッシュ一致をもって sourceVerified=true に昇格させない。既存パイプラインは trustedServerVerification=true を内部で設定しているため、実際の公式性・設問完全性の証明として使わない。検証済み証拠の真正性を独立検査するサーバー所有の仕組み、原文・図表・正答PDFのページ照合、実機テストが残る。今回追加したJSテストのGitHub Actions実行結果は未確認。

## 維持条件
追加有料サービスなし。mainと現行マスタープロンプトは変更なし。フェーズ4未完了。
