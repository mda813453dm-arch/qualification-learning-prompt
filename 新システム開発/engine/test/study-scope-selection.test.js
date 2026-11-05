import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle, overviewFor } from '../src/app.js';
import { CATALOG } from '../src/catalog.js';
import { SRC, T0, pdf, fakeWeb, fakeParser, assetsB64 } from './helpers.js';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-v185.js';

const TOKEN = 'scope-selection-regression';
const SOURCE = { adapter:SRC.adapter, year:SRC.year, section:SRC.section,
  questionUrl:SRC.questionUrl, answerUrl:SRC.answerUrl };

function setup() {
  // Synthetic source for predictable field packets: never request live official PDFs.
  CATALOG.surveyor.sources = [SOURCE];
  const web = fakeWeb({ [SRC.questionUrl]:pdf('scope-question'), [SRC.answerUrl]:pdf('scope-answer') });
  const parse = fakeParser(web, { src:{ ...SRC, qualificationId:'q063' },
    fieldIds:['s1','s2','s2'], answers:[3,1,4], figureOn:[] });
  const env = { STORE:new MemoryStore(), API_TOKEN:TOKEN, PARSER_URL:'https://parser.example', now:T0,
    fetchPdf:web.fetchPdf, fetchText:async()=>'' };
  env.clock = () => env.now;
  env.parserFetch = async (url, init) => {
    const b = JSON.parse(init.body);
    const decode = x => Uint8Array.from(atob(x.base64), ch => ch.charCodeAt(0));
    const result = await parse({ question:{bytes:decode(b.question)}, answer:{bytes:decode(b.answer)} });
    return new Response(JSON.stringify({result:result.result, assets:assetsB64(result.assets)}));
  };
  const call = async (method,path,value) => {
    const resp=await handle(new Request('https://engine.example'+path,{
      method,headers:{authorization:'Bearer '+TOKEN, 'content-type':'application/json',
        'x-qlp-host-chat':'d'.repeat(64)},
      body:value===undefined?undefined:JSON.stringify(value),
    }),env);
    return {status:resp.status, body:await resp.json()};
  };
  return {env,call};
}
async function start(call) {
  const value=await call('POST','/v1/sessions',{qualificationId:'測量士補',sources:[SOURCE]});
  assert.equal(value.status,201,JSON.stringify(value.body));
  return value.body;
}

test('study target UI exposes one free-entry box on initial study and resume',()=>{
  const html=widgetHtml();
  assert.match(WIDGET_URI,/question-v185\.html/);
  assert.equal(WIDGET_VERSION,'2026-11-05.185');
  assert.match(html,/学習する分野を選択/);
  assert.match(html,/間違えた問題を復習/);
  assert.match(html,/おまかせ（従来の頻出・分野順）/);
  assert.match(html,/startScopeSelectionForPlan/);
  assert.match(html,/id="studyScopeFreeField"/);
  assert.match(html,/id="studyScopeFreeStart"/);
  assert.match(html,/<select id="studyScopeChoices"/);
  assert.match(html,/<option value="/);
  assert.match(html,/id="studyScopeChooseStart">選択した内容で学習する/);
  assert.match(html,/id="studyScopeChoiceStatus"/);
  assert.match(html,/操作を受け付けました。学習を開始しています/);
  assert.match(html,/Date\.now\(\) - renderedAt < 300/);
  assert.doesNotMatch(html,/data-study-scope=/,'分野一覧はボタンでなくネイティブ選択欄');
  assert.match(html,/分野名・論点を直接入力/);
  assert.match(html,/登録分野名の一部でも指定できます/);
  assert.match(html,/複数の分野に一致/);
  assert.match(html,/normalizeField/);
  assert.match(html,/mode:'topic'/);
  assert.match(html,/clearTopic:true/,'再開時におまかせを選んだら論点固定を解除する');
  assert.equal((html.match(/id="studyScopeFreeField"/g) || []).length, 1, 'only one field entry is rendered');
  // Regression: an unescaped hyphen at the end of a character class removed
  // all Japanese letters between ')' and the full-width hyphen.
  const matcher = html.match(/normalize\('NFKC'\)\.replace\((\/\[[^\n]+?\]\/g), ''\)/);
  assert.ok(matcher, 'the rendered field-normalization regexp exists');
  const separator = new Function('return ' + matcher[1])();
  assert.equal('測量に関する'.replace(separator,''), '測量に関する');
  assert.equal('8種制限'.replace(separator,''), '8種制限');
  assert.equal('宅建-業法'.replace(separator,''), '宅建業法');
  assert.match(html,/resumeWithScope/);
  assert.match(html,/fieldName: chosenField/);
  assert.match(html,/fieldName: field/);
  assert.match(html,/fieldOrderExplicit: false/,'初期計画は任意分野の選択を残す');
  assert.match(html,/draftPlan\(\)\.fieldOrderExplicit=true/,'確定した順位を開始の意思として保持する');
  assert.match(html,/if \(draftPlan\(\)\.fieldOrderExplicit\) \{\s*startStudyNow\(ov\.name, studyLearner, \{ mode:'auto' \}\)/,
    '明示的に並べ替えた学習計画からは分野再選択を挟まず開始する');
});

test('exact field choice only returns packets in the requested field; invalid or exempt field is rejected',async()=>{
  const {call}=setup(), first=await start(call), sid=first.sessionId;
  const fieldNames=overviewFor('q063').fields;
  assert.ok(fieldNames.includes('多角測量'));
  const wrong=await call('POST','/v1/sessions/'+sid+'/next',{fieldName:'存在しない分野'});
  assert.equal(wrong.status,400);
  assert.equal(wrong.body.error,'FIELD_INVALID');
  const exact=await call('POST','/v1/sessions/'+sid+'/next',{fieldName:'多角測量'});
  assert.equal(exact.status,200,JSON.stringify(exact.body));
  assert.equal(exact.body.status,'question');
  assert.ok([2,3].includes(exact.body.question.questionNumber),JSON.stringify(exact.body.question));
  assert.equal(exact.body.question.fieldName,'多角測量');
});

test('review choice with no past mistakes stays empty and never silently switches to a new question',async()=>{
  const {env,call}=setup(), first=await start(call);
  const before=await env.STORE.get('ses/'+first.sessionId);
  const review=await call('POST','/v1/sessions/'+first.sessionId+'/next',{question:'総復習（間違えた問題）'});
  assert.equal(review.status,200);
  assert.equal(review.body.status,'reviewEmpty');
  assert.equal(await env.STORE.get('ses/'+first.sessionId),before);
});

test('wrong question review returns the saved wrong packet rather than an unrelated new question',async()=>{
  const {call}=setup(), first=await start(call), sid=first.sessionId;
  const q=(await call('POST','/v1/sessions/'+sid+'/next',{fieldName:'測量に関する法規'})).body.question;
  assert.equal(q.questionNumber,1);
  const grade=await call('POST','/v1/sessions/'+sid+'/answer',{questionId:q.questionId,value:'1'});
  assert.equal(grade.status,200);
  assert.equal(grade.body.grade.correct,false);
  const review=await call('POST','/v1/sessions/'+sid+'/next',{question:'総復習（間違えた問題）'});
  assert.equal(review.status,200,JSON.stringify(review.body));
  assert.equal(review.body.status,'question');
  assert.equal(review.body.question.questionId,q.questionId);
  assert.equal(review.body.question.kind,'review');
});

test('restart exposes the same qualification fields with stored wrong-answer count',async()=>{
  const {call}=setup(), first=await start(call), sid=first.sessionId;
  const q=(await call('POST','/v1/sessions/'+sid+'/next',{fieldName:'測量に関する法規'})).body.question;
  await call('POST','/v1/sessions/'+sid+'/answer',{questionId:q.questionId,value:'1'});
  const resumed=await call('POST','/v1/sessions',{qualificationId:'測量士補',sources:[SOURCE]});
  assert.equal(resumed.status,201,JSON.stringify(resumed.body));
  assert.equal(resumed.body.status,'resumeReady');
  assert.ok(resumed.body.fields.includes('測量に関する法規'));
  assert.ok(resumed.body.fields.includes('多角測量'));
  assert.equal(resumed.body.wrongCount,1);
});

test('free-typed topic uses only matching verified packets and does not fall back to another field',async()=>{
  const {call}=setup(), first=await start(call), sid=first.sessionId;
  const noMatch=await call('POST','/v1/sessions/'+sid+'/next',{topic:'この資格には存在しない抽象論点'});
  assert.equal(noMatch.status,200);
  assert.equal(noMatch.body.status,'topicUnavailable');
  assert.match(noMatch.body.notice,/自動的に切り替えません/);
  const invalid=await call('POST','/v1/sessions/'+sid+'/next',{topic:'A'});
  assert.equal(invalid.status,400);
  assert.equal(invalid.body.error,'TOPIC_INVALID');
  const chosen=await call('POST','/v1/sessions/'+sid+'/next',{topic:'多角測量'});
  assert.equal(chosen.status,200,JSON.stringify(chosen.body));
  assert.equal(chosen.body.status,'question');
  assert.equal(chosen.body.question.fieldName,'多角測量');
});

test('free-typed topic remains active for the graded next question and subsequent next calls',async()=>{
  const {call}=setup(), first=await start(call), sid=first.sessionId;
  const initial=await call('POST','/v1/sessions/'+sid+'/next',{topic:'多角測量'});
  assert.equal(initial.body.status,'question');
  assert.equal(initial.body.question.fieldName,'多角測量');
  const answered=await call('POST','/v1/sessions/'+sid+'/answer',{
    questionId:initial.body.question.questionId,value:'1',
  });
  assert.equal(answered.status,200,JSON.stringify(answered.body));
  assert.equal(answered.body.next?.question?.fieldName,'多角測量',
    '採点時の先読み出題でも選んだ論点から逸脱させない');
  const following=await call('POST','/v1/sessions/'+sid+'/next',{});
  assert.equal(following.body.status,'question',JSON.stringify(following.body));
  assert.equal(following.body.question.fieldName,'多角測量',
    '次の問題ボタンは自由入力した対象を保持する');
});

test('explicit switch to automatic selection clears the topic while preserving an unanswered question',async()=>{
  const {env,call}=setup(), first=await start(call), sid=first.sessionId;
  const initial=await call('POST','/v1/sessions/'+sid+'/next',{topic:'多角測量'});
  assert.equal(initial.body.status,'question');
  let state=JSON.parse(await env.STORE.get('ses/'+sid)).state;
  assert.equal(state.activeTopic,'多角測量');
  const auto=await call('POST','/v1/sessions/'+sid+'/next',{clearTopic:true});
  assert.equal(auto.status,200,JSON.stringify(auto.body));
  assert.equal(auto.body.question?.questionId,initial.body.question.questionId,
    '明示変更でも未回答の公式問は勝手に廃棄しない');
  state=JSON.parse(await env.STORE.get('ses/'+sid)).state;
  assert.equal(state.activeTopic,null,'未回答問の再表示経路でもおまかせ変更を保存');
  const invalid=await call('POST','/v1/sessions/'+sid+'/next',{topic:'多角測量',clearTopic:true});
  assert.equal(invalid.status,400);
});
