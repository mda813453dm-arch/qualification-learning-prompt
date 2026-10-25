# 103資格の公式過去問URL台帳（統合保管）

- 移行元: `mda813453dm-arch/shikaku-kakomon-urls`（2026-10-25 取得時コミット `b61d3ea17bd95344b0a49213fb8cc28b24f74628`）
- 正本: `index.csv` の資格名103件と `shikaku_kakomon_urls.csv.gz` の過去問URLレコード4,184件（うちURLあり4,023件）。後者は元CSVを欠落なくgzip圧縮したもの。
- エンジンが読む資格索引: `../qualification-url-index.json`。`node scripts/generate-qualification-url-index.mjs` でCSVから再生成し、`--check` で整合性を確認する。
- 移行元 `index.csv` の `ファイルパス` は移行元リポジトリ内の資格別CSVを指す履歴値。統合後は全行を収めた `shikaku_kakomon_urls.csv.gz` を正本として読み、移行元の相対パスをエンジンが参照することはない。

**注意:** URLは参照先の記録です。PDFの取得成功、問題・図・選択肢の完全性、公式正答との対応、掲載権限が検証されたことを意味しません。この一覧から直接 `sources` を生成して自動採点しないこと。検証済みの既存資格の設定・共有過去問は `src/catalog.js` の専用設定を優先します。

移行元リポジトリは移行後も安全な復旧用として残し、こちらが資格選択の正本となります。移行元を削除する場合は別途明示的な承認が必要です。
