import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, newState, pin } from '../src/engine.js';
import { validateResult } from '../src/ingest.js';

const src = { qualificationId: 'q041', year: 2020, section: '10月' };
const hash = 'a'.repeat(64);
const base = {
  qualificationId: 'q041', year: 2020, section: '10月', questionId: 'q041:2020:10月:42',
  questionNumber: 42, fieldId: 't7', stem: '正解を選びなさい', stemMode: 'text',
  choices: ['一','二','三','四'], choiceMode: 'text', correctAnswer: 1,
  questionPdfSha256: hash, answerPdfSha256: hash, figures: [], diagramRequired: false,
};
function result(packet) {
  return { status: 'ready', parserVersion: 'test', qualificationId: src.qualificationId,
    year: src.year, section: src.section, questionPdfSha256: hash,
    answerPdfSha256: hash, packets: [packet], excluded: [] };
}

test('公式複数正答1または4を正しく検証・両方採点する', async () => {
  const packet = { ...base, acceptedAnswers: [1,4], allCorrect: false, correctAnswerLabel: '1または4' };
  const valid = await validateResult(src, { question: hash, answer: hash }, 'test', result(packet), {});
  assert.equal(valid.status, 'ready');
  for (const value of [1,4]) {
    const state = pin(newState({ qualificationId: 'q041', now: 0 }),
      { packet, keyParts: {} }, 'new', 0);
    const g = grade(state, {questionId:packet.questionId,value}, {today:'2026-10-22', now:0});
    assert.equal(g.grade.correct, true);
    assert.equal(g.grade.correctAnswerLabel, '1または4');
  }
  const state = pin(newState({ qualificationId: 'q041', now: 0 }), {packet,keyParts:{}}, 'new',0);
  assert.equal(grade(state,{questionId:packet.questionId,value:2},{today:'2026-10-22',now:0}).grade.correct,false);
});

test('公式正解肢なし・全員正解を4選択肢すべて正答として扱う', async () => {
  const packet = { ...base, correctAnswer:1,acceptedAnswers:[1,2,3,4],allCorrect:true,correctAnswerLabel:'正解肢なし（全員正解）' };
  const valid = await validateResult(src, {question:hash,answer:hash}, 'test', result(packet), {});
  assert.equal(valid.status,'ready');
  for(const value of [1,2,3,4]) {
    const state=pin(newState({qualificationId:'q041',now:0}),{packet,keyParts:{}},'new',0);
    const g=grade(state,{questionId:packet.questionId,value},{today:'2026-10-22',now:0});
    assert.equal(g.grade.correct,true);
    assert.equal(g.grade.correctAnswerLabel,'正解肢なし（全員正解）');
  }
});

test('正答の範囲外・不整合・欠落は取り込みを拒否する', async () => {
  const variants=[
    {acceptedAnswers:[1,5],allCorrect:false,correctAnswerLabel:'1または5'},
    {acceptedAnswers:[1,1],allCorrect:false,correctAnswerLabel:'1または1'},
    {acceptedAnswers:[1,4],allCorrect:true,correctAnswerLabel:'全員正解'},
    {acceptedAnswers:[1,4],allCorrect:false},
  ];
  for (const v of variants) {
    const valid=await validateResult(src,{question:hash,answer:hash},'test',result({...base,...v}),{});
    assert.equal(valid.status,'unavailable');
    assert.equal(valid.excluded[0].reason,'OFFICIAL_SPECIAL_ANSWER_INVALID');
  }
});
