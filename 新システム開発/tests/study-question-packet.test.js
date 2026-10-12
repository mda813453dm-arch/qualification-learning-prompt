import test from 'node:test';import assert from 'node:assert/strict';
import {createStudyQuestionPacket,judgeStudyAnswer,assertCompletePacket} from '../src/study-question-packet.js';
const h='a'.repeat(64),a='b'.repeat(64);
const base={qualification:'土地家屋調査士',year:2025,section:'午前の部',number:2,stem:'本文',figure:{questionNumber:2,assetId:'q2'},choices:['1','2','3','4','5'],answer:4,questionSourceSha256:h,answerSourceSha256:a};
test('必要情報を一括返却',()=>{const p=createStudyQuestionPacket(base);assert.deepEqual(p.display.map(x=>x.kind),['number','stem','figure','choices']);assert.equal(p.answer.number,4);assert.equal(assertCompletePacket(p,{figureRequired:true}).ok,true)});
test('別問の図を拒否',()=>assert.equal(createStudyQuestionPacket({...base,figure:{questionNumber:3,assetId:'q3'}}).reason,'FIGURE_INVALID'));
test('正解欠落を拒否',()=>assert.equal(createStudyQuestionPacket({...base,answer:null}).reason,'ANSWER_INVALID'));
test('回答4を即時正解判定',()=>assert.equal(judgeStudyAnswer(createStudyQuestionPacket(base),4).correct,true));
test('回答3を即時不正解判定',()=>{const x=judgeStudyAnswer(createStudyQuestionPacket(base),3);assert.equal(x.correct,false);assert.equal(x.correctAnswer,4)});
