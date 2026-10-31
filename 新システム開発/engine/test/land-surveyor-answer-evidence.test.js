import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, pin, grade } from '../src/engine.js';
import { widgetHtml } from '../src/widget.js';

function score(answerPdfUrl, value = '3') {
  const now = Date.UTC(2026, 9, 31, 5);
  const state = newState({qualificationId:'land_surveyor', now});
  const packet = {
    qualificationId:'land_surveyor', year:2007, section:'午後の部',
    questionNumber:1, questionId:'land_surveyor:2007:午後の部:1',
    fieldId:'l3', stem:'PDF原本で照合済みの問題', stemMode:'text',
    choices:['1','2','3','4','5'], correctAnswer:3,
    questionPdfSha256:'a'.repeat(64), answerPdfSha256:'b'.repeat(64),
    questionPdfUrl:'https://izuki.net/wp-content/uploads/c_h19am_q.pdf',
    answerPdfUrl, figures: [],
  };
  const item={ packet, keyParts: { parserVersion:'0.8.2' } };
  const result=grade(pin(state,item,'new',now),{questionId:packet.questionId,value},
    {today:'2026-10-31',now,intervals:[1,3,7]});
  assert.equal(result.ok,true);
  return result.grade;
}

test('サイト本文の解答で採点した結果は出典URLと非公式の区分を保持',()=>{
  const site='https://izuki.net/chousashi-past-tests/';
  const right=score(site,'3');
  assert.equal(right.correct,true);
  assert.equal(right.answerPdfUrl,site);
  assert.equal(right.answerSourceType,'secondary_web_answer');
  const wrong=score(site,'4');
  assert.equal(wrong.correct,false);
  assert.equal(wrong.answerPdfUrl,site);
  assert.equal(wrong.answerSourceType,'secondary_web_answer');
});

test('法務省公表資料の転載PDFと法務省公式PDFは区別して記録',()=>{
  assert.equal(score('https://izuki.net/wp-content/uploads/c_h27_a.pdf').answerSourceType,
    'archived_official_pdf_copy');
  assert.equal(score('https://www.moj.go.jp/content/001000000.pdf').answerSourceType,
    'official_answer_pdf');
});

test('採点画面はURLを根拠としてリンク表示し、非公式表を公式PDFと偽らない',()=>{
  const html=widgetHtml();
  assert.match(html,/function answerReferenceLink\(g\)/);
  assert.match(html,/掲載サイトの解答表（非公式）/);
  assert.match(html,/法務省公表の正答PDF（掲載サイト転載）/);
  assert.match(html,/解答の根拠：/);
  assert.match(html,/answerReferenceLink\(g\)/);
});
