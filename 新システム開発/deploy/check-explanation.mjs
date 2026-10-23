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
assert.equal(list.tools.find(t => t.name === 'explainSpec')?._meta, undefined, 'モデルから解説取得ツールが見える');
const resource = await rpc('resources/read', { uri: WIDGET_URI });
assert.ok(resource.contents[0].text.includes(WIDGET_VERSION), '検査済みUIの版が公開されている');
assert.ok(!resource.contents[0].text.includes('setWidgetState'), '画面からモデル文脈の添付を要求しない');
assert.ok(resource.contents[0].text.includes("content:[{type:'text',text:visible}].concat(blocks)"), '解説依頼と公式根拠を同じui/messageで送る');
assert.ok(resource.contents[0].text.includes("audience:['assistant']"), '利用者に表示しない根拠をAIへ渡す');
assert.ok(!resource.contents[0].text.includes("rpc('ui/update-model-context',{content:blocks})"), 'ACKしたのに文脈が欠落する経路に依存しない');
assert.ok(resource.contents[0].text.includes('照合番号：'), '公式問題に対応する照合番号をAIへ渡す');
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
const oldSchemaRef = await rpc('tools/call', { name: 'explainSpec', arguments: { sessionId: 'E-0000000000000000' } });
assert.equal(oldSchemaRef.structuredContent.error, 'EXPLANATION_REF_EXPIRED', '旧ChatGPTツールのsessionId欄でも一時参照番号を復元できる');
console.log(`PASS deployed explanation model-visible lookup, durable reference, and read-only context route (${WIDGET_VERSION})`);
