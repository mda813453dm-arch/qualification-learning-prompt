import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SURVEY_ASSISTANT_VISUAL_CASES as cases} from '../src/survey-assistant-visual-cases.js';
import {prepareVisualQuestionBundle as prepare} from '../src/visual-question-bundle.js';
const pdf=Buffer.from('%PDF-TEST'),sha=createHash('sha256').update(pdf).digest('hex');
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(32,1)]);
function fixture(){return {caseRecord:cases[0],questionPdfBytes:pdf,expectedPdfSha256:sha,verified:{questionNumber:7,pdfPage:9,questionTextVerified:true,questionText:'模擬問題',choices:['A','B','C','D','E'],pagePng:png,figureVerified:true,tableVerified:true,visualPageReviewed:true,answerPdfVerified:true,answerNumber:4,answerQuestionNumber:7}}}
test('模擬プレビューは公開不可',()=>{const r=prepare(fixture());assert.equal(r.status,'preview');assert.equal(r.publishable,false);assert.equal(r.mobileRenderingVerified,false)});
test('PDF未取得は拒否',()=>{const a=fixture();delete a.questionPdfBytes;assert.equal(prepare(a).reason,'QUESTION_PDF_BYTES_REQUIRED')});
test('PDFハッシュ不一致は拒否',()=>{const a=fixture();a.expectedPdfSha256='0'.repeat(64);assert.equal(prepare(a).reason,'PDF_PIN_MISMATCH')});
test('問番号とページ番号の不一致は拒否',()=>{const a=fixture();a.verified.pdfPage=29;assert.equal(prepare(a).reason,'QUESTION_PAGE_IDENTITY_MISMATCH')});
test('選択肢欠落は拒否',()=>{const a=fixture();a.verified.choices.pop();assert.equal(prepare(a).reason,'CHOICES_UNVERIFIED')});
test('画像欠落は拒否',()=>{const a=fixture();delete a.verified.pagePng;assert.equal(prepare(a).reason,'PAGE_IMAGE_MISSING')});
test('図表未審査は拒否',()=>{const a=fixture();a.verified.tableVerified=false;assert.equal(prepare(a).reason,'VISUAL_CONTENT_UNVERIFIED')});
test('正答と問番号の不一致は拒否',()=>{const a=fixture();a.verified.answerQuestionNumber=27;assert.equal(prepare(a).reason,'ANSWER_IDENTITY_UNVERIFIED')});
