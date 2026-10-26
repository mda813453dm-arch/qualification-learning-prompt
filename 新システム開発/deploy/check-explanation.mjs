// 配置後の読取専用検査。学習を新規作成・採点・変更せず、トークンを出力しない。
import assert from 'node:assert/strict';
import { WIDGET_URI, WIDGET_VERSION } from '../engine/src/widget.js';
const base = process.env.QLP_BASE_URL;
const token = process.env.QLP_TEST_TOKEN;
assert.ok(base && token, '公開先と構成済み認証が必要');
let id = 1;
async function rpc(method, params) {
  const response = await fetch(`${base}/app`, { method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
  const message = await response.json();
  assert.equal(message.error, undefined, `${method}: RPC error`);
  return message.result;
}
const list = await rpc('tools/list', {});
assert.ok(list.tools.find(t => t.name === 'explainSpec')?.inputSchema.properties.sessionId, '保存済み問題の読取引数が公開されている');
assert.ok(list.tools.find(t => t.name === 'explainSpec')?.inputSchema.properties.explanationRef, '学習参照番号による復元ツールが公開されている');
assert.ok(list.tools.find(t => t.name === 'showMenu')?.inputSchema.properties.explanationRef,
  '検証済み解説全文を操作ボタンと同じ画面に登録できる');
assert.deepEqual(list.tools.find(t => t.name === 'showMenu')?._meta?.ui?.visibility,
  ['model','app'], '解説本文の登録ツールをAIから直接呼び出せる');
const restore = list.tools.find(t => t.name === 'restoreStudyView');
const handoff = list.tools.find(t => t.name === 'openHandoffView');
assert.ok(restore && handoff, '読取専用復元と新規引継ぎ画面を別ツールにする');
assert.deepEqual(restore._meta?.ui?.visibility, ['model','app'], '通常の復元はデータ専用');
assert.equal(restore._meta?.ui?.resourceUri, undefined, '復元による新しい学習枠を禁止');
assert.equal(restore._meta?.['openai/outputTemplate'], undefined, '復元による新しいウィジェットを禁止');
assert.equal(handoff._meta?.ui?.resourceUri, WIDGET_URI, '引継ぎ時だけ新しい画面枠を開く');
assert.equal(handoff._meta?.['openai/outputTemplate'], WIDGET_URI, '引継ぎ時のみ表示テンプレートを持つ');
assert.match(list.tools.find(t => t.name === 'importHandoff')?.description || '',
  /openHandoffView/, '引継ぎ指示が古い復元ツールを参照しない');

assert.deepEqual(list.tools.find(t => t.name === 'explainSpec')?._meta?.ui?.visibility, ['model','app'], '解説取得をモデルと画面に公開');
assert.match(list.tools.find(t => t.name === 'nextQuestion')?.description || '', /公式解説資料の安全な取得/, '既存のモデル公開ツールに解説参照の予備経路を公開');
const resource = await rpc('resources/read', { uri: WIDGET_URI });
assert.ok(resource.contents[0].text.includes(WIDGET_VERSION), '検査済みUIの版が公開されている');
assert.ok(!resource.contents[0].text.includes('setWidgetState'), '画面からモデル文脈の添付を要求しない');
assert.ok(resource.contents[0].text.includes("rpc('ui/message',{role:'user',content:[{type:'text',text:visible}]})"), '解説依頼は照合番号付き短文のみ送信する');
assert.ok(!resource.contents[0].text.includes('verifiedOfficialExplanation') &&
  !resource.contents[0].text.includes('.concat(blocks)') &&
  !resource.contents[0].text.includes('async function verifiedImageContext'),
  'ユーザーへのチャットに内部JSON・公式PNGを添付しない');
assert.ok(!resource.contents[0].text.includes("rpc('ui/update-model-context',{content:blocks})"), 'ACKしたのに文脈が欠落する経路に依存しない');
assert.ok(resource.contents[0].text.includes('照合番号：'), '公式問題に対応する照合番号をAIへ渡す');
assert.ok(resource.contents[0].text.includes('var explicitSession ='), 'UIは現在の資格の明示的なセッションがある場合にだけ復元する');
assert.ok(resource.contents[0].text.includes('function showPendingLesson(data)'), '接続断でも解説待ちの操作画面を維持');
assert.ok(resource.contents[0].text.includes('解説の登録状況を確認') &&
  resource.contents[0].text.includes('AI解説を再依頼'), '学習中断なしでモデルの解説登録を再試行できる');

assert.ok(resource.contents[0].text.includes("data.menu?.kind === 'lesson'") &&
  resource.contents[0].text.includes('claimFirstFrame(sid, true)'),
  'iPhoneで古い学習枠が休止しても新しいAI解説を受信枠に表示');
assert.ok(resource.contents[0].text.includes('再度、学習画面を復元'),
  '復元応答が遅い場合も操作ボタンを固定しない');
assert.ok(!resource.contents[0].text.includes('staleEntry ||'), '初回の導入画面を古いセッションで上書きしない');
assert.ok(resource.contents[0].text.includes('資格の確認なしに'), '再開画面の資格識別を保持する');
assert.ok(resource.contents[0].text.includes("q.section === '午前の部' || q.section === '午後の部'"), '公式の問題見出しに午前・午後の区分を表示する');

assert.ok(resource.contents[0].text.includes("rpc('ui/message'"), '画面操作は短いテキストで渡す');
const spec = await rpc('tools/call', { name: 'explainSpec', arguments: { correct: true, selected: '3', correctAnswer: '3' } });
assert.equal(spec.isError, true, '採点情報だけを渡してもAIへ解説データを渡さない');
assert.equal(spec.structuredContent?.error, 'EXPLANATION_REFERENCE_REQUIRED', '照合番号なしの取得を拒否');
const missing = await rpc('tools/call', { name: 'explainSpec', arguments: { sessionId: '00000000-0000-0000-0000-000000000000' } });
assert.equal(missing.isError, true);
assert.equal(missing.structuredContent.error, 'SESSION_NOT_FOUND', '本番にも読取経路があり、未知の学習を作り直さない');
const missingRef = await rpc('tools/call', { name: 'explainSpec', arguments: { explanationRef: 'E-0000000000000000' } });
assert.equal(missingRef.isError, true);
assert.equal(missingRef.structuredContent.error, 'EXPLANATION_REF_EXPIRED', '参照番号だけのモデル呼出しが公開され、未知の番号は安全に拒否');
const fallback = await rpc('tools/call', { name: 'nextQuestion', arguments: { sessionId: 'E-0000000000000000' } });
assert.equal(fallback.isError, true);
assert.equal(fallback.structuredContent.error, 'EXPLANATION_REF_EXPIRED', '登録済みnextQuestionでも照合番号を読み取り専用として処理');
const oldSchemaRef = await rpc('tools/call', { name: 'explainSpec', arguments: { sessionId: 'E-0000000000000000' } });
assert.equal(oldSchemaRef.structuredContent.error, 'EXPLANATION_REF_EXPIRED', '旧ChatGPTツールのsessionId欄でも一時参照番号を復元できる');
console.log(`PASS deployed explanation reference only, iOS-safe chat, verified showMenu schema (${WIDGET_VERSION})`);
