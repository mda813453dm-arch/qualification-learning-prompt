import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml as old } from '../src/widget-v210.js';
import { widgetHtml as active } from '../src/widget-current.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const sid='11111111-1111-4111-8111-111111111111';
const handoff=[
 '【学習引き継ぎデータ】','作成日時：2026-11-25 01:32','引継ぎID：synthetic111', '■1. 資格情報',
 ...Array.from({length:78},(_,i)=>'・合成 学習記録 '+(i+1)+' 合成用の表示検証です。'),
 'https://example.invalid/'+ 'a'.repeat(445), '<script>not-executable&</script>', '文末確認 END-1234',
].join('\n')+'\n\t  \u200b\n';
const result={handoff,log:'合成の終了ログ',display:'終了'};
const intro={status:'menu',sessionId:sid,menu:{kind:'next',sessionId:sid,prompt:'次はどうしますか？',
  body:'合成問9の解説',choices:['次の問題へ','今日はここまで（学習を終了）'],actions:['next','end']}};
function bootstrap(html,mode) {
  return html.replace('<head>',`<head><script>
    window.__copied=null;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){
      if(${mode!=='modern'})return Promise.reject(new Error('denied'));
      window.__copied=text;return Promise.resolve();
    }}});
    document.execCommand=function(command){
      if(command!=='copy'||${mode==='failure'})return false;
      const event=new Event('copy',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'clipboardData',{value:{setData(type,text){if(type==='text/plain')window.__copied=text;}}});
      document.dispatchEvent(event);return true;
    };
  </script>`);
}
for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true});
 try {
  for (const mode of ['old','modern','fallback','failure','capped','missing-id']) {
   const p=await browser.newPage({viewport:{width:375,height:667},colorScheme:mode==='fallback'?'light':'dark',
     isMobile:true,hasTouch:true,userAgent:name==='chromium'?'Mozilla/5.0 (Linux; Android 14; Fixture) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Mobile Safari/537.36':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
   const payload=mode==='missing-id'?handoff.replace('引継ぎID：synthetic111\n',''):handoff;
   await p.route('https://host.invalid/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#000"></body>'}));
   await p.route('https://child.invalid/widget',r=>r.fulfill({contentType:'text/html',body:bootstrap(mode==='old'?old():active(),['capped','missing-id'].includes(mode)?'modern':mode)}));
   await p.goto('https://host.invalid/');
   await p.evaluate(({intro,result,mode})=>{
     const f=document.createElement('iframe'); f.src='https://child.invalid/widget';
     f.style.cssText='display:block;border:0;width:100%;height:100px';
     window.names=[];window.heights=[];
     const send=msg=>f.contentWindow.postMessage({jsonrpc:'2.0',...msg},'*');
     addEventListener('message',e=>{
       const m=e.data;if(e.source!==f.contentWindow||m?.jsonrpc!=='2.0')return;
       if(m.method==='ui/initialize')send({id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}});
       if(m.method==='ui/notifications/initialized')send({method:'ui/notifications/tool-result',params:{structuredContent:intro}});
       if(m.method==='ui/notifications/size-changed' && m.params?.height){
         window.heights.push(m.params.height);
         f.style.height=(mode==='capped'?Math.min(285,m.params.height):m.params.height)+'px';
       }
       if(m.method==='tools/call'){
         if(m.params.name!=='reportUiEvent')window.names.push(m.params.name);
         send({id:m.id,result:{structuredContent:m.params.name==='endStudy'?result:{status:'recorded'}}});
       }
     });
     document.body.appendChild(f);
   },{intro,result:{...result,handoff:payload},mode});
   const ui=p.frameLocator('iframe');
   await ui.getByRole('button',{name:/ここまで.*学習を終了/}).click();
   await ui.getByRole('heading',{name:'引継ぎデータ'}).waitFor();
   assert.deepEqual(await p.evaluate(()=>window.names),['endStudy']);
   const copy=ui.getByRole('button',{name:'引継ぎデータをコピー'});
   const el=ui.locator('#ho');
   if(mode==='old'){
      assert.equal(await el.inputValue(),handoff);
      const rect=await el.evaluate(t=>({tag:t.tagName,h:t.clientHeight,scroll:t.scrollHeight,fg:getComputedStyle(t).color,bg:getComputedStyle(t).backgroundColor}));
      assert.equal(rect.tag,'TEXTAREA');assert.ok(rect.scroll>rect.h);
      console.log(name,'old nested scroll exact payload',JSON.stringify(rect));await p.close();continue;
   }
   if(mode==='missing-id')assert.equal(await ui.locator('#handoffDisplayId').count(),0);
   else assert.equal(await ui.locator('#handoffDisplayId').innerText(),'synthetic111');
   assert.equal(await ui.locator('#app .row button').first().getAttribute('id'),'cp');
   assert.equal(await el.isVisible(),false);
   assert.equal(await ui.locator('textarea').count(),0);
   const layout=await copy.evaluate(b=>({bottom:b.getBoundingClientRect().bottom,height:innerHeight}));
   if(mode==='capped')assert.ok(layout.bottom<=285 && layout.height<=285);
   await copy.click();
   if(mode==='failure'){
      await ui.getByRole('status').filter({hasText:'自動コピーできませんでした'}).waitFor();
      assert.equal(await el.isVisible(),true);
      assert.equal(await el.evaluate(t=>window.__copied),null);
   } else {
      await ui.getByRole('status').filter({hasText:'全文をコピーしました'}).waitFor();
      assert.equal(await el.evaluate(t=>window.__copied),payload);
      assert.equal(await el.isVisible(),false);
   }
   if(mode!=='capped'){
     if(mode!=='failure')await ui.getByRole('button',{name:'全文を表示'}).click();
     await el.waitFor();
     assert.equal(await el.textContent(),payload);
     const rect=await el.evaluate(t=>({tag:t.tagName,h:t.clientHeight,sh:t.scrollHeight,w:t.clientWidth,sw:t.scrollWidth,
       focus:t.ownerDocument.activeElement===t,xss:!!t.querySelector('script'),overflow:getComputedStyle(t).overflowY}));
     assert.equal(rect.tag,'PRE');assert.equal(rect.focus,false);assert.equal(rect.xss,false);
     assert.equal(rect.overflow,'visible');assert.ok(Math.abs(rect.h-rect.sh)<=1&&Math.abs(rect.w-rect.sw)<=1,JSON.stringify(rect));
     await p.waitForFunction(()=>Math.max(...window.heights)>667);
     await ui.getByRole('button',{name:'全文を閉じる'}).click();
     assert.equal(await el.isVisible(),false);
   }
   assert.deepEqual(await p.evaluate(()=>window.names),['endStudy']);
   console.log(name,mode,'PASS',JSON.stringify(layout));
   await p.close();
  }
 } finally {await browser.close();}
}
