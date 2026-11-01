import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetHtml, WIDGET_URI, WIDGET_VERSION } from '../src/widget-v167.js';
import { handleRpc } from '../src/mcp.js';
test('50%出題に対応するMCP画面は新URIを使い、採点前の正答や古い3問固定表示を復活させない', async()=>{
  assert.equal(WIDGET_URI,'ui://qlp/question-v167.html');
  assert.equal(WIDGET_VERSION,'2026-11-01.167');
  const html=widgetHtml();
  assert.match(html,/fieldQuestionTotal/);
  assert.match(html,/localBar\('この分野の実践問題', p\.fieldQuestion, p\.fieldQuestionTotal\)/);
  assert.match(html,/localBar\('この分野の実践問題', progress\.fieldQuestion, progress\.fieldQuestionTotal\)/);
  assert.doesNotMatch(html,/localBar\('この分野の実践問題', Math\.min\(3,/);
  assert.match(html,/確認問題・第/);
  assert.match(html,/スクロール|scrollIntoView/);
  const result=await handleRpc({jsonrpc:'2.0',method:'resources/read',id:12,params:{uri:WIDGET_URI}},
    async()=>({status:500,body:{}}),{widget:true,baseUrl:'https://qlp.test'});
  assert.match(result.result.contents[0].text,/fieldQuestionTotal/);
});
