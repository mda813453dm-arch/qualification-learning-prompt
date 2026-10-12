import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQuestionPresentation,assertPresentationOrder} from '../src/question-presentation-controller.js';
const base={year:2025,section:'午前の部',number:5,stem:'問題本文',choices:['1','2','3','4','5']};
test('問5合格形式を順序固定',()=>{
 const p=buildQuestionPresentation({...base,imageRequired:true,inlineImage:{kind:'inline_image',assetId:'q5-crop',questionNumber:5}});
 assert.deepEqual(p.blocks.map(x=>x.kind),['question_header','question_text','figure_label','inline_image','choices','instruction']);
 assert.equal(assertPresentationOrder(p).ok,true);
});
test('図必須なのに画像未準備なら出題しない',()=>{
 assert.equal(buildQuestionPresentation({...base,imageRequired:true}).reason,'INLINE_IMAGE_REQUIRED');
});
test('別問題の図は拒否',()=>{
 assert.equal(buildQuestionPresentation({...base,imageRequired:true,inlineImage:{kind:'inline_image',assetId:'q4-crop',questionNumber:4}}).reason,'INLINE_IMAGE_QUESTION_MISMATCH');
});
test('図なし問題は本文から選択肢へ進める',()=>{
 const p=buildQuestionPresentation({...base,imageRequired:false});
 assert.deepEqual(p.blocks.map(x=>x.kind),['question_header','question_text','choices','instruction']);
 assert.equal(assertPresentationOrder(p).ok,true);
});
test('表は図の後、選択肢の前に固定',()=>{
 const p=buildQuestionPresentation({...base,imageRequired:true,inlineImage:{kind:'inline_image',assetId:'q5-crop',questionNumber:5},supplemental:[{kind:'table',rows:[['S','100m']]}]});
 assert.deepEqual(p.blocks.map(x=>x.kind),['question_header','question_text','figure_label','inline_image','table','choices','instruction']);
 assert.equal(assertPresentationOrder(p).ok,true);
});
