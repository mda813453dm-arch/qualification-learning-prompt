import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetHtml as oldWidgetHtml } from '../src/widget.js';
import { widgetHtml, WIDGET_URI, WIDGET_VERSION } from '../src/widget-v167.js';
import { confirmationWidgetHtml, MANKAN_CONFIRMATION } from '../src/confirmation-widget-compat.js';
import { handleRpc } from '../src/mcp.js';

test('曼ション管理士の第1〜3問は原典と正答付きで事前検証されている', () => {
  assert.equal(MANKAN_CONFIRMATION.questions.length, 3);
  assert.match(MANKAN_CONFIRMATION.sourceUrl, /^https:\/\/www\.mlit\.go\.jp\//);
  for (const q of MANKAN_CONFIRMATION.questions) {
    assert.ok(q.question.length >= 10);
    assert.ok(q.choices.length >= 2);
    assert.ok(Number.isInteger(q.correctAnswer));
    assert.ok(q.correctAnswer >= 1 && q.correctAnswer <= q.choices.length);
    assert.ok(q.explanation.length >= 12);
  }
});
test('公開MCP学習枠は確認問題3問の固定バンクを初期化し、AIへの重複依頼をしない', async () => {
  const html = widgetHtml();
  assert.match(html, /preparedLessons\["管理組合の運営の円滑化"\] = /);
  assert.match(html, /registerPreparedConfirmation\(data.fieldName, position, idForConfirmation\)/);
  assert.doesNotMatch(html, /retryCheckStart/);
  assert.doesNotMatch(html, /ask\(field \+ 'を確認問題から始めます。'\)/);
  assert.match(html, /確認問題は未登録です/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length);
  scripts.forEach(src => assert.doesNotThrow(() => new Function(src), '配信JSの構文'));
  const result = await handleRpc({jsonrpc:'2.0',method:'resources/read',id:6,params:{uri:WIDGET_URI}},
    async () => ({status: 500, body:{}}), {widget:true, baseUrl:'https://qlp.test'});
  assert.equal(WIDGET_VERSION,'2026-11-01.167');
  assert.match(result.result.contents[0].text, /preparedLessons\["管理組合の運営の円滑化"\] = /);
});
test('モデルから登録は可能だが、正答採点ツールを外部に露出しない',async()=>{
  const list = await handleRpc({jsonrpc:'2.0',method:'tools/list',id:7,params:{}},
    async()=>({status:500,body:{}}),{widget:false});
  const names=list.result.tools.map(x=>x.name);
  assert.ok(names.includes('registerConfirmationQuestion'));
  assert.ok(!names.includes('answerConfirmationQuestion'));
  assert.ok(!names.includes('getStudySnapshot'));
});
test('上流UIが改変された場合は誤った差分を黙って適用しない',()=>{
  assert.throws(()=>confirmationWidgetHtml('<html></html>'),/WIDGET_COMPAT_ANCHOR_CHANGED/);
});
