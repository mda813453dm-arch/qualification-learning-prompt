import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRpc } from '../src/mcp.js';
import { WIDGET_VERSION, widgetHtml } from '../src/widget-current.js';
import { widgetHtml as v190Html } from '../src/widget-v190.js';

const rpc = (id, method, params={}) => ({ jsonrpc: '2.0', id, method, params });
const opts = { widget:true, baseUrl:'https://qlp.example' };
const api = () => { throw Error('scroll diagnostics must not touch study data'); };
const report = (id, args) => handleRpc(rpc(id,'tools/call',{name:'reportUiEvent',arguments:args}),api,opts);

test('Android scroll diagnostics are recorded as aggregate values only', async () => {
  const logs=[]; const orig=console.log; console.log=(...a)=>{ logs.push(a.join(' ')); };
  try {
    const diag={trigger:'manual',ts:3,tm:0,tc:3,appCH:420,appSH:4779,appST:0,appOv:'auto',embedded:true,ua:'Mozilla/5.0 (Linux; Android 14) ChatGPT'};
    const ok=(await report(1,{stage:'android_scroll_diag',version:WIDGET_VERSION,diag})).result;
    assert.equal(ok.isError,undefined);
    assert.equal(ok.structuredContent.status,'recorded');
    const line=logs.map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(x=>x?.event==='widget_scroll_diag');
    assert.ok(line,'diagnostic event is logged for Cloud Run aggregation');
    assert.deepEqual(line.diag,diag);
    assert.equal(line.version,WIDGET_VERSION);
  } finally { console.log=orig; }
  // Older widgets keep reporting without diag.
  assert.equal((await report(2,{stage:'render_question',version:'2026-11-11.190'})).result.isError,undefined);
});

test('Scroll diagnostics reject identifiers, nested data and oversized values', async () => {
  const bad=[
    {stage:'android_scroll_diag',version:WIDGET_VERSION,diag:{nested:{a:1}}},
    {stage:'android_scroll_diag',version:WIDGET_VERSION,diag:{list:[1,2]}},
    {stage:'android_scroll_diag',version:WIDGET_VERSION,diag:{'session-id':'x'}},
    {stage:'android_scroll_diag',version:WIDGET_VERSION,diag:{ua:'x'.repeat(161)}},
    {stage:'android_scroll_diag',version:WIDGET_VERSION,diag:Object.fromEntries(Array.from({length:65},(_,i)=>['k'+i,i]))},
    {stage:'render_question',version:WIDGET_VERSION,diag:{ts:1}},
    {stage:'android_scroll_diag',version:WIDGET_VERSION,diag:{ts:1},sessionId:'leak'},
  ];
  for (const [i,args] of bad.entries()) {
    const r=(await report(10+i,args)).result;
    assert.equal(r.isError,true,'rejected case '+i);
  }
});

test('v191 adds Android-only passive diagnostics and keeps v190 scroll CSS', () => {
  const html=widgetHtml();
  assert.match(html,/id="qlp-v191-scroll-diag"/);
  assert.match(html,/if\(!\/Android\/i\.test\(ua\)\)return;/,'diagnostics do not run on iPhone');
  assert.match(html,/qlp-android-v190-inner-scroll/);
  const script=html.slice(html.indexOf('<script id="qlp-v191-scroll-diag">'));
  assert.doesNotMatch(script,/preventDefault\(/,'measurement never cancels touch scrolling');
  assert.doesNotMatch(script,/sessionId|studyId|learnerId|localStorage/,'no identifiers are collected');
  assert.ok(html.includes("var VERSION='"+WIDGET_VERSION+"'"));
  assert.doesNotMatch(v190Html(),/qlp-v191-scroll-diag/);
});
