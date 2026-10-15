// MCP の入口：Claude・Perplexity・Gemini のカスタムコネクタから、同じ学習の流れを動かせるか
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { INSTRUCTIONS } from '../src/instructions.js';
import { TOOLS } from '../src/mcp.js';
import { SRC, T0, assetsB64, fakeParser, fakeWeb, pdf } from './helpers.js';

const TOKEN = 'mcp-token';

function makeEnv() {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web);
  const env = { STORE: new MemoryStore(), API_TOKEN: TOKEN, fetchPdf: web.fetchPdf, clock: () => T0, PARSER_URL: 'https://parser.example' };
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  return env;
}

let nextId = 1;
async function rpc(env, method, params, { path = '/mcp', token = TOKEN } = {}) {
  const res = await handle(new Request(`https://engine.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  }), env);
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}
const call = async (env, name, args) => (await rpc(env, 'tools/call', { name, arguments: args })).body.result;

test('initialize で接続版プロンプトを instructions として渡す（deploy/gpt-instructions.txt と同じ内容）', async () => {
  const env = makeEnv();
  const r = await rpc(env, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(r.body.result.protocolVersion, '2025-06-18');
  assert.ok(r.body.result.capabilities.tools);
  assert.equal(r.body.result.instructions, INSTRUCTIONS);
  const gpt = new URL('../../deploy/gpt-instructions.txt', import.meta.url);
  if (existsSync(gpt)) assert.equal(INSTRUCTIONS, readFileSync(gpt, 'utf8'));
  // 通知には本文なしで 202
  const n = await handle(new Request('https://engine.example/mcp', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), env);
  assert.equal(n.status, 202);
});

test('ツールの名前は GPT 用 API 定義の operationId と同じ（同じプロンプトで動く）', async () => {
  const env = makeEnv();
  const r = await rpc(env, 'tools/list', {});
  const names = r.body.result.tools.map((t) => t.name);
  const yaml = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
  const ops = [...yaml.matchAll(/operationId: (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), ops.sort());
  for (const name of names) assert.ok(INSTRUCTIONS.includes(name), `プロンプトに ${name} が出てくる`);
  assert.equal(TOOLS.length, 6);
});

test('トークンはヘッダーか URL で受け取り、どちらも無ければ断る', async () => {
  const env = makeEnv();
  assert.equal((await rpc(env, 'ping', {}, { token: null })).status, 401);
  assert.equal((await rpc(env, 'ping', {}, { token: 'wrong' })).status, 401);
  assert.equal((await rpc(env, 'ping', {}, { token: null, path: '/mcp/wrong' })).status, 401);
  assert.deepEqual((await rpc(env, 'ping', {}, { token: null, path: `/mcp/${TOKEN}` })).body.result, {});
  const get = await handle(new Request('https://engine.example/mcp', { headers: { authorization: `Bearer ${TOKEN}` } }), env);
  assert.equal(get.status, 405);
});

test('ツールだけで、取り込み → 出題 → 採点 → 引継ぎ まで通る', async () => {
  const env = makeEnv();
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  assert.equal(s.isError, false);
  const { sessionId, job } = s.structuredContent;
  assert.equal(job.state, 'done');
  const q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  assert.equal(q.questionNumber, 1);
  assert.ok(!JSON.stringify(q).includes('correctAnswer'));
  const wrong = await call(env, 'submitAnswer', { sessionId, questionId: 'surveyor:2026:main:2', value: '1' });
  assert.equal(wrong.isError, true);
  assert.equal(wrong.structuredContent.error, 'QUESTION_BINDING_MISMATCH');
  const g = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: '3' })).structuredContent.grade;
  assert.equal(g.correct, true);
  const h = (await call(env, 'getHandoff', { sessionId })).structuredContent.handoff;
  const imp = (await call(env, 'importHandoff', { handoff: h })).structuredContent;
  assert.equal(imp.restored, 1);
  assert.equal((await call(env, 'getJob', { qualificationId: SRC.qualificationId })).structuredContent.job.state, 'done');
});

test('必須の引数が無い・知らないツール・知らないメソッドはエラーで返す', async () => {
  const env = makeEnv();
  const miss = await call(env, 'nextQuestion', {});
  assert.equal(miss.isError, true);
  assert.match(miss.content[0].text, /ARGUMENT_REQUIRED/);
  assert.equal((await rpc(env, 'tools/call', { name: 'nothing', arguments: {} })).body.error.code, -32602);
  assert.equal((await rpc(env, 'resources/list', {})).body.error.code, -32601);
});
