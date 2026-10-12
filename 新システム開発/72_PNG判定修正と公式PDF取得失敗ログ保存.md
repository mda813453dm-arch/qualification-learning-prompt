# 72｜PNG判定修正と公式PDF取得失敗ログの保存

2026-10-12。測量士補2026年度の第7問・第27問のPNG生成テストを再点検し、PNGヘッダーの判定を正式な8バイトシグネチャ（137,80,78,71,13,10,26,10）との照合に修正した。対象は `integration/test_gsi_ci_visual_pipeline.py` と `integration/test_offline_survey_visual.py`。

`.github/workflows/gsi-surveyor-visual-evidence.yml` を修正し、公式PDF取得の実行ログを `visual-evidence/fetch-log.txt` に保存し、成功・失敗の状態を `visual-evidence/status.txt` に記録する。取得失敗時もActionsアーティファクトのアップロードを試み、ジョブ自体は失敗扱いにする。取得成功時は第7問・第27問のPNGとハッシュ付き `evidence.json` を保存する設計。

ローカル実行環境から国土地理院へのアクセスはDNSエラー。GitHub Actionsでの公式PDF取得成功・失敗、PNG生成、ログ保存の実行結果はまだ確認できていない。テストコードの変更後のCI合否も未確認。したがって測量士補の画像表示成功とは扱わない。

利用者がiPhoneで閲覧できたのは、別資格（土地家屋調査士）のPDFから生成した画像とその拡大版。測量士補の図表表示は未実証。main・既存マスタープロンプトは変更なし。追加有料サービスなし。