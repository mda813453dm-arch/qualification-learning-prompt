// 実ブラウザで「処理中」「最新キャッシュ→読取復元」「先頭Focus」を検証する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-v166.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const sessionId = 'fast-resume-test-session';
const makeQuestion = (num, at) => ({
  status: 'question', sessionId, at,
  question: {
    questionId: 'q001:2026:実践:' + num, year:2026, questionNumber:num,
    fieldName:'宅建業法', stem:'検証用問題 ' + num,
    choices:['選択肢1','選択肢2','選択肢3','選択肢4']
  }
});
const oldQuestion = makeQuestion(1, 1000);
const lastQuestion = makeQuestion(2, 2000);

for (const [name, engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser = await engine.launch({ headless:true });
  try {
    const page = await browser.newPage({ viewport:{width:375,height:667}, isMobile:true, hasTouch:true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://qlp.test/**', route => route.fulfill({
      contentType:'text/html', body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>'
    }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({html,oldQuestion,lastQuestion,sessionId}) => {
      window.outgoing = [];
      window.snapshot = oldQuestion;
      window.holdSnapshot = false;
      window.holdAnswer = false;
      window.pendingSnapshots = [];
      window.pendingAnswers = [];
      window.mount = (id, initial) => {
        const frame = document.createElement('iframe');
        frame.id = id;
        frame.style.cssText = 'width:100%;height:660px;border:0';
        window.activeFrame = frame;
        const boot = {
          toolInput:{sessionId}, toolOutput:initial, displayMode:'inline',
        };
        const injection = '<script>window.openai=' + JSON.stringify(boot) +
          ';window.openai.notifyIntrinsicHeight=function(h){if(window.frameElement)window.frameElement.style.height=Math.ceil(h)+"px"};<\/script><script>';
        window.addEventListener('message', e => {
          if (e.source !== frame.contentWindow || !e.data || e.data.jsonrpc !== '2.0') return;
          const m=e.data;
          window.outgoing.push({from:id,method:m.method,name:m.params?.name,args:m.params?.arguments});
          const reply = result => frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
          if (m.method === 'ui/initialize') reply({protocolVersion:'2026-01-26',hostCapabilities:{}});
          else if (m.method === 'tools/call') {
            if (m.params.name === 'getStudySnapshot') {
              if (window.holdSnapshot) window.pendingSnapshots.push(reply);
              else reply({structuredContent:window.snapshot});
            } else if (m.params.name === 'submitAnswer') {
              const body={grade:{dontKnow:true,questionId:oldQuestion.question.questionId,correctAnswer:2,acceptedAnswers:[2]}};
              if (window.holdAnswer) window.pendingAnswers.push(() => reply({structuredContent:body}));
              else reply({structuredContent:body});
            } else if (m.params.name === 'reportUiEvent') reply({structuredContent:{status:'recorded'}});
            else reply({structuredContent:{status:'recorded'}});
          }
        });
        frame.srcdoc = html.replace('<script>', injection);
        document.body.appendChild(frame);
        return frame;
      };
      window.mount('first',oldQuestion);
    }, {html:widgetHtml(),oldQuestion,lastQuestion,sessionId});

    const first=page.frameLocator('#first');
    await first.getByText('検証用問題 1').waitFor();
    await page.waitForFunction(() => !!sessionStorage.getItem('qlp_recent_study_v1:fast-resume-test-session'));
    // 通信が遅くても押下直後から動作中表示と二重送信防止が働く。
    await page.evaluate(() => {window.holdAnswer=true;});
    await first.getByRole('button',{name:'分からない',exact:true}).click();
    await first.locator('#qlpBusy').waitFor({state:'visible'});
    assert.match(await first.locator('#qlpBusyMessage').innerText(),/解答を確認|画面を切り替え/);
    assert.equal(await page.evaluate(() => window.outgoing.filter(x => x.name==='submitAnswer').length),1);
    await page.waitForTimeout(3200);
    assert.match(await first.locator('#qlpBusyMessage').innerText(),/継続/);
    await page.evaluate(() => {window.holdAnswer=false;window.pendingAnswers.splice(0).forEach(fn=>fn());});
    await first.locator('#dkExp').waitFor();
    await first.locator('#qlpBusy').waitFor({state:'hidden'});
    const gradedCache=await page.evaluate(() => JSON.parse(sessionStorage.getItem('qlp_recent_study_v1:fast-resume-test-session')||'null'));
    assert.equal(gradedCache?.view?.status,'restoredGrade','採点後は未回答ではなく採点済み画面を保存');
    assert.equal(gradedCache?.view?.question?.questionNumber,1);
    assert.equal(await first.locator('#app > .latest').count(),1);
    assert.equal(await first.locator('.latest').evaluate(el=>document.activeElement===el),true);
    // 新しい学習画面を保存したあと、古いツール出力の状態でiframeを作り直す。
    await page.evaluate(lastQuestion=>{
      window.snapshot=lastQuestion;
      const frame=document.getElementById('first');
      frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{_meta:{qlp:lastQuestion}}},'*');
    },lastQuestion);
    await first.getByText('検証用問題 2').waitFor();
    await page.waitForFunction(() => {
      const c=JSON.parse(sessionStorage.getItem('qlp_recent_study_v1:fast-resume-test-session')||'null');
      return c?.view?.question?.questionNumber===2;
    });
    await page.evaluate(oldQuestion=>{
      document.getElementById('first').remove();
      // 破棄済みフレームのリースが期限切れになった状態を再現。
      localStorage.removeItem('qlp_fixed_frame_v103:fast-resume-test-session');
      window.holdSnapshot=true;
      window.mount('second',oldQuestion);
    },oldQuestion);
    const second=page.frameLocator('#second');
    await second.locator('#recentPreviewNotice').waitFor();
    assert.match(await second.locator('#app').innerText(),/検証用問題 2/,'古いツール出力より保存済みの最新画面を優先');
    assert.doesNotMatch(await second.locator('#app').innerText(),/検証用問題 1/,'旧問題を描画しない');
    assert.equal(await second.locator('button:not([disabled])').count(),0,'サーバー照合前の旧画面からは回答できない');
    assert.equal(await second.locator('.latest').evaluate(el=>document.activeElement===el),true,'仮表示も先頭にFocus');
    assert.equal(await page.evaluate(() => window.outgoing.filter(x => x.from==='second' && x.name==='submitAnswer').length),0);
    await page.evaluate(() => {
      window.holdSnapshot=false;
      window.pendingSnapshots.splice(0).forEach(fn=>fn({structuredContent:window.snapshot}));
    });
    await second.locator('#recentPreviewNotice').waitFor({state:'detached'});
    await second.getByRole('button',{name:'分からない',exact:true}).waitFor();
    assert.equal(await second.getByRole('button',{name:'分からない',exact:true}).isDisabled(),false,'照合後に操作を再開');
    assert.equal(await second.locator('.latest').evaluate(el=>document.activeElement===el),true,'復元後も先頭にFocus');
    assert.equal(await page.evaluate(() => window.outgoing.filter(x => x.from==='second' && x.name==='nextQuestion').length),0,'復元では次問を進めない');
    assert.equal(await page.evaluate(() => window.outgoing.filter(x => x.from==='second' && x.name==='submitAnswer').length),0,'復元では再採点しない');
    assert.deepEqual(errors,[]);
    console.log(name+': PASS pending, latest cache preview, read-only restore, top focus (375px)');
  } finally {
    await browser.close();
  }
}
