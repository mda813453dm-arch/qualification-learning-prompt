import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml as active } from '../src/widget-current.js';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { SRC, T0, assetsB64, fakeParser, fakeWeb, pdf } from './helpers.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const makeStudy=async()=>{
 const web=fakeWeb({[SRC.questionUrl]:pdf('q-v1'),[SRC.answerUrl]:pdf('a-v1')});
 const parse=fakeParser(web,{answers:[3,1,4,2,1,2]});
 let now=T0, rpcId=0;
 const env={STORE:new MemoryStore(),API_TOKEN:'synthetic-token',clock:()=>now,fetchPdf:web.fetchPdf,PARSER_URL:'https://parser.invalid'};
 env.parserFetch=async(_,init)=>{
   const b=JSON.parse(init.body);
   const bytes=x=>Uint8Array.from(atob(x.base64),c=>c.charCodeAt(0));
   const r=await parse({question:{bytes:bytes(b.question)},answer:{bytes:bytes(b.answer)}});
   return Response.json({result:r.result,assets:assetsB64(r.assets)});
 };
 const api=async(path,body)=>{
   const r=await handle(new Request('https://engine.invalid'+path,{method:'POST',headers:{authorization:'Bearer synthetic-token','content-type':'application/json'},body:JSON.stringify(body)}),env);
   assert.ok([200,201].includes(r.status),`unexpected HTTP status ${r.status} for ${path}`);
   return r.json();
 };
 const rpc=async(name,args)=>{
   const r=await api('/app',{jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}});
   assert.equal(r.error,undefined); assert.notEqual(r.result.isError,true);
   return r.result;
 };
 const {sessionId,learnerId}=await api('/v1/sessions',{qualificationId:SRC.qualificationId,sources:[SRC]});
 const {studyId}=await api('/v1/study/start',{qualificationName:'測量士補',learnerId});
 const {question}=await api('/v1/sessions/'+sessionId+'/next',{});
 const graded=await rpc('submitAnswer',{sessionId,studyId,learnerId,questionId:question.questionId,value:'3'});
 assert.ok(graded.structuredContent.grade.correct);
 now+=6*60000;
 const intro={status:'menu',sessionId,studyId,learnerId,menu:{kind:'next',sessionId,studyId,learnerId,prompt:'次はどうしますか？',body:'合成問の解説',choices:['次の問題へ','今日はここまで（学習を終了）'],actions:['next','end']}};
 return {intro,rpc,sessionId,studyId,learnerId};
};
function bootstrap(html,mode) {
  return html.replace('<head>',`<head><script>
    window.__copied=null;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){
      if(${mode!=='modern'})return Promise.reject(new Error('denied'));
      window.__copied=text;return Promise.resolve();
    }}});
    document.execCommand=function(command){
      if(command!=='copy')return false;
      const event=new Event('copy',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'clipboardData',{value:{setData(type,text){if(type==='text/plain')window.__copied=text;}}});
      document.dispatchEvent(event);return true;
    };
  </script>`);
}
for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true,executablePath:name==='webkit'?process.env.LOCAL_WEBKIT:process.env.LOCAL_CHROMIUM});
 try {
  for (const mode of (name==='chromium'?['native','modern','fallback','capped']:['modern','fallback','capped'])) {
   const {intro,rpc,sessionId,learnerId}=await makeStudy();
   let result;
   const p=await browser.newPage({viewport:{width:375,height:667},colorScheme:mode==='fallback'?'light':'dark',
     isMobile:true,hasTouch:true,userAgent:name==='chromium'?'Mozilla/5.0 (Linux; Android 14; Fixture) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Mobile Safari/537.36':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
   if(mode==='native')await p.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://child.invalid'});
   await p.exposeFunction('endWithEngine',async(args)=>{
     assert.equal(args.sessionId,sessionId);
     const r=await rpc('endStudy',args);
     result=r._meta?.qlp??r.structuredContent;
     assert.match(result.handoff,/学習引き継ぎデータ/);
     return r;
   });
   await p.route('https://host.invalid/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#000"></body>'}));
   await p.route('https://child.invalid/widget',r=>r.fulfill({contentType:'text/html',body:mode==='native'?active():bootstrap(active(),mode==='capped'?'modern':mode)}));
   await p.goto('https://host.invalid/');
   await p.evaluate(({intro,mode})=>{
     const f=document.createElement('iframe'); f.src='https://child.invalid/widget';
     if(mode==='native')f.allow='clipboard-read; clipboard-write';
     f.style.cssText='display:block;border:0;width:100%;height:100px';
     window.names=[];window.heights=[];
     const send=msg=>f.contentWindow.postMessage({jsonrpc:'2.0',...msg},'*');
     addEventListener('message',async e=>{
       const m=e.data;if(e.source!==f.contentWindow||m?.jsonrpc!=='2.0')return;
       if(m.method==='ui/initialize')send({id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}});
       if(m.method==='ui/notifications/initialized')send({method:'ui/notifications/tool-result',params:{structuredContent:intro}});
       if(m.method==='ui/notifications/size-changed' && m.params?.height){
         window.heights.push(m.params.height);
         f.style.height=(mode==='capped'?Math.min(285,m.params.height):m.params.height)+'px';
       }
       if(m.method==='tools/call'){
         if(m.params.name!=='reportUiEvent')window.names.push(m.params.name);
         send({id:m.id,result:m.params.name==='endStudy'?await window.endWithEngine(m.params.arguments):{structuredContent:{status:'recorded'}}});
       }
     });
     document.body.appendChild(f);
   },{intro,mode});
   const ui=p.frameLocator('iframe');
   await ui.getByRole('button',{name:/ここまで.*学習を終了/}).click();
   await ui.getByRole('heading',{name:'引継ぎデータ'}).waitFor();
   assert.deepEqual(await p.evaluate(()=>window.names),['endStudy']);
   const copy=ui.getByRole('button',{name:'引継ぎデータをコピー'});
   const el=ui.locator('#ho');
   const payload=result.handoff;
   assert.match(payload,/引継ぎID/);
   assert.equal(await ui.locator('#handoffDisplayId').innerText(),learnerId);
   assert.equal(await ui.locator('#app .row button').first().getAttribute('id'),'cp');
   assert.equal(await el.isVisible(),false);
   assert.equal(await ui.locator('textarea').count(),0);
   const layout=await copy.evaluate(b=>({bottom:b.getBoundingClientRect().bottom,height:innerHeight}));
   if(mode==='capped')assert.ok(layout.bottom<=285 && layout.height<=285);
   await copy.click();
      await ui.getByRole('status').filter({hasText:'全文をコピーしました'}).waitFor();
      const copied=mode==='native'?await el.evaluate(()=>navigator.clipboard.readText()):await el.evaluate(()=>window.__copied);
      assert.equal(copied,payload);
      const restored=await rpc('importHandoff',{handoff:copied});
      assert.equal(restored._meta?.qlp?.restored,1);
      assert.equal(restored.structuredContent.answeredCount,1);
      assert.equal(restored.structuredContent.learnerId,learnerId);
      assert.equal(await el.isVisible(),false);
   if(mode!=='capped'){
     await ui.getByRole('button',{name:'全文を表示'}).click();
     await el.waitFor();
     assert.equal(await el.textContent(),payload);
     const rect=await el.evaluate(t=>({tag:t.tagName,h:t.clientHeight,sh:t.scrollHeight,w:t.clientWidth,sw:t.scrollWidth,
       focus:t.ownerDocument.activeElement===t,xss:!!t.querySelector('script'),overflow:getComputedStyle(t).overflowY}));
     assert.equal(rect.tag,'PRE');assert.equal(rect.focus,false);assert.equal(rect.xss,false);
     assert.equal(rect.overflow,'visible');assert.ok(Math.abs(rect.h-rect.sh)<=1&&Math.abs(rect.w-rect.sw)<=1,JSON.stringify(rect));
     await p.waitForFunction(()=>window.heights.length>1);
     await ui.getByRole('button',{name:'全文を閉じる'}).click();
     assert.equal(await el.isVisible(),false);
   }
   assert.deepEqual(await p.evaluate(()=>window.names),['endStudy']);
   console.log(name,mode,'PASS',JSON.stringify(layout));
   await p.close();
  }
 } finally {await browser.close();}
}
