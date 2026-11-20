import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { instantFeedbackModel } from '../src/instant-feedback.js';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-v202.js';
import { WIDGET_URI as OLD_URI, WIDGET_VERSION as OLD_VERSION, widgetHtml as oldWidgetHtml } from '../src/widget-v201.js';

const q = { questionId:'official-q-2025-17', choices:['正しくない説明','正答の選択肢','別の説明'], year:2025, questionNumber:17 };
const baseGrade = {
  questionId:q.questionId, correctAnswer:2, correctAnswerLabel:'2',
  acceptedAnswers:[2], selected:1, correct:false, answerPdfUrl:'https://example.org/official-answer.pdf',
  answerSourceType:'official_pdf',
};

function rendered(qArg, gArg) {
  const html = widgetHtml();
  const start = html.indexOf('  function instantFeedbackModel(');
  const end = html.indexOf('\n  function gradeBanner(g, label){', start);
  assert.ok(start >= 0 && end > start, 'live widget embeds the guarded instant feedback renderer');
  const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const ctx = {
    q:qArg, g:gArg, esc,
    safeUrl: url => /^https:\/\//.test(String(url||'')) ? url : '',
    answerReferenceLink: g => '<a href="' + esc(g.answerPdfUrl) + '">公式の正答PDF</a>',
  };
  return runInNewContext(html.slice(start, end)+'\nofficialAnswerSummary(q,g);', ctx);
}

test('v202 immediately shows exact engine-graded answer and chosen wrong option, with no AI wait', () => {
  assert.equal(WIDGET_URI,'ui://qlp/question-v202.html');
  assert.equal(WIDGET_VERSION,'2026-11-20.202');
  const model = instantFeedbackModel(q,baseGrade);
  assert.equal(model.correctLabel,'2');
  assert.deepEqual(model.correctChoices,[{number:2,text:'正答の選択肢'}]);
  assert.deepEqual(model.selected,{number:1,text:'正しくない説明'});
  assert.equal(model.rationaleVerified,false);
  const html = rendered(q,baseGrade);
  assert.match(html,/正答の選択肢/);
  assert.match(html,/正しくない説明/);
  assert.match(html,/選択肢 1 は保存済みの正答に含まれません/);
  assert.match(html,/判断理由は、この正答表だけでは確認できません/);
  assert.match(html,/正答番号の出典/);
  assert.match(html,/全選択肢と正答の位置を確認する/);
  assert.doesNotMatch(html,/ui\/message|loadExplanation|waitForPublishedExplanation/);
});

test('positive answer, dontKnow, and multiple accepted answers preserve engine mapping', () => {
  assert.equal(instantFeedbackModel(q,{...baseGrade,selected:2,correct:true}).correct,true);
  assert.match(rendered(q,{...baseGrade,selected:2,correct:true}),/保存済みの正答と一致/);
  assert.match(rendered(q,{...baseGrade,dontKnow:true,selected:null}),/後日の復習で再挑戦/);
  const multiple=instantFeedbackModel(q,{...baseGrade,acceptedAnswers:[2,3,3]});
  assert.deepEqual(multiple.correctChoices.map(c=>c.number),[2,3]);
});

test('a mismatched questionId never leaks another problem answer or invents rationale', () => {
  const mismatch = {...baseGrade,questionId:'DIFFERENT'};
  assert.equal(instantFeedbackModel(q,mismatch).status,'binding_unavailable');
  const html = rendered(q,mismatch);
  assert.match(html,/照合ができません/);
  assert.doesNotMatch(html,/正答の選択肢|正答番号の出典|正答：/);
});

test('untrusted choice and label text is escaped; no proof source is invented', () => {
  const malicious = { questionId:q.questionId,choices:['<img src=x onerror=alert(1)>','正しい説明'] };
  const g={...baseGrade,answerPdfUrl:'javascript:alert(1)',correctAnswerLabel:'<script>alert(1)</script>'};
  const html=rendered(malicious,g);
  assert.doesNotMatch(html,/<img src=x|<script>alert/);
  assert.match(html,/&lt;img/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/正答を照合した資料へのリンクはありません/);
  assert.doesNotMatch(html,/href="javascript:/);
});

test('v201 remains exact legacy UI; v202 keeps natural height, local field progress and detail button', () => {
  const current=widgetHtml(),old=oldWidgetHtml();
  assert.equal(OLD_URI,'ui://qlp/question-v201.html');
  assert.equal(OLD_VERSION,'2026-11-19.201');
  assert.match(current,/qlp-feedback-v202/);
  assert.doesNotMatch(old,/qlp-feedback-v202/);
  assert.match(current,/qlp-v192-natural-height/);
  assert.match(current,/qlp-route-v201/);
  assert.match(current,/function localBar\(/);
  assert.match(current,/AIの詳しい解説を追加/);
  assert.match(current,/getStudySnapshot/);
});
