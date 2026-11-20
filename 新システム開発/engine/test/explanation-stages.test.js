import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { preAnswerHint } from '../src/pre-answer-hint.js';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-current.js';
import { widgetHtml as previousHtml, WIDGET_URI as PREVIOUS_URI } from '../src/widget-v203.js';

const q = { questionId:'official:2025:5',kind:'new',fieldName:'民法・意思表示',
  progress:{review:false},stem:'問題文',choices:['選択肢１','選択肢２'] };
const grade = {questionId:q.questionId,selected:1,correct:false,correctAnswer:2,
  correctAnswerLabel:'2',acceptedAnswers:[2],answerSourceType:'official_pdf'};

function gradeHtml(question, currentGrade) {
  const html=widgetHtml();
  const first=html.indexOf('  function instantFeedbackModel(');
  const last=html.indexOf('\n  function gradeBanner(g, label){',first);
  assert.ok(first>=0 && last>first);
  const ctx = { q:question,g:currentGrade,
    esc:s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
    safeUrl:u=>/^https:\/\//.test(String(u||''))?u:'',
    answerReferenceLink:()=>'<a>出典</a>' };
  return runInNewContext(html.slice(first,last)+'\nofficialAnswerSummary(q,g);',ctx);
}

test('v204 phase 1 is opt-in and never derives a hint from a key, choices, or previous grade', () => {
  const before = preAnswerHint(q);
  const withAnswers = preAnswerHint({...q,choices:['正答はこちら','別の回答'],grade,
    correctAnswer:1,acceptedAnswers:[1],history:{answers:['1']}});
  assert.deepEqual(withAnswers,before,'answer data is irrelevant to the thinking strategy');
  assert.equal(before.kind,'thinking_strategy');
  assert.equal(before.isReview,false);
  assert.doesNotMatch(before.text,/選択肢１|選択肢２|正答はこちら|誤りの選択肢/);
  assert.match(before.text,/要件/);
});

test('review is a closed-book recall before grading; guidance requires no AI or regrading', () => {
  const review=preAnswerHint({...q,kind:'review',progress:{review:true}});
  assert.equal(review.isReview,true);
  assert.match(review.text,/復習の再想起/);
  const html=widgetHtml();
  assert.equal(WIDGET_URI,'ui://qlp/question-v204.html');
  assert.equal(WIDGET_VERSION,'2026-11-20.204');
  assert.match(html,/id="preAnswerHint"[^>]*aria-expanded="false"/);
  assert.match(html,/id="preAnswerHintBody"[^>]*hidden/);
  assert.match(html,/ヒントを見る（任意・正答は非表示）/);
  assert.match(html,/復習・再想起：/);
  assert.match(html,/state\.answered \|\| !state\.question/);
  const eventStart=html.indexOf("    var hintButton = document.getElementById('preAnswerHint');");
  const eventEnd=html.indexOf("    var descButton = document.getElementById('descriptiveMenuStart');",eventStart);
  assert.ok(eventStart>0 && eventEnd>eventStart);
  const handler=html.slice(eventStart,eventEnd);
  assert.match(handler,/hintButton\.onclick = function/);
  assert.match(handler,/panel\.hidden = false/);
  assert.doesNotMatch(handler,/callTool|submitAnswer|showGrade|nextQuestion|requestAdaptiveExplanation|ask\(/);
});

test('official answer and recall feedback only appear after submission, retaining full grade controls', () => {
  const reviewQ={...q,kind:'review',progress:{review:true}};
  const later=gradeHtml(reviewQ,grade);
  assert.match(later,/再想起の答え合わせ/);
  assert.match(later,/選択肢 1 は保存済みの正答に含まれません/);
  assert.match(later,/正答：/);
  assert.match(later,/判断理由/);
  const newQ=gradeHtml(q,grade);
  assert.doesNotMatch(newQ,/再想起の答え合わせ/);
  const html=widgetHtml();
  assert.match(html,/async function answer\(v\)/);
  assert.match(html,/await callTool\('submitAnswer'/);
  assert.match(html,/loadExplanation\(q\.questionId, true\)/);
  assert.match(html,/qlp-feedback-v202/);
  assert.match(html,/qlp-ai-latency-v203/);
  assert.match(html,/qlp-route-v201/);
});

test('legacy v203 stays immutable, native document scroll and official figure ordering are preserved', () => {
  const old=previousHtml(),now=widgetHtml();
  assert.equal(PREVIOUS_URI,'ui://qlp/question-v203.html');
  assert.doesNotMatch(old,/qlp-study-stages-v204|preAnswerHintBody/);
  assert.match(now,/qlp-study-stages-v204/);
  const section=now.indexOf('    var beforeAnswerHint = preAnswerHint(q);');
  const choices=now.indexOf("h += '<div class=\"choices\">' + (q.choices || []).map");
  const st=now.indexOf("if (q.stem) h += '<div class=\"stem\">'");
  const fig=now.indexOf('h += questionFigureHtml(q);');
  assert.ok(st>=0 && fig>st && choices>fig && section>choices);
  assert.match(now,/#app\.study-viewport\{height:auto;max-height:none;overflow:visible/);
  const engine=readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
  assert.match(engine,/kind: 'review'/);
});
