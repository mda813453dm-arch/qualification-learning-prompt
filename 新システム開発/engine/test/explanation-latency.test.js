import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-current.js';
import { widgetHtml as priorWidget, WIDGET_URI as priorUri } from '../src/widget-v202.js';

function waitSource(html) {
  const a = html.indexOf('  async function waitForPublishedExplanation(');
  const b = html.indexOf('\n  async function loadExplanation(', a);
  assert.ok(a >= 0 && b > a);
  return html.slice(a, b);
}

test('v203 keeps immutable v202, E-reference verification and old study controls', () => {
  const html = widgetHtml(), prior = priorWidget();
  assert.equal(WIDGET_URI,'ui://qlp/question-v203.html');
  assert.equal(WIDGET_VERSION,'2026-11-20.203');
  assert.equal(priorUri,'ui://qlp/question-v202.html');
  assert.match(html,/qlp-ai-latency-v203/);
  assert.doesNotMatch(prior,/qlp-ai-latency-v203/);
  assert.match(html,/ctx\.question\.questionId !== ctx\.grade\.questionId/);
  assert.match(html,/EXPLANATION_REFERENCE_MISSING/);
  assert.match(html,/await callTool\('explainSpec', args\)/);
  assert.match(html,/loadExplanation\(q\.questionId, true\)/);
  assert.match(html,/qlp-feedback-v202/);
  assert.match(html,/qlp-route-v201/);
});

test('publish observation starts in parallel with model send, no regrade or automatic next question', () => {
  const html = widgetHtml();
  const start=html.indexOf('  async function loadExplanation(questionId, requestAi){');
  const stop=html.indexOf('\n  function answerReferenceName(', start);
  assert.ok(start>=0 && stop>start);
  const code=html.slice(start,stop);
  const sent=code.indexOf('var sending = requestAdaptiveExplanation(ctx)');
  const observed=code.indexOf('var publication = waitForPublishedExplanation(');
  const awaited=code.indexOf('await sending');
  assert.ok(sent>=0 && observed>sent && awaited>observed, 'start observation before waiting for host ACK');
  assert.match(code,/publication\.catch\(function\(\)\{\}\)/);
  assert.match(code,/stopPolling = true/);
  assert.match(code,/await publication/);
  assert.doesNotMatch(code,/submitAnswer|startSession|callTool\('nextQuestion'/);
});

test('short first polling catches saved same-question explanation before 3 seconds', async () => {
  const html=widgetHtml(), code=waitSource(html);
  const delays=[], rendered=[];
  let tick=0,calls=0;
  const ctx={
    state:{sessionId:'s1',question:{questionId:'q1'}},
    locked:false,
    window:{__qlpTestExplanationWaitMs:5000},
    Date:{now:()=>tick},
    setTimeout:(done,ms)=>{delays.push(ms);tick+=ms;done();},
    callTool:async(name,args)=>{
      assert.equal(name,'getStudySnapshot');
      assert.equal(args.sessionId,'s1');
      calls++;
      return calls===3?{status:'menu',sessionId:'s1',explanationQuestionId:'q1',menu:{kind:'next',body:'verified text'}}:{status:'restoredGrade'};
    },
    render:(data)=>rendered.push(data),
  };
  const run=runInNewContext(code+';\nwaitForPublishedExplanation("s1","q1",()=>false);',ctx);
  await run;
  assert.equal(calls,3);
  assert.equal(rendered.length,1);
  assert.deepEqual(delays,[500,500]);
  assert.ok(tick<3000);
});

test('a wrong-question publication is never rendered; cancellation leaves the current question untouched', async () => {
  const code=waitSource(widgetHtml());
  let tick=0,renderCount=0,polls=0;
  const ctx={
    state:{sessionId:'s1',question:{questionId:'q1'}},locked:false,
    window:{__qlpTestExplanationWaitMs:1250},
    Date:{now:()=>tick},
    setTimeout:(done,ms)=>{tick+=ms;done();},
    callTool:async()=>{polls++;return {status:'menu',sessionId:'s1',explanationQuestionId:'q-other',menu:{kind:'next',body:'other answer'}};},
    render:()=>renderCount++,
  };
  await assert.rejects(runInNewContext(code+';\nwaitForPublishedExplanation("s1","q1",()=>false);',ctx),/EXPLANATION_PUBLISH_TIMEOUT/);
  assert.equal(renderCount,0);
  assert.ok(polls>=2);
  const canceled=await runInNewContext(code+';\nwaitForPublishedExplanation("s1","q1",()=>true);',ctx);
  assert.equal(canceled,undefined);
});

test('explanation prompt focuses on correct and selected wrong answer without shortening essential calculations', () => {
  const html=widgetHtml();
  assert.match(html,/正解理由と私が選んだ回答の誤り・混同点/);
  assert.match(html,/必要な法令条件や計算過程は省略しないでください/);
  const mcp=readFileSync(new URL('../src/mcp.js', import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/app.js', import.meta.url),'utf8');
  assert.match(mcp,/通常200〜500文字程度/);
  assert.match(app,/通常200〜500文字程度/);
  for(const token of ['stable202Html','question-v202.html','2026-11-20.202']) assert.ok(mcp.includes(token));
});
