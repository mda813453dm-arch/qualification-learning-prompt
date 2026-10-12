import test from 'node:test';
import assert from 'node:assert/strict';
import {SURVEY_ASSISTANT_VISUAL_CASES as cases,evaluateVisualCase} from '../src/survey-assistant-visual-cases.js';
test('2026年測量士補の図表付き2問のページと正答を固定',()=>{
 assert.deepEqual(cases.map(c=>[c.questionNumber,c.pdfPage,c.answerNumber]),[[7,9,4],[27,29,1]]);
 assert.ok(cases.every(c=>c.figure&&c.table&&c.pageImageReviewed&&!c.publishable));
});
test('PDF実バイト未取得では出題保留',()=>assert.equal(evaluateVisualCase(cases[0]).reason,'PDF_BYTES_NOT_VERIFIED'));
test('図表・選択肢の表示が未確認なら出題保留',()=>assert.equal(evaluateVisualCase(cases[0],{questionPdfSha256:'a'.repeat(64)}).reason,'VISUAL_CONTENT_NOT_VERIFIED'));
test('図表表示だけでは正答との対応を承認しない',()=>assert.equal(evaluateVisualCase(cases[1],{questionPdfSha256:'a'.repeat(64),figureRendered:true,tableRendered:true,choicesRendered:true}).reason,'ANSWER_BINDING_NOT_VERIFIED'));
test('すべての模擬条件が揃っても公式ハッシュと実機審査前は承認しない',()=>assert.equal(evaluateVisualCase(cases[1],{questionPdfSha256:'a'.repeat(64),figureRendered:true,tableRendered:true,choicesRendered:true,answerBound:true}).status,'pending'));
