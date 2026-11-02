import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { SRC, T0 } from './helpers.js';

const MIN = 60 * 1000;
const token = 'idle-session-test-token';
const source = { adapter: SRC.adapter, year: SRC.year, section: SRC.section,
  questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
const chat = 'f'.repeat(64);

function setup() {
  const env = { STORE: new MemoryStore(), API_TOKEN: token, now: T0 };
  env.clock = () => env.now;
  const call = async (method, path, body) => {
    const res = await handle(new Request('https://engine.example' + path, {
      method, headers: { authorization: 'Bearer ' + token, 'content-type':'application/json',
        'x-qlp-host-chat':chat },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    return {status:res.status, body:await res.json()};
  };
  return {env,call};
}
const start = call => call('POST','/v1/sessions',{qualificationId:'測量士補',sources:[source]});

test('GET polling and restore do not prolong the 60-minute user idle window', async () => {
  const {env,call} = setup();
  const initial = await start(call);
  assert.equal(initial.status,201);
  const sid = initial.body.sessionId;
  env.now += 59 * MIN;
  const snapshot = await call('GET','/v1/sessions/' + sid + '/restore');
  assert.equal(snapshot.status,200);
  env.now += 2 * MIN;
  const expired = await call('POST','/v1/sessions/' + sid + '/next');
  assert.equal(expired.status,404);
  assert.equal(expired.body.error,'SESSION_NOT_FOUND');
  assert.ok(await env.STORE.get('lrnstate/' + initial.body.learnerId, 'json'));
});

test('explicit study actions renew idle deadline, but only for a one-hour window', async () => {
  const {env,call} = setup();
  const initial = await start(call);
  assert.equal(initial.status,201);
  const sid=initial.body.sessionId;
  env.now += 55 * MIN;
  const userAction=await call('POST','/v1/sessions/' + sid + '/next');
  assert.equal(userAction.status,200);
  env.now += 55 * MIN;
  assert.equal((await call('GET','/v1/sessions/' + sid + '/restore')).status,200);
  env.now += 5 * MIN;
  assert.equal((await call('GET','/v1/sessions/' + sid + '/restore')).status,404);
});

test('starting in the same chat always creates a new session and revokes the previous frame', async () => {
  const {call}=setup();
  const first=await start(call);
  const second=await start(call);
  assert.equal(first.status,201);
  assert.equal(second.status,201);
  assert.notEqual(first.body.sessionId,second.body.sessionId);
  assert.notEqual(first.body.learnerId,second.body.learnerId);
  assert.equal((await call('GET','/v1/sessions/' + first.body.sessionId + '/restore')).status,404);
  const current=await call('GET','/v1/chat-study/restore');
  assert.equal(current.status,200);
  assert.equal(current.body.sessionId,second.body.sessionId);
});
