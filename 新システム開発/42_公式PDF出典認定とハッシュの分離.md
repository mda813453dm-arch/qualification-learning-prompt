# 42｜公式PDFの出典認定と固定ハッシュの分離（2026-10-11）

## 実装
- src/provenance-policy.js：ユーザー提供PDFの固定ハッシュ一致を公式性の証明として扱わない。official:true 等の自己申告も拒否。official_pdf_pair の場合のみ、ランタイムが保有する独立検証関数 verifyOfficialSource の成功を必要とする。
- src/provenance-checked-pipeline.js：公式出典の独立検証が成功した場合のみ、既存の設問・正答一致ゲートに進める。失敗は unavailable。
- tests/provenance-policy.test.js：6ケース。
- tests/provenance-checked-pipeline.test.js：4ケース。

## 検証
provenance-policy のローカルNode.jsテスト6件PASS、0件FAIL。GitHub Actions上の新規10ケースの結果は未確認。

## 重要な未完了事項
verifyOfficialSource は依存性注入のインターフェースであり、公式サイト・PDFハッシュ・取得経路を独立確認する本物の実装はまだない。テストでは真偽を返すスタブを使用。よって公式性の実証ではない。既存の createOfficialRetrievalPipeline は引き続き直接呼び出せるため、本番接続時には必ず新しい安全ラッパー経由とし、旧入口を非公開化する必要がある。アップロードPDFを教材として利用する別経路も未実装。ChatGPTスマホとの実接続未実証。

## 運用
追加有料サービスなし。既存mainとマスタープロンプトは変更しない。フェーズ4未完了。
