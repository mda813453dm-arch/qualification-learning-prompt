// Android Brave regression: do not scroll ChatGPT host to the previous grade,
// and do not let an old read-only snapshot override the new problem.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-v168.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const sid = 'brave-next-restore-test';
const one = {status:'question',sessionId:sid,at:100,question:{
  questionId:'takken:2025:main:10',year:2025,questionNumber:10,fieldName:'宅建業法',
  stem:'問10の本文',choices:['1','2','3','4'],progress:{fieldIndex:1,fieldTotal:7,fieldQuestion:1,fieldQuestionTotal:84,total:167,done:0}
}};
const two = {status:'question',sessionId:sid,at:200,question:{
  ...one.question,questionId:'takken:2025:main:11',questionNumber:11,stem:'問11の本文',
  progress:{...one.question.progress,fieldQuestion:2,done:1}
}};
const grade={questionId:one.question.questionId,correct:true,selected:'3',correctAnswer:3,acceptedAnswers:[3]};
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    await page.route('https://qlp.test/**',route=>route.fulfill({contentType:'text/html',
      body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'}));
    await page.goto('https://qlp.test/');
    await page.evaluate(({html,sid,one,two,grade})=>{
      window.calls=[];window.pendingSnapshot=[];window.holdSnapshot=false;
      const iframe=document.createElement('iframe');iframe.id='study';
      iframe.style.cssText='width:100%;height:800px;border:0';
      const reply=(id,result)=>iframe.contentWindow.postMessage({jsonrpc:'2.0',id,result},'*');
      window.deliver=view=>iframe.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{_meta:{qlp:view}}},'*');
      window.addEventListener('message',e=>{
        if(e.source!==iframe.contentWindow||!e.data||e.data.jsonrpc!=='2.0')return;
        const m=e.data;
        if(m.method==='ui/initialize')reply(m.id,{protocolVersion:'2026-01-26',hostCapabilities:{}});
        else if(m.method==='ui/notifications/initialized')window.deliver(one);
        else if(m.method==='tools/call'){
          window.calls.push(m.params.name);
          if(m.params.name==='submitAnswer')reply(m.id,{structuredContent:{grade,next:two}});
          else if(m.params.name==='getStudySnapshot'){
            const answer={structuredContent:window.holdSnapshot ? {status:'restoredGrade',sessionId:sid,question:one.question,grade,next:two,at:120} : one};
            if(window.holdSnapshot)window.pendingSnapshot.push(()=>reply(m.id,answer));
            else reply(m.id,answer);
          } else if(m.params.name==='nextQuestion')reply(m.id,{structuredContent:two});
          else reply(m.id,{structuredContent:{status:'recorded'}});
        }
      });
      const injection='<script>window.__scrollCalls=0;Element.prototype.scrollIntoView=function(){window.__scrollCalls++};window.openai={toolOutput:'+JSON.stringify(one)+',toolInput:{sessionId:'+JSON.stringify(sid)+'},notifyIntrinsicHeight:function(h){if(window.frameElement)window.frameElement.style.height=Math.ceil(h)+"px"}};<\/script><script>';
      iframe.srcdoc=html.replace('<script>',injection);
      document.body.appendChild(iframe);
    },{html:widgetHtml(),sid,one,two,grade});
    const ui=page.frameLocator('#study');
    await ui.getByText('問10の本文',{exact:true}).waitFor({timeout:8000}).catch(async err=>{
      const state=await ui.locator('body').innerText().catch(()=>'(no iframe body)');
      const html=await ui.locator('body').innerHTML().catch(()=>'(no iframe html)');
      const messages=await page.evaluate(()=>window.calls);
      throw new Error('BRAVE_BOOT_FAILED '+JSON.stringify({state:state.slice(0,1700),html:html.slice(0,2200),errors,messages}).slice(0,5000)+' '+err.message);
    });
    await ui.locator('input[name=ans][value="3"]').check();
    await ui.getByRole('button',{name:'解答する',exact:true}).click();
    await ui.getByText('✓ 正解！').waitFor();
    // Reproduce old stale snapshot reading in parallel with the foreground click.
    await page.evaluate(()=>{window.holdSnapshot=true;});
    await ui.locator('#app').evaluate(()=>{
      const ev=new Event('pageshow');
      Object.defineProperty(ev,'persisted',{value:true});
      window.dispatchEvent(ev);
    });
    await page.waitForFunction(()=>window.pendingSnapshot.length>0);
    await ui.locator('#next').click();
    await ui.getByText('問11の本文',{exact:true}).waitFor();
    await page.evaluate(()=>{window.pendingSnapshot.splice(0).forEach(fn=>fn());});
    await page.waitForTimeout(400);
    assert.equal(await ui.getByText('問11の本文',{exact:true}).count(),1,'古い採点画面へ戻らない');
    assert.equal(await ui.getByText('✓ 正解！').count(),0,'前問の正解表示へ逆戻りしない');
    assert.equal(await ui.locator('.latest').evaluate(el=>document.activeElement===el),true,'学習枠の先頭にfocus');
    assert.equal(await ui.locator('#app').evaluate(el=>el.scrollTop),0,'学習枠内は先頭');
    assert.equal(await ui.locator('#app').evaluate(()=>window.__scrollCalls),0,
      'Braveの親会話を動かすscrollIntoViewを呼ばない');
    assert.equal(await page.evaluate(()=>window.calls.filter(n=>n==='submitAnswer').length),1,'再採点しない');
    assert.deepEqual(errors,[]);
    console.log(name+': PASS Android Brave next, top focus, no outer scroll, stale restore guard (375px)');
  } finally {await browser.close();}
}
