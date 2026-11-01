// 2026-11-01: 50%分野切替・未出題優先・全問終了後ランダムの恒久回帰。
// 103資格の分野構成と、旧セッションの互換・再開・形式制約を検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { fieldPracticeTarget, grade, newState, pickNext, pin, findWanted } from '../src/engine.js';

const TODAY='2026-11-01', NOW=Date.parse('2026-11-01T04:00:00Z');
function item(id, fieldId, year=2025, extra={}) {
  return { keyParts:{}, packet: {
    questionId:id, fieldId, year, section:'main', questionNumber:Number(id.replace(/\\D/g,'').slice(-2))||1,
    stem:'以下の記述について正しいものを選べ。',choices:['正しい','誤り'],correctAnswer:1,
    questionType:'multiple_choice',questionPdfUrl:'https://example.invalid/q.pdf',answerPdfUrl:'https://example.invalid/a.pdf',
    ...extra,
  }};
}
const pool=(fid,n)=>Array.from({length:n},(_,i)=>item(fid+'-'+String(i+1).padStart(2,'0'),fid,2025-i%5));
function step(state,items) {
  const picked=pickNext(state,items,{today:TODAY,now:NOW,job:null});
  assert.equal(picked.status,'question');
  let next=pin(state,picked.item,picked.kind,NOW,{setTarget:picked.setTarget});
  next=grade(next,{questionId:picked.item.packet.questionId,value:'1'},{today:TODAY,now:NOW}).state;
  return {state:next,picked};
}
test('登録済み0・1・2・3・5・50問の50%は端数切上げ、重複IDは数えない',()=>{
  const expected=[[0,0],[1,1],[2,1],[3,2],[5,3],[50,25]];
  for(const [n,want] of expected)assert.equal(fieldPracticeTarget(pool('a',n),'a'),want);
  assert.equal(fieldPracticeTarget([...pool('a',5),pool('a',5)[0]],'a'),3);
  assert.equal(fieldPracticeTarget(pool('a',5),'missing'),0);
});
test('広い分野12問は6問を連続して出し、別分野2問は1問で切り替え、全問回答済みまで重複しない',()=>{
  const items=[...pool('wide',12),...pool('small',2)];
  let state=newState({qualificationId:'synthetic',now:NOW,plan:{fieldWeights:{wide:200,small:100}}});
  const seen=[], fields=[];
  for(let i=0;i<items.length;i++){
    const r=step(state,items);state=r.state;seen.push(r.picked.item.packet.questionId);fields.push(r.picked.item.packet.fieldId);
    assert.equal(r.picked.kind,'new','未出題の公式問題を全問先に使う');
  }
  assert.deepEqual(fields.slice(0,7),['wide','wide','wide','wide','wide','wide','small']);
  assert.equal(new Set(seen).size,items.length,'最初の一巡で問題を重複させない');
  assert.equal(state.set?.target,1,'最後の小分野のセット目標は1');
  const recycled=pickNext(state,items,{today:TODAY,now:NOW,job:null});
  assert.equal(recycled.status,'question');
  assert.equal(recycled.kind,'review');
  assert.equal(recycled.recycled,true);
  assert.notEqual(recycled.item.packet.questionId,state.lastGrade.questionId,'直前の問題を避ける');
});
test('各分野3問以下も1問または2問で切り替え、どの分野にも未回答が残る間は同一問を繰り返さない',()=>{
  const items=[...pool('a',3),...pool('b',1),...pool('c',2)];
  let state=newState({qualificationId:'synthetic',now:NOW,plan:{orderedFields:['a','b','c']}});
  const seq=[], ids=new Set();
  for(let i=0;i<items.length;i++){
    const {state:next,picked}=step(state,items);
    state=next;seq.push(picked.item.packet.fieldId);
    assert.equal(ids.has(picked.item.packet.questionId),false);ids.add(picked.item.packet.questionId);
  }
  assert.deepEqual(seq.slice(0,4),['a','a','b','c']);
  assert.equal(ids.size,6);
});
test('途中の記録をJSON保存して復元してもセット残数は保持し、同分野の新規問題へ進む',()=>{
  const items=[...pool('wide',10),...pool('small',2)];
  let state=newState({qualificationId:'synthetic',now:NOW,plan:{fieldWeights:{wide:2,small:1}}});
  for(let i=0;i<3;i++)state=step(state,items).state;
  assert.equal(state.set.target,5);
  assert.equal(state.set.count,3);
  const restored=JSON.parse(JSON.stringify(state));
  const fourth=pickNext(restored,items,{today:TODAY,now:NOW,job:null});
  assert.equal(fourth.item.packet.fieldId,'wide');
  assert.equal(fourth.setTarget,5);
  assert.equal(fourth.repeated,undefined);
});
test('明示指定した分野の未出題を優先し、全問回答した分野のみランダムで再出題する',()=>{
  const items=[...pool('a',3),...pool('b',3)];
  let state=newState({qualificationId:'synthetic',now:NOW});
  const fieldNames={a:'A分野',b:'B分野'};
  for(let i=0;i<3;i++){
    const w=findWanted(state,items,'A分野',fieldNames);
    assert.equal(w.item.packet.fieldId,'a');
    assert.equal(w.kind,'new');
    state=grade(pin(state,w.item,w.kind,NOW,{setTarget:2}),{questionId:w.item.packet.questionId,value:'1'},{today:TODAY,now:NOW}).state;
  }
  const w=findWanted(state,items,'A分野',fieldNames);
  assert.equal(w.kind,'review');
  assert.notEqual(w.item.packet.questionId,state.lastGrade.questionId);
  assert.equal(!!state.history[w.item.packet.questionId],true);
  assert.equal(findWanted(state,items,'B分野',fieldNames).kind,'new');
});
test('出題形式を限定した場合は他形式を混ぜず、未検証問を50%分母へ数えない',()=>{
  const items=[...pool('a',5),item('a-unknown','a',2025,{questionType:'unknown'})];
  const state=newState({qualificationId:'synthetic',now:NOW,
    plan:{questionPreference:'multiple_choice',fieldWeights:{a:1}}});
  assert.equal(fieldPracticeTarget(items,'a',(x)=>x.packet.questionType==='multiple_choice'),3);
  const pick=pickNext(state,items,{today:TODAY,now:NOW,job:null});
  assert.equal(pick.setTarget,3);
  assert.notEqual(pick.item.packet.questionId,'a-unknown');
  const wrongPref=newState({qualificationId:'synthetic',now:NOW,plan:{questionPreference:'descriptive'}});
  assert.equal(pickNext(wrongPref,items,{today:TODAY,now:NOW,job:null}).status,'formatUnavailable');
});
test('登録中の未完了年度を出題数に混ぜず、既存の未回答の問を優先し、検証待ちでランダムに切り替えない',()=>{
  const items=pool('a',2);
  let state=newState({qualificationId:'synthetic',now:NOW});
  for(let i=0;i<2;i++)state=step(state,items).state;
  assert.equal(pickNext(state,items,{today:TODAY,now:NOW,job:{state:'running',sources:[]}}).status,'waiting');
});
test('資格台帳の各資格で、分野登録数の違いを持つシミュレーションを行う',()=>{
  let count=0, multi=0;
  for(const cat of Object.values(CATALOG)) {
    if(!cat?.qualificationId)continue;
    count++;
    const ids=Object.keys(cat.fields??{});
    if(ids.length<2)continue;
    multi++;
    const [first,second]=ids;
    const items=[...pool(first,10),...pool(second,3)];
    let state=newState({qualificationId:cat.qualificationId,now:NOW,plan:{fieldWeights:{[first]:100,[second]:50}}});
    for(let i=0;i<5;i++){
      const r=step(state,items);state=r.state;
      assert.equal(r.picked.item.packet.fieldId,first,cat.qualificationId+': 50%まで第一分野');
      assert.equal(r.picked.setTarget,5);
    }
    assert.equal(pickNext(state,items,{today:TODAY,now:NOW}).item.packet.fieldId,second,
      cat.qualificationId+': 第二分野へ');
  }
  assert.ok(count>=100,'登録されている全資格を走査');
  assert.ok(multi>=20,'複数分野資格を広く検証');
});
