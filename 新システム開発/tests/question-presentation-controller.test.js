import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQuestionPresentation,assertPresentationOrder,renderAtomically} from '../src/question-presentation-controller.js';
const base={year:2025,section:'午前の部',number:5,stem:'問題本文',choices:['A','B','C','D','E']};
const image={kind:'inline_image',assetId:'q5-crop',questionNumber:5};
test('問5合格形式をatomic順序固定',()=>{
 const p=buildQuestionPresentation({...base,imageRequired:true,inlineImage:image});
 assert.deepEqual(p.events.map(x=>x.kind),['question_header','question_text','figure_label','inline_image','choices','instruction']);
 assert.equal(assertPresentationOrder(p).ok,true);
});
test('図必須なのに画像未準備なら出題拒否',()=>assert.equal(buildQuestionPresentation({...base,imageRequired:true}).reason,'INLINE_IMAGE_REQUIRED'));
test('別問題の図は拒否',()=>assert.equal(buildQuestionPresentation({...base,imageRequired:true,inlineImage:{...image,questionNumber:4}}).reason,'INLINE_IMAGE_QUESTION_MISMATCH'));
test('表は図直後・選択肢前',()=>{
 const p=buildQuestionPresentation({...base,imageRequired:true,inlineImage:image,supplemental:[{kind:'table',rows:[['S','100m']]}]});
 assert.deepEqual(p.events.map(x=>x.kind),['question_header','question_text','figure_label','inline_image','table','choices','instruction']);
});
test('実レンダラも同じ順序以外を作れない',async()=>{
 const p=buildQuestionPresentation({...base,imageRequired:true,inlineImage:image});
 const log=[];
 await renderAtomically(p,{emitText:async e=>log.push(e.kind),emitImage:async e=>log.push(e.kind)});
 assert.deepEqual(log,['question_header','question_text','figure_label','inline_image','choices','instruction']);
});
test('atomicでない手作りplanは拒否',async()=>{
 await assert.rejects(()=>renderAtomically({status:'question',atomic:false,events:[]},{emitText:async()=>{},emitImage:async()=>{}}),/PRESENTATION_INVALID/);
});
