import test from 'node:test';
import assert from 'node:assert/strict';
import { learningPolicy, learningPhase, orderDueByContrast } from '../src/learning-policy.js';
import { newState, pin, present, grade, pickNext } from '../src/engine.js';
import { widgetHtml } from '../src/widget.js';

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
  assert.equal(state.current.question.learning.phase,'worked_example_first','復元用に同じ学習段階を保持');
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

test('同じ学習枠内に理解用手順を表示し、正答は出題時に表示しない',()=>{
  const html=widgetHtml();
  assert.match(html, /q\.learning\.phase === 'worked_example_first'/);
  assert.match(html, /解く前の手順確認/);
  assert.match(html, /正答は回答後に表示します/);
  assert.match(html, /stemHtml\(q\.stem\)/);
});

test('通常の期限付き復習も、期限到来済みの検証済み対比論点から1問だけ選ぶ',()=>{
  const a={...packet('35条について','a'),topicId:'t:35',learningTags:{verified:true,method:'contrast',contrastTopicIds:['t:37']}};
  const b={...packet('37条について','b'),topicId:'t:37',learningTags:{verified:true,method:'contrast',contrastTopicIds:['t:35']}};
  const c={...packet('他の論点','c'),topicId:'other'};
  const items=[item(a),item(b),item(c)];
  const now=Date.UTC(2026,9,30);
  const state=newState({qualificationId:'test',now});
  state.history={a:{result:'confident_correct'},b:{result:'wrong'},c:{result:'wrong'}};
  state.reviewPacing={initialServed:5,newAnswered:2,sinceReview:2,lastDate:'2026-10-30'};
  state.lastReviewTopicId='t:35';
  state.review={
    c:{unitId:'c',topicId:'other',dueDate:'2026-10-28',sourceQuestionId:'c'},
    b:{unitId:'b',topicId:'t:37',dueDate:'2026-10-29',sourceQuestionId:'b'},
  };
  const chosen=pickNext(state,items,{today:'2026-10-30',now});
  assert.equal(chosen.status,'question');
  assert.equal(chosen.item.packet.questionId,'b');
  assert.equal(chosen.kind,'review');
  state.review.b.dueDate='2026-10-31';
  const other=pickNext(state,items,{today:'2026-10-30',now});
  assert.equal(other.item.packet.questionId,'c','未到来の関連論点は出題しない');
  state.reviewPacing.sinceReview=1;
  assert.equal(pickNext(state,items,{today:'2026-10-30',now}).status,'finished','復習頻度は従来どおり維持');
});

test('誤答確定後だけ自動で理由を依頼し、失敗時は手動再試行できる',()=>{
  const html=widgetHtml();
  assert.match(html,/r\.grade\.result === 'wrong' && r\.grade\.questionId === qid\) autoWrongExplanation\(qid\)/);
  assert.match(html,/var autoWrongRequests = Object\.create\(null\)/);
  assert.match(html,/loadExplanation\(questionId, true\)\.catch/);
  assert.match(html,/AI解説の追加を再試行/);
  assert.match(html,/公式正答は保持しています/);
});

test('制度名が明確な宅建35条／37条のみ混同ペアに自動分類する',()=>{
  const a={...packet('宅建業法第35条に関する説明として適切なものは','q041:2025:年度共通:1'),topicId:null};
  const b={...packet('宅地建物取引業法第37条に関する説明として適切なものは','q041:2024:年度共通:1'),topicId:null};
  const ambiguous={...packet('宅建業法第35条と宅建業法第37条の違い','q041:2023:年度共通:1'),topicId:null};
  const otherQualification={...packet('宅建業法第35条に関する説明','q042:2025:main:1'),topicId:null};
  assert.deepEqual(learningPolicy(a).contrastTopicIds,['q041:article37']);
  assert.equal(learningPolicy(a).verifiedTopicId,'q041:article35');
  assert.equal(learningPolicy(b).verifiedTopicId,'q041:article37');
  assert.notEqual(learningPolicy(ambiguous).method,'contrast');
  assert.notEqual(learningPolicy(otherQualification).method,'contrast');
  const now=Date.UTC(2026,9,30);
  assert.equal(pin(newState({qualificationId:'q041',now}),item(a),'new',now).current.topicId,'q041:article35');
  const candidates=new Map([['a',[item(a)]],['b',[item(b)]]]);
  assert.equal(orderDueByContrast([{unitId:'a'},{unitId:'b'}],candidates,'q041:article35')[0].unitId,'b');
});
test('表示登記／権利登記の区別は一意に書かれた設問だけで行う',()=>{
  const a=packet('表示に関する登記について','land_surveyor:2025:午後の部:2');
  const b=packet('権利に関する登記について','land_surveyor:2024:午後の部:2');
  const ambiguous=packet('表示に関する登記と権利に関する登記を比較する','land_surveyor:2023:午後の部:2');
  assert.equal(learningPolicy(a).verifiedTopicId,'land_surveyor:display_registration');
  assert.deepEqual(learningPolicy(b).contrastTopicIds,['land_surveyor:display_registration']);
  assert.notEqual(learningPolicy(ambiguous).method,'contrast');
});
