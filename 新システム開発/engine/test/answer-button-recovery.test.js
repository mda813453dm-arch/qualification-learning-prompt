import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { widgetHtml } from '../src/widget.js';

const html = widgetHtml();
const script = html.split('<script>')[1]?.split('</script>')[0];
const start = script?.indexOf('  async function answer(v){') ?? -1;
const end = script?.indexOf('  // 解説はAIが学習履歴に応じて作る。',start) ?? -1;
assert.ok(start>=0 && end>start,'extract the actual answer function, not a copy');
const answerCode = script.slice(start,end) + '\n;globalThis.doAnswer = answer;';

function widgetHarness(gradeAnswer){
  const statuses=[];
  const controls=Array.from({length:6},()=>({disabled:false}));
  const progress={
    style:{display:'none'},isConnected:true,textContent:'',
    setAttribute(name,val){this[name]=val;},
    scrollIntoView(){statuses.push('scrolled');}
  };
  const submitButton={isConnected:true,disabled:false,textContent:'解答する'};
  controls.push(submitButton);
  const guess={checked:false};
  const app={
    querySelectorAll:()=>controls,
    querySelector:()=>({classList:{add(){}}}),
    insertAdjacentHTML(){},
  };
  const state={question:{questionId:'q090:2020:1'},sessionId:'s0',answered:false,next:null};
  const calls=[],grades=[],renders=[];
  let tool=gradeAnswer;
  const context={
    state, app,
    document:{getElementById(id){return id==='answerProgress'?progress:id==='decide'?submitButton:id==='guess'?guess:null;}},
    callTool:async (name,args)=>{calls.push({name,args});return tool(name,args);},
    showGrade:g=>grades.push(g),
    render:v=>renders.push(v),
    console
  };
  vm.runInNewContext(answerCode,context);
  return {doAnswer:context.doAnswer,progress,submitButton,controls,state,calls,grades,renders,statuses,setTool:fn=>tool=fn};
}

test('iPhone answer tap displays immediate feedback and grades selected official question once',async()=>{
  let release;
  const h=widgetHarness((name)=>new Promise(done=>{release=done;}));
  const promise=h.doAnswer('5');
  assert.equal(h.progress.style.display,'block','status must be visible before network returns');
  assert.match(h.progress.textContent,/公式正答と照合しています/);
  assert.equal(h.submitButton.textContent,'採点中…');
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].name,'submitAnswer');
  assert.equal(h.calls[0].args.value,'5');
  assert.equal(h.calls[0].args.questionId,'q090:2020:1');
  await h.doAnswer('5');
  assert.equal(h.calls.length,1,'double tap must never double-submit');
  release({grade:{questionId:'q090:2020:1',correct:false},next:{status:'question'}});
  await promise;
  assert.equal(h.grades.length,1);
  assert.equal(h.state.answered,true);
});

test('after server accepted answer but response failed, recover persisted grade without duplicate marking',async()=>{
  const h=widgetHarness(async(name)=>{
    if(name==='submitAnswer')throw new Error('MCP transport interrupted');
    if(name==='getStudySnapshot')return {status:'restoredGrade',grade:{questionId:'q090:2020:1',correct:true},question:{questionId:'q090:2020:1'}};
    throw new Error('unexpected request');
  });
  await h.doAnswer('5');
  assert.deepEqual(h.calls.map(c=>c.name),['submitAnswer','getStudySnapshot']);
  assert.equal(h.renders.length,1);
  assert.equal(h.renders[0].status,'restoredGrade');
});

test('when submission and read-only recovery both fail, preserve selected question and retry',async()=>{
  const h=widgetHarness(async()=>{throw new Error('network failure');});
  await h.doAnswer('5');
  assert.equal(h.state.answered,false);
  assert.equal(h.submitButton.disabled,false);
  assert.equal(h.submitButton.textContent,'解答する');
  assert.equal(h.progress.role,'alert');
  assert.match(h.progress.textContent,/採点結果を取得できませんでした/);
  assert.equal(h.renders.length,0);
  assert.ok(h.controls.every(c=>!c.disabled));
});

test('answer button always reads selected DOM radio, declares type and provides adjacent status',()=>{
  assert.match(script,/id="decide"[^>]*>解答する/);
  assert.match(script,/id="answerProgress"[^>]*role="status"/);
  assert.match(script,/querySelector\('input\[name=ans\]:checked'\)/);
  assert.match(script,/document\.getElementById\('decide'\)\.onclick/);
  assert.doesNotMatch(script,/if \(chosen\) answer\(chosen\)/);
});
