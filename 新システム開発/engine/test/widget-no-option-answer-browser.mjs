import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-v205.js';
import { grade as programGrade } from '../src/engine.js';
import { widgetHtml as currentWidgetHtml } from '../src/widget-current.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.ISSUE7_BASE === '1';
const html = base ? widgetHtml() : currentWidgetHtml();
const dir = new URL('./evidence/', import.meta.url).pathname;
await mkdir(dir,{recursive:true});
const sid = '11111111-1111-1111-1111-111111111111';
const next = {status:'finished',sessionId:sid,reason:'完了'};
const q4 = {number:4,label:'正解肢なし（全員正解）',accepted:[1,2,3,4],answer:1};
const q9 = {number:9,label:'2または3',accepted:[2,3],answer:2};
const q1 = {number:1,answer:3};
const browserEngine = process.env.ISSUE7_WEBKIT === '1' ? webkit : chromium;
const engineOptions = browserEngine === chromium && process.env.CHROMIUM_PATH
  ? {executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']} : {};
const browser = await browserEngine.launch({headless:true,...engineOptions});
try {
  for (const [fixture,value,mode] of [
    [q4,2,'answer'],[q4,4,'answer'],[q4,1,'restore'],
    [q4,'分からない','answer'],[q9,2,'answer'],[q9,3,'restore'],
    [q9,1,'answer'],[q1,3,'answer'],[q1,1,'restore'],
  ]) {
    const {number,label,accepted,answer} = fixture;
    const questionId = 'q018:2022:main:'+number;
    const question = {questionId,year:2022,questionNumber:number,stem:'合成問題：問'+number,
      choices:['選択肢A','選択肢B','選択肢C','選択肢D'],figures:[],fieldName:'区分所有法'};
    const current = {questionId,correctAnswer:answer,correctAnswerLabel:label,
      acceptedAnswers:accepted,allCorrect:number===4,choiceCount:4,kind:'new',
      source:{answerPdfUrl:'https://www.mankan.org/pdf/R04_answer.pdf',answerSourceType:'official_pdf'}};
    const evaluated = programGrade({qualificationId:'q018',current,review:{},history:{},plan:{}},
      {questionId,value}, {today:'2026-11-24',now:Date.UTC(2026,10,24),intervals:[1,3,7]});
    assert.equal(evaluated.ok,true);
    const grade = evaluated.grade;
    const expectedCorrect = value === '分からない' ? undefined : number === 4 || (accepted || [answer]).includes(value);
    assert.equal(grade.correct,expectedCorrect);
    assert.deepEqual(grade.acceptedAnswers,accepted);
    assert.equal(evaluated.state.history[questionId].result,grade.result);

    const page = await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://widget.test/',route=>route.fulfill({
      contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>'
    }));
    await page.goto('https://widget.test/');
    await page.evaluate(({html,initial,grade,next})=>{
      const frame=document.createElement('iframe');
      frame.style='width:100%;height:600px;border:0'; window.calls=[];
      frame.srcdoc=html;
      const send=(m)=>frame.contentWindow.postMessage({jsonrpc:'2.0',...m},'*');
      const deliver=(data)=>send({method:'ui/notifications/tool-result',params:{_meta:{qlp:data}}});
      addEventListener('message',({source,data:m})=>{
        if(source!==frame.contentWindow||!m||m.jsonrpc!=='2.0') return;
        if(m.method==='ui/initialize') send({id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}});
        else if(m.method==='ui/notifications/initialized') deliver(initial);
        else if(m.method==='tools/call'){
          const {name,arguments:args}=m.params;
          window.calls.push([name,args]);
          const data = name==='submitAnswer' ? {grade,next} : name==='nextQuestion' ? next : initial;
          send({id:m.id,result:{_meta:{qlp:data}}});
        }
      });
      document.body.append(frame);
    },{html,initial:{status:mode==='restore'?'restoredGrade':'question',
      sessionId:sid,question,...(mode==='restore'?{grade,next}:{})},grade,next});
    const f=page.frameLocator('iframe');
    if(mode==='answer'){
      if (value==='分からない') await f.locator('#dk').tap();
      else { await f.locator('.opt[data-n="'+value+'"]').tap(); await f.locator('#decide').tap(); }
    }
    const summary=f.locator('.official-answer-summary');
    await summary.waitFor();
    await summary.locator('summary').tap();
    const badges=await summary.locator('li').allTextContents();
    assert.equal(badges.length,4);
    const labeled=badges.flatMap((text,i)=>text.includes('【正答】')?[i+1]:[]);
    const selected=badges.flatMap((text,i)=>text.includes('【あなたの回答】')?[i+1]:[]);
    const full=await summary.innerText();
    assert.deepEqual(selected,typeof value==='number'?[value]:[]);
    if(number===4){
      if(base){
        assert.deepEqual(labeled,[1,2,3,4]);
        assert.equal(await summary.locator('.qlp-answer-text').count(),4);
        console.log('Reproduced: v205 shows all four option badges and four correct-option blocks');
        await page.screenshot({path:dir+'v205-q4-before.png',fullPage:true});
        break;
      }
      assert.deepEqual(labeled,[]);
      assert.equal(await summary.locator('.qlp-answer-text').count(),0);
      assert.match(full,/公式発表：正解肢なし。全解答を採点上正解として扱います。/);
      assert.equal(await f.locator('.opt.correct').count(),0);
      if(value==='分からない') assert.match(await f.locator('#app').innerText(),/分からない（採点には数えません）/);
      else assert.match(await f.locator('.grade-word').innerText(),/採点上の正解/);
    } else {
      assert.deepEqual(labeled,accepted||[answer]);
      assert.equal(await summary.locator('.qlp-answer-text').count(),(accepted||[answer]).length);
      assert.match(await f.locator('.grade-word').innerText(),expectedCorrect ? /正解！/ : /不正解/);
    }
    const calls=await page.evaluate(()=>window.calls);
    assert.equal(calls.filter(([n])=>n==='submitAnswer').length, mode==='answer'?1:0);
    assert.equal(calls.filter(([n])=>n==='nextQuestion').length,0);
    assert.deepEqual(errors,[]);
    const size=await f.locator('html').evaluate(x=>[x.clientWidth,x.scrollWidth]);
    assert.ok(size[0]<=375 && size[1]===size[0],JSON.stringify(size));
    if(number===4 && value===2) await page.screenshot({path:dir+'candidate-q4-after.png',fullPage:true});
    if(number===9 && value===1) await page.screenshot({path:dir+'candidate-q9-wrong.png',fullPage:true});
    if(number===4 && value===2){
      await f.locator('#next').tap();
      await f.locator('#nextStatus').waitFor({state:'detached'});
      assert.equal((await page.evaluate(()=>window.calls)).filter(([name])=>name==='nextQuestion').length,1);
    }
    console.log('PASS',questionId,value,mode,labeled);
    await page.close();
  }
} finally { await browser.close(); }
