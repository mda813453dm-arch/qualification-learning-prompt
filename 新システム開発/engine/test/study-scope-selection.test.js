import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle, overviewFor } from '../src/app.js';
import { SRC, T0, pdf, fakeWeb, fakeParser, assetsB64 } from './helpers.js';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-v175.js';

const TOKEN = 'scope-selection-regression';
const SOURCE = { adapter:SRC.adapter, year:SRC.year, section:SRC.section,
  questionUrl:SRC.questionUrl, answerUrl:SRC.answerUrl };

function setup() {
  const web = fakeWeb({ [SRC.questionUrl]:pdf('scope-question'), [SRC.answerUrl]:pdf('scope-answer') });
  const parse = fakeParser(web, { fieldIds:['s1','s2','s2'], answers:[3,1,4], figureOn:[] });
  const env = { STORE:new MemoryStore(), API_TOKEN:TOKEN, PARSER_URL:'https://parser.example', now:T0,
    fetchPdf:web.fetchPdf };
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

test('study target UI is available for new study and resume (exact fields only)',()=>{
  const html=widgetHtml();
  assert.match(WIDGET_URI,/question-v175\.html/);
  assert.equal(WIDGET_VERSION,'2026-11-03.175');
  assert.match(html,/学習する分野を選択/);
  assert.match(html,/間違えた問題を復習/);
  assert.match(html,/おまかせ（従来の頻出・分野順）/);
  assert.match(html,/startScopeSelectionForPlan/);
  assert.match(html,/resumeWithScope/);
  assert.match(html,/fieldName: chosenField/);
  assert.match(html,/fieldName: field/);
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
