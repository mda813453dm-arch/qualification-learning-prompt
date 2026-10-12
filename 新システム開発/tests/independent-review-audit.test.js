import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OFFICIAL_PDF_PINS} from '../src/official-pdf-pins.js';
import {auditExtractedQuestions} from '../src/independent-review-audit.js';
const key='土地家屋調査士:2025:午後',pin=OFFICIAL_PDF_PINS[key];
const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
 return {schema:'surveyor_2025_afternoon_v1',registryKey:key,questionPdfSha256:pin.questionSha256,answerPdfSha256:pin.answerSha256,questions:Array.from({length:20},(_,i)=>{
  const rawSpan='第'+(i+1)+'問\nア 甲\nイ 乙\nウ 丙\nエ 丁\nオ 戊\n1 アウ 2 アオ 3 イウ 4 イエ 5 エオ\n'+(i===4?'図1参照':'');
  return {number:i+1,page:i+1,rawSpan,spanSha256:sha(rawSpan),choices:['アウ','アオ','イウ','イエ','エオ'],answerNumber:2};
 })};
}
test('全20問の静的構造を監査するが自動承認はしない',()=>{
 const result=auditExtractedQuestions(fixture());
 assert.equal(result.ok,true);assert.equal(result.total,20);assert.equal(result.publishable,0);
 assert.equal(result.reviews.every(x=>x.independentContentReview==='PENDING'&&x.answerCellReview==='PENDING'),true);
});
test('図の参照を検出して保留する',()=>assert.equal(auditExtractedQuestions(fixture()).reviews[4].staticChecks.noExplicitVisualReference,false));
test('ア〜オが欠けた問題は静的検査不合格',()=>{
 const d=fixture();d.questions[0].rawSpan=d.questions[0].rawSpan.replace('オ 戊\n','');d.questions[0].spanSha256=sha(d.questions[0].rawSpan);
 assert.equal(auditExtractedQuestions(d).reviews[0].staticChecks.fiveStatementLabels,false);
});
test('PDFハッシュ不一致は監査開始前に拒否',()=>{
 const d=fixture();d.answerPdfSha256='0'.repeat(64);
 assert.equal(auditExtractedQuestions(d).reason,'PDF_PIN_MISMATCH');
});
