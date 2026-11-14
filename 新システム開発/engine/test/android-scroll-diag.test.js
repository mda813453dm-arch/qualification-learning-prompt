import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRpc } from '../src/mcp.js';
import { WIDGET_VERSION, widgetHtml } from '../src/widget-current.js';
import { WIDGET_VERSION as V192_VERSION, widgetHtml as v192Html } from '../src/widget-v192.js';
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

test('legacy v192 (cached sessions) keeps natural height and Android-only passive diagnostics', () => {
  const html=v192Html();
  assert.match(html,/id="qlp-v191-scroll-diag"/);
  assert.match(html,/if\(!\/Android\/i\.test\(ua\)\)return;/,'diagnostics do not run on iPhone');
  assert.match(html,/var isAndroid = false; \/\/ v192/,'Android no longer caps the frame height');
  assert.match(html,/if \(false \/\* v192/,'Android no longer enters the bounded inner-scroll mode');
  const main=html.slice(0,html.indexOf('<script id="qlp-v191-scroll-diag">'));
  assert.equal((main.match(/\/Android\/i\.test\(/g)||[]).length,1,'only the disabled legacy branch mentions Android in the main script');
  assert.match(html,/⓪全体表示/);
  assert.match(html,/m\.tc>=m\.te/,'cancelled gestures are judged as 2');
  const script=html.slice(html.indexOf('<script id="qlp-v191-scroll-diag">'));
  assert.doesNotMatch(script,/preventDefault\(/,'measurement never cancels touch scrolling');
  assert.doesNotMatch(script,/sessionId|studyId|learnerId|localStorage/,'no identifiers are collected');
  assert.ok(html.includes("var VERSION='"+V192_VERSION+"'"));
  assert.doesNotMatch(v190Html(),/qlp-v191-scroll-diag/);
  assert.doesNotMatch(html,/qlp-v193-no-scroll-diag/,'v192 HTML stays immutable');
});

test('v193 removes the scroll diagnostics menu and keeps the v192 natural-height display', () => {
  const html=widgetHtml();
  assert.equal(WIDGET_VERSION,'2026-11-14.193');
  assert.match(html,/qlp-v193-no-scroll-diag/);
  // 診断ボタン・パネル・計測・自動報告がすべて無い。
  assert.doesNotMatch(html,/qlp-v191-scroll-diag|qlpScrollDiag|スクロール診断|android_scroll_diag/);
  // 表示方式はv192のまま（Androidも内容全体の高さ）。
  assert.match(html,/var isAndroid = false; \/\/ v192/);
  assert.match(html,/if \(false \/\* v192/);
  assert.equal((html.match(/\/Android\/i\.test\(/g)||[]).length,1,'only the disabled legacy branch mentions Android');
  // 診断以外はv192と同一（版番号と目印だけが違う）。
  const strip=s=>s.replaceAll(V192_VERSION,'V').replaceAll(WIDGET_VERSION,'V');
  let old=strip(v192Html());
  const a=old.indexOf('\n<style id="qlp-v191-scroll-diag-style">');old=old.slice(0,a)+old.slice(old.indexOf('</style>',a)+8);
  const b=old.indexOf('<script id="qlp-v191-scroll-diag">');old=old.slice(0,b)+old.slice(old.indexOf('</script>',b)+9);
  assert.equal(strip(html).replace('<meta name="qlp-build" content="qlp-v193-no-scroll-diag">',''),old);
});
