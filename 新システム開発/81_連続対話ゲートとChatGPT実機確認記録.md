# 連続対話ゲートとChatGPT実機確認記録（2026-10-13）

## 対象と保護条件
- 対象ブランチ：`ai-learning-system`
- 対象要件：ユーザー提供のClaude監査意見（監査記録v31〜v34の失敗傾向と4条件）
- `main` と既存 `master_prompt.txt` は変更しない。
- 本記録はコードテストと実ChatGPT試験を分け、未確認を合格としない。

## 今回の実装・自動検証
- `src/chat-inline-render-adapter.js`：MCP図抽出が返すHTTPS PNG参照を、通常ChatGPT sandbox参照だけを許可する旧validatorが拒否していたため、HTTPS PNG参照を検証してMarkdownへ保持するよう修正。private/local host、HTTP、資格情報、非標準port、fragmentを拒否する。IPv4拒否正規表現の初回不備はCIで検出し、修正した。
- `src/deterministic-inline-study-flow.js`：表示受領時にquestion ID、packet hash、Markdown本文hash、署名、node数を照合し、毎回の結果をセッション内のdisplay audit（PASS/FAIL、理由、hash）へ記録。不一致時はFAILを残して例外終了し、回答待ち・採点へ進ませない。
- `src/chat-inline-render-adapter.test.js`：リモートHTTPS図参照の保持と危険URL拒否を追加。
- `src/deterministic-inline-study-flow.test.js`：表示本文が改変された場合のFAIL記録、回答・採点への遷移拒否、完全一致時のPASS記録を追加。
- 全JavaScriptテストおよびPython統合テスト：GitHub Actions Run [38358791180](https://github.com/mda813453dm-arch/qualification-learning-prompt/actions/runs/38358791180) success（head `205a53c762d5c825fbecbe9ad516b9c44e54fe88`）。
- URL validator初回実装のテスト失敗：Run 38357928623。127.0.0.1の拒否漏れをログで特定し修正。修正後Run 38358058151 success。
- このCI結果はプログラムの自動テストであり、実AIがプログラムを呼ぶことや、実画面に出た文章をサーバーが自動検証したことの証明ではない。

## Claude提示の4条件に対する現状
| 条件 | 結果 | 根拠 |
|---|---|---|
| 1. プログラム未呼出しでは次へ進ませない | 未達 | JS状態機械内では遷移を制限するが、通常のChatGPT／他AI会話がこのランタイムを必ず呼ぶ接続はない。 |
| 2. 正答・次問をAIに生成させない | 部分実装 | 既存フローは固定packetの正答・次問を使う。MCPから同フローを呼ぶ統合入口がなく、会話全体で強制できていない。 |
| 3. 実行結果と表示文の不一致をFAIL記録 | コード内PASS | 表示受領値とpayloadの一致検証・セッション内記録および不一致拒否を自動テスト。実AIの送信文を独立取得する監査接続はない。 |
| 4. 実ChatGPTで同じ手順を複数回確認 | 未実施（0回） | 現在のChatGPT会話から学習ランタイムを呼び出せず、問29・問30用の実行可能な接続・データもこのセッションにない。コードテストを実機試験に読み替えない。 |

総合判定：**未合格**。4条件すべてを満たした証拠はない。

## 未決定事項（採否・推奨なし）
1. ChatGPT通常会話とClaude等で使う共通の実行接続方式。
2. ランタイムの公開先、認証方式、セッション永続化。
3. 各AIクライアントから現会話のPDF添付をランタイムへ渡す方式。
4. 問29・問30の対象資格、単元、年度、公式問題・正答Bundle、および反復試験で固定する回答・説明の手順。

## 次の検証ゲート
上記未決定事項が確定し、AIクライアントが同じランタイムを実際に呼び出せる状態になった後、同一の問29回答→公式採点→解説要否→説明または質問処理→問30完全表示をChatGPTで複数回実行する。各回について、呼出ログ、プログラム出力、AI表示本文、差分、PASS/FAILを記録する。画像を含む問題では添付PDF由来PNGの本文内表示も照合する。実機反復が完了するまで総合合格・フェーズ完了にしない。
