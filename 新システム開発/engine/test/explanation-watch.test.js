import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { widgetHtml } from '../src/widget.js';

const script = widgetHtml().split('<script>')[1]?.split('</script>')[0];
const start = script.indexOf('  async function waitForPublishedExplanation(');
const end = script.indexOf('  async function loadExplanation(', start);
assert.ok(start > 0 && end > start);

function watcher(replies) {
  const rendered = [], calls = [];
  let clock = 0;
  const context = {
    state: { sessionId:'session-A', question:{questionId:'question-A'} },
    locked:false, location:{hostname:'qlp.test'}, window:{__qlpTestExplanationWaitMs:6500},
    Date:{now:()=>clock}, Error,
    callTool:async (name,args)=>{ calls.push({name,args}); return replies.shift() || {status:'restoredGrade'}; },
    render:r=>rendered.push(r),
    setTimeout:fn=>{ clock+=3000; queueMicrotask(fn); },
    Promise,
  };
  vm.runInNewContext(script.slice(start,end)+'\n;globalThis.watch = waitForPublishedExplanation;',context);
  return { context, rendered, calls, watch:()=>context.watch('session-A','question-A') };
}

test('delayed AI publication is recovered from the same graded question without another answer or request', async () => {
  const valid = {status:'menu',sessionId:'session-A',explanationQuestionId:'question-A',
    menu:{kind:'next',body:'Verified AI explanation',actions:['next','end']}};
  const w = watcher([{status:'restoredGrade'}, valid]);
  await w.watch();
  assert.equal(w.rendered.length,1);
  assert.equal(w.rendered[0].menu.body,valid.menu.body);
  assert.deepEqual(w.calls.map(x=>x.name),['getStudySnapshot','getStudySnapshot']);
  assert.ok(w.calls.every(x=>x.args.sessionId === 'session-A'));
});

test('another question or session cannot be displayed as the requested explanation', async () => {
  const w = watcher([
    {status:'menu',sessionId:'session-A',explanationQuestionId:'question-B',menu:{kind:'next',body:'wrong question'}},
    {status:'menu',sessionId:'session-B',explanationQuestionId:'question-A',menu:{kind:'next',body:'wrong session'}},
  ]);
  await assert.rejects(w.watch(),/EXPLANATION_PUBLISH_TIMEOUT/);
  assert.deepEqual(w.rendered,[]);
  assert.ok(w.calls.length <= 3,'the recovery loop has a finite deadline');
});
