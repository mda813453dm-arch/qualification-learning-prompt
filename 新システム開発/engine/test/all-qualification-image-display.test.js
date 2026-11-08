import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-v188.js';
import { handleRpc } from '../src/mcp.js';

test('all qualification question UI uses a fresh resource version after shared image display fix', async () => {
  assert.equal(WIDGET_URI, 'ui://qlp/question-v188.html');
  assert.equal(WIDGET_VERSION, '2026-11-08.188');
  const html = widgetHtml();
  assert.match(html, /choices\.length < 2 \|\| choices\.length > 10/);
  assert.match(html, /q\.stemMode !== 'ocr' && q\.choiceMode !== 'ocr'/);
  assert.match(html, /原本の問題画像も確認する/);
  const fetched = await handleRpc({jsonrpc:'2.0',method:'resources/read',id:888,
    params:{uri:WIDGET_URI}}, async()=>({status:500,body:{}}), {widget:true,baseUrl:'https://qlp.test'});
  assert.ok(fetched.result?.contents?.some(c=>c.uri===WIDGET_URI));
  const previous = await handleRpc({jsonrpc:'2.0',method:'resources/read',id:887,
    params:{uri:'ui://qlp/question-v187.html'}}, async()=>({status:500,body:{}}), {widget:true,baseUrl:'https://qlp.test'});
  assert.ok(previous.result?.contents?.some(c=>c.uri==='ui://qlp/question-v187.html'));
});
