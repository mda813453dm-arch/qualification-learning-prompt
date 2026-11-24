// A queued alignment can fire between focus and insertion in WebKit.
// Replay the actual one-shot 320ms callback, then use real Playwright events.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-current.js';
import { overviewFor } from '../src/app.js';

const require=createRequire(import.meta.url);
const { chromium, webkit }=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const target = {status:'needPlan',planReady:true,learnerId:'testlearner',sessionId:'test-session',
  overview:overviewFor('land_surveyor'),plan:{fields:['午前の部（測量・記述）','午後の部（土地の記述）','午後の部（建物の記述）']}};
const result={_meta:{qlp:target},structuredContent:{status:target.status}};
const html=widgetHtml().replace('<script>',String.raw`<script>
const schedule=window.setTimeout;
window.setTimeout=function(cb, ms, ...args){
  if(ms===320 && typeof cb==='function' && /fit\(\); align\(\)/.test(String(cb))) window.__queuedFocus=cb;
  return schedule.call(window,cb,ms,...args);
};
document.addEventListener('focus',e=>{
  if(e.target.id==='otherText' && window.__queuedFocus && !window.__focusReplayed){
    window.__focusReplayed=true;
    window.__queuedFocus();
    window.__editableRetained=document.activeElement===e.target;
  }
},true);
</script><script>`);
const defaultEngines=[['chromium',chromium],['webkit',webkit]];
const engines=process.env.ISSUE5_EDITABLE_BROWSER ? defaultEngines.filter(([name])=>name===process.env.ISSUE5_EDITABLE_BROWSER) : defaultEngines;
assert.ok(engines.length);
for(const [name, engine] of engines){
  const executablePath = name==='webkit' ? process.env.ISSUE5_WEBKIT : undefined;
  const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
  try {
    const page=await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
    await page.route('https://qlp.test/',r=>r.fulfill({contentType:'text/html',
      body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'}));
    await page.goto('https://qlp.test/');
    await page.evaluate(({html,result})=>{
      const f=document.createElement('iframe');f.style.cssText='width:100%;height:600px;border:0';
      window.addEventListener('message',e=>{
        if(e.source!==f.contentWindow || e.data?.jsonrpc!=='2.0')return;
        const {method,id}=e.data;
        const send=(extra)=>f.contentWindow.postMessage({jsonrpc:'2.0',...extra},'*');
        if(method==='ui/initialize')send({id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}});
        else if(method==='ui/notifications/initialized')send({method:'ui/notifications/tool-result',params:result});
        else if(method==='ui/notifications/size-changed' && e.data.params?.height){
          f.style.height=Math.ceil(e.data.params.height)+'px';
        } else if(method==='tools/call')send({id,result:{structuredContent:{status:'restoreIdle'}}});
      });
      f.srcdoc=html;document.body.appendChild(f);
    },{html,result});
    const ui=page.frameLocator('iframe');
    await ui.getByRole('button',{name:/学習計画を見直す/}).click();
    await ui.getByRole('button',{name:'4 その他'}).click();
    const field=ui.locator('#otherText');
    await field.fill('記述式から始める');
    const trace=await field.evaluate(el=>({replayed:window.__focusReplayed,retained:window.__editableRetained,value:el.value}));
    assert.deepEqual(trace,{replayed:true,retained:true,value:'記述式から始める'},name+' keeps typing during auto-alignment');
    await ui.getByRole('button',{name:/希望を確定して開始確認へ/}).click();
    await ui.getByRole('heading',{name:'希望を反映しました｜学習開始の確認'}).waitFor();
    assert.match(await ui.locator('#app').innerText(), /記述式から始める/);
    assert.equal(await ui.locator('.latest').evaluate(el=>document.activeElement===el),true,
      'explicit navigation lands focus on the new view marker');
    console.log(name+': pending automatic alignment preserves editing; normal navigation still focuses the top');
  } finally {await browser.close();}
}
