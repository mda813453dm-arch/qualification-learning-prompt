// One-shot production smoke: creates an isolated test session, never answers or grades.
import assert from 'node:assert/strict';

const base = process.env.QLP_BASE_URL;
const token = process.env.QLP_TEST_TOKEN;
assert.ok(base && token, 'PRODUCTION_CONFIG_MISSING');
const hostChat = 'e'.repeat(64); // isolated non-user host binding
async function post(path, input) {
  const res = await fetch(base + path, {
    method:'POST', headers:{ authorization:'Bearer ' + token, 'content-type':'application/json',
      'x-qlp-host-chat':hostChat },
    body:JSON.stringify(input), signal:AbortSignal.timeout(120000),
  });
  const result = await res.json();
  if (!res.ok) throw new Error('LIVE_HTTP_' + res.status + ' ' + JSON.stringify(result).slice(0, 400));
  return result;
}
const session = await post('/v1/sessions', { qualificationId:'宅建', sources:[] });
assert.ok(session.sessionId && session.learnerId, 'LIVE_TAKKEN_SESSION_MISSING');
const started = await post('/v1/study/start', { qualificationName:'宅建',
  learnerId:session.learnerId, sessionId:session.sessionId });
assert.ok(started.studyId, 'LIVE_TAKKEN_START_MISSING');
const view = await post('/v1/sessions/' + session.sessionId + '/next', { topic:'8種制限' });
console.log('TAKKEN_8_RESTRICTIONS_TOPIC', JSON.stringify({
  status:view.status,
  questionId:view.question?.questionId,
  fieldName:view.question?.fieldName,
  notice:view.notice,
  sourceCount:view.job?.readyQuestionCount ?? null,
}));
assert.equal(view.status, 'question', 'LIVE_8_RESTRICTIONS_NOT_QUESTION');
assert.ok(view.question?.questionId && view.question?.stem && view.question.choices?.length >= 4, 'LIVE_QUESTION_INCOMPLETE');
assert.ok(view.question?.fieldName?.includes('宅地建物取引業法'), 'LIVE_QUESTION_WRONG_FIELD');
assert.equal(view.question?.correctAnswer, undefined, 'CORRECT_ANSWER_MUST_NOT_LEAK');
console.log('PASS live Takken 8種制限 verified official question routing');
