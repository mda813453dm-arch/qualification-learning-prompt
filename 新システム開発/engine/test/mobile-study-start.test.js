import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { T0 } from './helpers.js';

function setup() {
  const env = { STORE: new MemoryStore(), API_TOKEN: 'study-start-mobile-test', now: T0 };
  env.clock = () => env.now;
  const chat = 'e'.repeat(64);
  const call = async (method, path, value) => {
    const response = await handle(new Request('https://engine.example' + path, {
      method, headers: { authorization: 'Bearer ' + env.API_TOKEN,
        'content-type': 'application/json', 'x-qlp-host-chat': chat },
      body: value === undefined ? undefined : JSON.stringify(value),
    }), env);
    return { status: response.status, body: await response.json() };
  };
  return { env, call };
}

test('賃管: initial plan approval starts once and a lost mobile response replays the same study', async () => {
  const { env, call } = setup();
  const session = await call('POST', '/v1/sessions', { qualificationId: '賃管', sources: [] });
  assert.equal(session.status, 201, JSON.stringify(session.body));
  const { sessionId, learnerId, overview } = session.body;
  assert.ok(sessionId && learnerId && overview?.fields?.length);
  const saved = await call('POST', '/v1/sessions/' + sessionId + '/plan', {
    orderedFields: overview.fields, methodChoice: 'balanced', reviewPreset: 'ai', startMode: 'standard',
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const payload = { qualificationName: '賃管', learnerId, sessionId };
  const first = await call('POST', '/v1/study/start', payload);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.ok(first.body.studyId);
  const original = await env.STORE.get('study/' + first.body.studyId, 'json');
  env.now += 1500;
  const replay = await call('POST', '/v1/study/start', payload);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.studyId, first.body.studyId);
  assert.equal(replay.body.learnerId, learnerId);
  assert.equal(replay.body.startTime, first.body.startTime);
  assert.deepEqual(await env.STORE.get('study/' + first.body.studyId, 'json'), original,
    'no duplicate start or modification to elapsed time');
  assert.equal((await call('GET', '/v1/sessions/' + sessionId + '/restore')).status, 200);
});

test('賃管: another new study frame creates a new timer, not a replay of the previous frame', async () => {
  const { env, call } = setup();
  const first = await call('POST', '/v1/sessions', { qualificationId: '賃管', sources: [] });
  assert.equal(first.status, 201);
  const startOne = await call('POST', '/v1/study/start', {
    qualificationName: '賃管', sessionId: first.body.sessionId, learnerId: first.body.learnerId,
  });
  assert.equal(startOne.status, 201);
  // Use the same clock millisecond to catch timestamp-only false replays.
  const second = await call('POST', '/v1/sessions', { qualificationId: '賃管', sources: [] });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.sessionId, first.body.sessionId);
  const startTwo = await call('POST', '/v1/study/start', {
    qualificationName: '賃管', sessionId: second.body.sessionId, learnerId: second.body.learnerId,
  });
  assert.equal(startTwo.status, 201, JSON.stringify(startTwo.body));
  assert.notEqual(startTwo.body.studyId, startOne.body.studyId);
  assert.equal((await call('GET', '/v1/sessions/' + first.body.sessionId + '/restore')).status, 404);
  assert.equal((await call('POST', '/v1/study/start', {
    qualificationName: '賃管', sessionId: first.body.sessionId, learnerId: first.body.learnerId,
  })).status, 404);
  env.now += 2000;
  const replayTwo = await call('POST', '/v1/study/start', {
    qualificationName: '賃管', sessionId: second.body.sessionId, learnerId: second.body.learnerId,
  });
  assert.equal(replayTwo.status, 200);
  assert.equal(replayTwo.body.studyId, startTwo.body.studyId);
});

test('賃管: study start refuses unrelated learner for the approved frame', async () => {
  const { call } = setup();
  const session = await call('POST', '/v1/sessions', { qualificationId: '賃管', sources: [] });
  assert.equal(session.status, 201);
  const wrong = await call('POST', '/v1/study/start', {
    qualificationName: '賃管', learnerId: 'zzzzzzzzzz', sessionId: session.body.sessionId,
  });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.error, 'STUDY_SESSION_MISMATCH');
});
