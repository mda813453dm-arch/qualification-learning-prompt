import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OFFICIAL_PDF_PINS} from '../src/official-pdf-pins.js';
import {validatePythonPdfHandoff} from '../src/python-pdf-handoff.js';
const pin=OFFICIAL_PDF_PINS['土地家屋調査士:2025:午後'];
const make=()=>({
 schema:'surveyor_2025_afternoon_v1',
 registryKey:'土地家屋調査士:2025:午後',
 questionPdfSha256:pin.questionSha256,
 answerPdfSha256:pin.answerSha256,
 questions:Array.from({length:20},(_,i)=>{
  const rawSpan='第'+(i+1)+'問\n1 アウ 2 アオ 3 イウ 4 イエ 5 エオ\n';
  return {number:i+1,page:i+1,rawSpan,spanSha256:createHash('sha256').update(rawSpan).digest('hex'),choices:['アウ','アオ','イウ','イエ','エオ'],answerNumber:1};
 })
});
test('20問の正規JSON受渡しを検証',()=>assert.equal(validatePythonPdfHandoff(make()).ok,true));
test('PDFハッシュすり替え拒否',()=>{const d=make();d.questionPdfSha256='0'.repeat(64);assert.equal(validatePythonPdfHandoff(d).reason,'PDF_PIN_MISMATCH')});
test('問番号の並び替え拒否',()=>{const d=make();d.questions.reverse();assert.equal(validatePythonPdfHandoff(d).reason,'QUESTION_ORDER_INVALID')});
test('原文の改ざん拒否',()=>{const d=make();d.questions[0].rawSpan+='改変';assert.equal(validatePythonPdfHandoff(d).reason,'SPAN_HASH_INVALID')});
test('正答番号の範囲外を拒否',()=>{const d=make();d.questions[0].answerNumber=6;assert.equal(validatePythonPdfHandoff(d).reason,'ANSWER_INVALID')});
