import test from 'node:test';
import assert from 'node:assert/strict';
import { learningPolicy, learningPhase, orderDueByContrast } from '../src/learning-policy.js';
import { newState, pin, present, grade } from '../src/engine.js';

const packet = (stem, id='q-1') => ({
  questionId:id, stem, stemMode:'text', choices:['選択肢A','選択肢B'], correctAnswer:2,
  fieldId:'law', topicId:'t:35', reviewUnitId:id, year:2025, section:'一般', questionNumber:1,
  figures:[], questionPdfSha256:'a', answerPdfSha256:'b',
});
const item = p => ({packet:p,keyParts:{parserVersion:'0.8.2'}});
test('条文・計算・未知の分類を保守的に行い、本文や正答を変更しない',()=>{
  const a=packet('この用語は何というか');
  const b=packet('次の座標値を求めよ');
  const c=packet('次の記述について');
  const before=JSON.stringify(b);
  assert.equal(learningPolicy(a).method,'recall');
  assert.equal(learningPolicy(b).method,'guided');
  assert.equal(learningPolicy(c).method,'unclassified');
  assert.equal(JSON.stringify(b),before);
  assert.equal(learningPhase(learningPolicy(b),null,'new'),'worked_example_first');
  assert.equal(learningPhase(learningPolicy(b),{result:'confident_correct'},'new'),'closed_book_recall');
  assert.equal(learningPhase(learningPolicy(b),null,'review'),'closed_book_recall');
});
test('紛らわしい論点の関連付けは検証済み相互リンクの時だけ',()=>{
  const a={...packet('問題','a'),topicId:'t:35',learningTags:{verified:true,method:'contrast',contrastTopicIds:['t:37']}};
  const b={...packet('問題','b'),topicId:'t:37',learningTags:{verified:true,method:'contrast',contrastTopicIds:['t:35']}};
  const c={...packet('問題','c'),topicId:'other'};
  const byUnit=new Map([[a.questionId,[item(a)]],[b.questionId,[item(b)]],[c.questionId,[item(c)]]]);
  const due=[{unitId:'c'},{unitId:'a'},{unitId:'b'}];
  assert.deepEqual(orderDueByContrast(due,byUnit,'t:35').map(x=>x.unitId),['b','c','a']);
  assert.deepEqual(orderDueByContrast(due,byUnit,'unknown'),due);
  b.learningTags.contrastTopicIds=['other'];
  assert.deepEqual(orderDueByContrast(due,byUnit,'t:35'),due);
});
test('未検証または不正な対比は有効化しない',()=>{
  const p={...packet('何か'), topicId:'t:35',learningTags:{verified:false,method:'contrast',contrastTopicIds:['t:37']}};
  assert.equal(learningPolicy(p).method,'unclassified');
  p.learningTags.verified=true; p.learningTags.contrastTopicIds=['t:35'];
  assert.equal(learningPolicy(p).method,'unclassified');
  p.learningTags.contrastTopicIds=['<malformed>'];
  assert.equal(learningPolicy(p).method,'unclassified');
});
test('公式正答を固定した採点・再採点を保持',()=>{
  const p=packet('次の座標値を求めよ');
  const now=Date.UTC(2026,9,30);
  let state=pin(newState({qualificationId:'test',now}),item(p),'new',now);
  assert.equal(state.current.learning.phase,'worked_example_first');
  const shown=present(item(p),'new');
  assert.equal(Object.hasOwn(shown,'correctAnswer'),false);
  const opts={today:'2026-10-30',now,intervals:[1,3,7]};
  const first=grade(state,{questionId:p.questionId,value:'1'},opts);
  assert.equal(first.ok,true);
  assert.equal(first.grade.correct,false);
  assert.equal(first.grade.correctAnswer,2);
  const again=grade(first.state,{questionId:p.questionId,value:'1'},opts);
  assert.equal(again.ok,true);
  assert.equal(again.grade.alreadyGraded,true);
  assert.equal(first.state.current.question.stem,p.stem);
});
