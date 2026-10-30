// v113: iPhone-width end-to-end regression. No model replies allowed.
// Prepared administrative-scrivener foundation -> 3 confirmation questions -> official source status.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { widgetHtml, PREPARED_LESSONS } from '../src/widget.js';
import { T0 } from './helpers.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

for (const [browserName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const env = { STORE: new MemoryStore(), API_TOKEN:'browser-test', clock: () => T0 };
  let rpcId = 0;
  const toolCalls = [];
  async function tool(name, args) {
    toolCalls.push({ name, args });
    const response = await handle(new Request('https://engine.example/app', {
      method:'POST',headers:{authorization:'Bearer browser-test','content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}})
    }), env);
    assert.equal(response.status, 200, `${name} HTTP ${response.status}`);
    const parsed = await response.json();
    assert.equal(parsed.error,undefined,JSON.stringify(parsed.error));
    return parsed.result;
  }
  const started = await tool('startSession', { qualificationId:'行政書士',sources:[] });
  assert.equal(started.isError,undefined,JSON.stringify(started));
  const { sessionId, learnerId } = started.structuredContent;
  const study = await tool('startStudy',{learnerId,qualificationName:'行政書士'});
  assert.equal(study.isError,undefined,JSON.stringify(study));
  const fieldName='基礎法学';
  const chosen = await tool('chooseItem',{sessionId,fieldName,mode:'explain'});
  assert.equal(chosen.structuredContent.mode,'explain');
  const first = await tool('restoreStudyView',{sessionId});
  assert.equal(first._meta?.qlp?.status,'lesson_pending');

  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.exposeFunction('engineTool',tool);
    await page.route('https://qlp.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
    await page.goto('https://qlp.test/');
    await page.evaluate(({html,first})=>{
      window.modelMessages=[];
      const frame=document.createElement('iframe');
      frame.style.cssText='width:100%;height:650px;border:0';
      const send=data=>frame.contentWindow.postMessage(data,'*');
      const deliver=result=>send({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result});
      window.deliver=deliver;
      window.addEventListener('message',async event=>{
        if(event.source!==frame.contentWindow)return;
        const msg=event.data;
        if(!msg || msg.jsonrpc!=='2.0')return;
        const reply=result=>send({jsonrpc:'2.0',id:msg.id,result});
        if(msg.method==='ui/initialize')reply({protocolVersion:'2026-01-26',hostCapabilities:{}});
        else if(msg.method==='ui/notifications/initialized')deliver(first);
        else if(msg.method==='tools/call')reply(await window.engineTool(msg.params.name,msg.params.arguments));
        else if(msg.method==='ui/message'){
          window.modelMessages.push(msg.params);
          reply({});  // Deliberately do not generate an AI response.
        } else if(msg.method==='ui/update-model-context')reply({});
      });
      frame.srcdoc=html;document.body.appendChild(frame);
    },{html:widgetHtml(),first});
    const ui=page.frameLocator('iframe');
    await ui.getByRole('heading',{name:'基礎法学｜基礎解説'}).waitFor();
    const text=await ui.locator('#app').innerText();
    assert.match(text,/基礎解説（学習システム内蔵）/, 'show prepared content immediately');
    assert.match(text,/実体法/, 'show meaningful explanation without AI reply');
    assert.equal(await page.evaluate(()=>window.modelMessages.length),0,'no model interaction to render foundation');
    assert.equal(toolCalls.filter(t=>t.name==='registerConfirmationQuestion').length,0,'no question before student clicks');

    await ui.getByRole('button',{name:'確認問題へ（3問）'}).click();
    for(let pos=1;pos<=3;pos++){
      await ui.getByRole('heading',{name:`基礎法学｜確認問題・第${pos}問`}).waitFor({timeout:20000});
      const q=PREPARED_LESSONS[fieldName].questions[pos-1];
      const rendered=await ui.locator('.stem').first().innerText();
      assert.match(rendered,new RegExp(q.question.slice(0,10).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      assert.equal(await ui.locator('input[name=confirmationAnswer]').count(),3);
      assert.equal(await ui.getByRole('progressbar',{name:'この分野の確認問題の位置'}).getAttribute('aria-valuenow'),String(pos));
      await ui.locator(`input[name=confirmationAnswer][value="${q.correctAnswer}"]`).check();
      await ui.getByRole('button',{name:'解答する'}).click();
      await ui.getByRole('heading',{name:`確認問題 ${pos} / 3問の結果`}).waitFor();
      const gradeText=await ui.locator('#app').innerText();
      assert.match(gradeText,/正解/);
      assert.match(gradeText,/簡易解説/);
      if(pos<3)await ui.getByRole('button',{name:/次の確認問題へ/}).click();
    }
    assert.equal(await page.evaluate(()=>window.modelMessages.length),0,'all three questions completed with no AI tool selection');
    assert.equal(toolCalls.filter(t=>t.name==='registerConfirmationQuestion').length,3);
    assert.equal(toolCalls.filter(t=>t.name==='answerConfirmationQuestion').length,3);
    assert.equal(await ui.locator('iframe').count(),0,'no nested study frames');
    await ui.getByRole('button',{name:/同じ分野の公式過去問を解く/}).waitFor();
    await ui.getByRole('button',{name:/次の分野の学習へ/}).waitFor();
    assert.doesNotMatch(await ui.locator('#app').innerText(),/次の分野の実践問題へ/,'next field never silently chooses practice');
    const beforeRefresh=toolCalls.filter(t=>t.name==='getOfficialLibrary').length;
    await ui.getByRole('button',{name:/同じ分野の公式過去問を解く/}).click();
    await ui.getByRole('heading',{name:/過去問PDFの取り込み|公式過去問の利用・登録/}).waitFor();
    assert.doesNotMatch(await ui.locator('#app').innerText(),/実践問題へ進めませんでした/);
    assert.equal(await ui.getByRole('button',{name:'公式過去問を解く'}).count(),0,'unregistered past papers do not show practice button');
    assert.equal(await ui.locator('#licensedYear').count(),0,'no year picker');
    assert.match(await ui.locator('#app').innerText(),/最大10ファイル/);
    assert.match(await ui.locator('#app').innerText(),/出題できる過去問はまだありません/,'no official question is invented');
    assert.equal(await ui.locator('#licensedRefresh').count(),0,'登録状況は自動更新し、手動ボタンは出さない');
    for(let i=0;i<40 && toolCalls.filter(t=>t.name==='getOfficialLibrary').length===beforeRefresh;i++)
      await new Promise(resolve=>setTimeout(resolve,100));
    await ui.getByText(/まだ登録済み問題はありません/).waitFor();
    assert.equal(toolCalls.filter(t=>t.name==='getOfficialLibrary').length,beforeRefresh+1);
    assert.equal(await page.evaluate(()=>window.modelMessages.length),0,'refresh and unavailable guidance need no AI response');
    // 内蔵基礎解説からも確認問題を飛ばして同分野の公式実践へ進める。
    await page.evaluate(result => window.deliver(result),{
      structuredContent:{status:'lesson_pending',sessionId,fieldName,
        journey:{fieldIndex:1,fieldTotal:6},notice:'基礎解説を表示しています。'}
    });
    await ui.getByRole('heading',{name:'基礎法学｜基礎解説'}).waitFor();
    await ui.getByRole('button',{name:'確認問題へ（3問）'}).waitFor();
    const direct = ui.getByRole('button',{name:'公式過去問へ進む'});
    await direct.waitFor();
    const beforeDirect = toolCalls.length;
    await direct.click();
    await ui.getByRole('heading',{name:'過去問PDFの取り込み'}).waitFor();
    assert.equal(toolCalls[beforeDirect].name,'chooseItem');
    assert.equal(toolCalls[beforeDirect].args.mode,'practice');
    assert.equal(toolCalls[beforeDirect].args.fieldName,fieldName);
    assert.equal(toolCalls[beforeDirect+1].name,'nextQuestion');
    assert.equal(toolCalls[beforeDirect+1].args.question,fieldName);
    assert.equal(await page.evaluate(()=>window.modelMessages.length),0,'direct practice never asks model to create questions');
    const restored=await tool('restoreStudyView',{sessionId});
    assert.ok(restored._meta?.qlp,'study record survives progression');
    assert.deepEqual(errors,[],'no JavaScript exceptions');
    console.log(`${browserName}: PASS v115 instant foundation, 3 graded confirmations, explicit source state, no AI calls, same frame (375px)`);
  }finally{await browser.close();}
}
