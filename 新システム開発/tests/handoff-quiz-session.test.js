import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OFFICIAL_PDF_PINS} from '../src/official-pdf-pins.js';
import {createHandoffQuizSession} from '../src/handoff-quiz-session.js';
const key='土地家屋調査士:2025:午後',pin=OFFICIAL_PDF_PINS[key];
const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
 return {schema:'surveyor_2025_afternoon_v1',registryKey:key,questionPdfSha256:pin.questionSha256,answerPdfSha256:pin.answerSha256,questions:Array.from({length:20},(_,i)=>{
  const rawSpan='第'+(i+1)+'問 模擬本文\n1 アウ 2 アオ 3 イウ 4 イエ 5 エオ';
  return {number:i+1,page:i+1,rawSpan,spanSha256:sha(rawSpan),choices:['アウ','アオ','イウ','イエ','エオ'],answerNumber:2};
 })};
}
test('未審査の実PDF抽出JSONは出題拒否',()=>{
 const quiz=createHandoffQuizSession();
 assert.equal(quiz.select(fixture(),1).reason,'INDEPENDENT_CONTENT_REVIEW_REQUIRED');
 assert.throws(()=>quiz.submit(2),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('模擬審査記録が完全一致する場合のみ出題・一回採点',()=>{
 const data=fixture();
 const quiz=createHandoffQuizSession({reviewedQuestions:{[key+':1']:{spanSha256:data.questions[0].spanSha256,answerNumber:2,visualCompletenessVerified:true}}});
 assert.equal(quiz.select(data,1).status,'question');
 assert.equal(quiz.submit(2).correct,true);
 assert.throws(()=>quiz.submit(2),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('改ざんされた原文ハッシュのJSONは審査記録があっても拒否',()=>{
 const data=fixture();
 const quiz=createHandoffQuizSession({reviewedQuestions:{[key+':1']:{spanSha256:data.questions[0].spanSha256,answerNumber:2,visualCompletenessVerified:true}}});
 data.questions[0].rawSpan+='改変';
 assert.equal(quiz.select(data,1).reason,'SPAN_HASH_INVALID');
});
test('正答の不一致は出題拒否',()=>{
 const data=fixture();
 const quiz=createHandoffQuizSession({reviewedQuestions:{[key+':1']:{spanSha256:data.questions[0].spanSha256,answerNumber:1,visualCompletenessVerified:true}}});
 assert.equal(quiz.select(data,1).reason,'INDEPENDENT_CONTENT_REVIEW_REQUIRED');
});
test('採点の無効な番号は拒否し、有効回答を維持',()=>{
 const data=fixture();
 const quiz=createHandoffQuizSession({reviewedQuestions:{[key+':1']:{spanSha256:data.questions[0].spanSha256,answerNumber:2,visualCompletenessVerified:true}}});
 quiz.select(data,1);
 assert.throws(()=>quiz.submit(6),/INVALID_CHOICE/);
 assert.equal(quiz.submit(1).correct,false);
});
