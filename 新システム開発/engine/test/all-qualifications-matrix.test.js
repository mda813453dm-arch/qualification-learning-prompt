// Comprehensive, offline qualification matrix. Synthetic questions are TEST-ONLY.
// Every registered qualification must support plan -> confirmation -> grading -> restore.
// No external PDFs, paid APIs or Cloud Run calls are made in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { newState, updatePlan, pickNext } from '../src/engine.js';
import { T0 } from './helpers.js';

const entries = Object.entries(CATALOG);
const idOf = (c) => c.qualificationId;
const makeEnv = () => ({ STORE: new MemoryStore(), API_TOKEN: 'test', clock: () => T0 });
async function call(env, method, path, payload) {
  const request = new Request('https://engine.example' + path, {
    method, headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const response = await handle(request, env);
  return { status: response.status, data: await response.json() };
}
const failContext = (slug, stage, result) => slug + ' / ' + stage + ': ' + JSON.stringify(result);
test('全登録資格：台帳の分野・ID・別名が衝突しない', () => {
  assert.ok(entries.length >= 100, '登録資格が不足');
  const ids = new Set();
  for (const [slug, c] of entries) {
    assert.ok(c.name && idOf(c), slug);
    assert.ok(!ids.has(idOf(c)), 'qualificationId重複: ' + slug);
    ids.add(idOf(c));
    assert.ok(Object.values(c.fields ?? {}).length >= 1, '分野がない: ' + slug);
    assert.ok(Object.values(c.fields).every(s => typeof s === 'string' && s.trim()), slug);
  }
});
test('全登録資格：計画優先順・確認問題の登録、採点、復元を一周する', async (t) => {
  for (const [slug, c] of entries) {
    await t.test(c.name + ' [' + slug + ']', async () => {
      const env = makeEnv();
      const fields = Object.entries(c.fields);
      const start = await call(env, 'POST', '/v1/sessions',
        { qualificationId: c.qualificationId, sources: [] });
      assert.equal(start.status, 201, failContext(slug, 'start', start));
      const sid = start.data.sessionId;
      assert.ok(sid, failContext(slug, 'sessionId', start));
      const chosenFields = fields.map(([,name]) => name).reverse();
      const plan = await call(env, 'POST', '/v1/sessions/' + sid + '/plan',
        { orderedFields: chosenFields, questionPreference: 'multiple_choice',
          questionPreferenceScope: 'new', examDate: '2027-10-01' });
      assert.equal(plan.status, 200, failContext(slug, 'plan', plan));
      assert.deepEqual(plan.data.orderedFields, chosenFields, failContext(slug, 'order', plan));
      const saved = await call(env, 'GET', '/v1/sessions/' + sid + '/restore');
      assert.equal(saved.status, 200, failContext(slug, 'restore', saved));
      const first = fields[0][1];
      const item = await call(env, 'POST', '/v1/sessions/' + sid + '/item',
        { fieldName: first, mode: 'check' });
      assert.equal(item.status, 200, failContext(slug, 'item', item));
      for (let n = 1; n <= 3; n++) {
        const prior = await call(env, 'GET', '/v1/sessions/' + sid + '/restore');
        assert.equal(prior.data.status, 'confirmation_pending', failContext(slug, 'pending ' + n, prior));
        const registration = await call(env, 'POST', '/v1/sessions/' + sid + '/confirmation/register',
          { question: 'TEST ONLY Q' + n + ': Which answer is correct for ' + slug + '?',
            choices: ['Option 1', 'Option 2', 'Option 3'],
            correctAnswer: 2, explanation: 'Synthetic test-only answer fixed before display.' });
        assert.equal(registration.status, 200, failContext(slug, 'register ' + n, registration));
        assert.equal(registration.data.status, 'confirmation_question', slug);
        assert.equal(registration.data.position, n, slug);
        assert.equal(registration.data.choices.length, 3, slug);
        assert.equal(registration.data.correctAnswer, undefined, 'ANSWER LEAK ' + slug);
        const resumeQuestion = await call(env, 'GET', '/v1/sessions/' + sid + '/restore');
        assert.equal(resumeQuestion.data.status, 'confirmation_question', failContext(slug, 'restoreQuestion', resumeQuestion));
        assert.equal(resumeQuestion.data.challengeId, registration.data.challengeId);
        const grading = await call(env, 'POST', '/v1/sessions/' + sid + '/confirmation/answer',
          { challengeId: registration.data.challengeId, selected: '2' });
        assert.equal(grading.status, 200, failContext(slug, 'answer ' + n, grading));
        assert.equal(grading.data.correct, true, failContext(slug, 'graded ' + n, grading));
        assert.equal(grading.data.position, n, slug);
        assert.equal(grading.data.complete, n === 3, slug);
      }
      const final = await call(env, 'GET', '/v1/sessions/' + sid + '/restore');
      assert.equal(final.data.status, 'confirmation_result', failContext(slug, 'complete', final));
      assert.equal(final.data.correctCount, 3, failContext(slug, 'score', final));
    });
  }
});
test('全登録資格：形式希望を新規問題で守り、保存済み問題の正答を出題前に漏らさない', async (t) => {
  for (const [slug,c] of entries) {
    await t.test(slug, () => {
      const fields = Object.keys(c.fields);
      const packets = fields.flatMap((fieldId,i) => [{
        packet: { questionId: 'test-' + slug + '-' + i, fieldId,
          questionType: 'multiple_choice', choices: ['a','b','c'], correctAnswer: 1,
          stem: 'Test-only question' } }]);
      const state = updatePlan(newState({ qualificationId: c.qualificationId, now: T0 }),
        { orderedFields: [...fields].reverse(), questionPreference: 'multiple_choice' },
        { fieldIds: fields });
      const result = pickNext(state, packets, { today: '2026-11-01', now: T0, job: null });
      assert.equal(result.status, 'question', failContext(slug, 'pick', result));
      assert.equal(result.item.packet.fieldId, fields.at(-1), slug);
      const descriptive = updatePlan(state, { questionPreference: 'descriptive' }, { fieldIds: fields });
      const unavailable = pickNext(descriptive, packets, { today: '2026-11-01', now: T0, job: null });
      assert.equal(unavailable.status, 'formatUnavailable', slug);
    });
  }
});
