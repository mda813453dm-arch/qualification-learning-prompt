// MCP の入口：Claude・Perplexity・Gemini のカスタムコネクタから、同じ学習の流れを動かせるか
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import { appKey, handle, onboardingSteps, overviewFor } from '../src/app.js';
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
  assert.equal(TOOLS.filter((t) => !t.appOnly).length, 9);
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
  const { sessionId, job, learnerId } = s.structuredContent;
  assert.equal(job.state, 'done');
  assert.match(learnerId, /^[A-Za-z0-9]+$/);
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
  assert.equal((await call(env, 'getJob', { qualificationId: `${SRC.qualificationId}~${learnerId}` })).structuredContent.job.state, 'done');
});

test('必須の引数が無い・知らないツール・知らないメソッドはエラーで返す', async () => {
  const env = makeEnv();
  const miss = await call(env, 'nextQuestion', {});
  assert.equal(miss.isError, true);
  assert.match(miss.content[0].text, /ARGUMENT_REQUIRED/);
  assert.equal((await rpc(env, 'tools/call', { name: 'nothing', arguments: {} })).body.error.code, -32602);
  assert.equal((await rpc(env, 'resources/list', {})).body.error.code, -32601);
});

test('ChatGPT アプリ（/app/<トークン>）：問題はエンジンの画面に出し、AIには図や表示文を渡さない', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  // 主のトークンをURLに入れても入れない（URLに入れるのはアプリ専用の合言葉だけ）
  assert.equal((await rpc(env, 'initialize', {}, { token: null, path: `/app/${TOKEN}` })).status, 401);
  assert.ok((await app('initialize', { protocolVersion: '2025-06-18', capabilities: {} })).capabilities.resources);
  const tools = (await app('tools/list', {})).tools;
  const nq = tools.find((t) => t.name === 'nextQuestion');
  assert.equal(nq._meta['openai/outputTemplate'], 'ui://qlp/question-v11.html');
  assert.equal(nq._meta.ui.resourceUri, 'ui://qlp/question-v11.html');
  assert.equal(tools.find((t) => t.name === 'startSession')._meta, undefined);
  const menu = await app('tools/call', { name: 'showMenu', arguments: { kind: 'plan' } });
  assert.equal(menu._meta.qlp.menu.choices[0], '始めます');
  assert.equal(menu.structuredContent.menu, undefined);
  assert.equal((await rpc(env, 'tools/call', { name: 'showMenu', arguments: { kind: 'plan' } })).body.error.code, -32602);
  const res = (await app('resources/list', {})).resources;
  assert.equal(res[0].mimeType, 'text/html;profile=mcp-app');
  const html = (await app('resources/read', { uri: res[0].uri })).contents[0];
  assert.match(html.text, /submitAnswer/);
  assert.deepEqual(html._meta.ui.csp.resourceDomains, ['https://engine.example']);
  assert.equal(html._meta.ui.domain, 'https://engine.example');
  assert.equal(html._meta['openai/widgetDomain'], 'https://engine.example');
  assert.ok(res.some((r) => r.uri === 'ui://qlp/question-v1.html'));
  const legacy = (await app('resources/read', { uri: 'ui://qlp/question-v1.html' })).contents[0];
  assert.equal(legacy.uri, 'ui://qlp/question-v1.html');
  assert.match(legacy.text, /submitAnswer/);
  assert.equal((await rpc(env, 'resources/read', { uri: 'ui://qlp/unknown.html' }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.error.code, -32602);
  // 通常の /mcp には画面を出さない（Claude などの接続はこれまでどおり）
  assert.equal((await rpc(env, 'tools/list', {})).body.result.tools.find((t) => t.name === 'nextQuestion')._meta, undefined);
  assert.equal((await rpc(env, 'resources/list', {})).body.error.code, -32601);

  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const call2 = (name, args) => app('tools/call', { name, arguments: args });
  const startedRes = await call2('startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  const started = startedRes.structuredContent ?? JSON.parse(startedRes.content[0].text);
  const { sessionId } = started;
  assert.match(started.howToProceed, /試験概要/);
  assert.match(started.howToProceed, /nextQuestion/);
  // 学習の開始（startStudy）の前は出題しない（学習計画の確認を飛ばさせない）
  const earlyRes = await call2('nextQuestion', { sessionId });
  const early = earlyRes.structuredContent;
  assert.equal(early.onboarding, undefined);
  assert.equal(earlyRes._meta.qlp.onboarding.at(-1).kind, 'status');
  assert.equal(early.status, 'needPlan');
  assert.equal(early.overview, undefined);
  assert.equal(early.question, undefined);
  await call2('startStudy', { qualificationName: '測量士補', learnerId: started.learnerId });
  const r = await call2('nextQuestion', { sessionId });
  const full = r._meta.qlp;
  assert.equal(full.sessionId, sessionId);
  assert.ok(Array.isArray(full.question.figureUrls));
  assert.ok(full.question.screen);
  const q = r.structuredContent.question;
  assert.equal(q.screen, undefined);
  assert.equal(q.display, undefined);
  assert.equal(q.figures, undefined);
  assert.equal(q.figureUrls, undefined);
  assert.match(q.howToShow, /書き直したり/);
  assert.ok(q.stem && q.choices);
  const a = await call2('submitAnswer', { sessionId, questionId: q.questionId, value: '3' });
  assert.equal(a._meta.qlp.grade.correct, true);
  if (a._meta.qlp.next.question) {
    assert.equal(a.structuredContent.next.question.screen, undefined);
    assert.ok(a._meta.qlp.next.question.screen);
  }
  // 通常の /mcp では figureUrls を付けない
  const s2 = (await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] })).structuredContent;
  assert.equal((await call(env, 'nextQuestion', { sessionId: s2.sessionId })).structuredContent.question.figureUrls, undefined);
});

test('アプリ：終了ログと引継ぎデータの全文はAIに渡さず、画面に出す', async () => {
  const { forModel } = await import('../src/mcp.js');
  const v = forModel({ minutes: 5, totalMinutes: 9, log: 'LOG', handoff: '引継ぎID：a3txuxxwvj\n中身', display: 'D' });
  assert.equal(v.handoffId, 'a3txuxxwvj');
  assert.equal(v.handoff, undefined);
  assert.equal(v.log, undefined);
  assert.equal(v.display, undefined);
});

test('利用コード：設定を入れるまでは制限なし。入れると、コード無しは断り、コードで入れ、1日の回数で止まる', async () => {
  const env = makeEnv();
  const adminCall = async (b) => (await handle(new Request('https://engine.example/v1/admin/access', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(b) }), env)).json();
  const app = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  // 管理の操作は主のトークンが要る
  assert.equal((await handle(new Request('https://engine.example/v1/admin/access', { method: 'POST', body: '{}' }), env)).status, 401);
  // 制限なし（既定）
  assert.ok(!(await app('startSession', { qualificationId: SRC.qualificationId, sources: [source] })).isError);

  assert.equal((await adminCall({ action: 'config', required: true })).config.required, true);
  assert.equal((await adminCall({ action: 'add', code: 'note-abc123', label: '1人目', dailyLimit: 1 })).ok, true);
  // コード無し・違うコードは断る
  const no = await app('startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  assert.equal(no.isError, true);
  assert.equal(no.structuredContent.error, 'ACCESS_CODE_REQUIRED');
  assert.equal((await app('startSession', { qualificationId: SRC.qualificationId, sources: [source], accessCode: 'wrong-code' })).structuredContent.error, 'ACCESS_CODE_REQUIRED');
  // /mcp（Claude など）は制限しない
  assert.equal((await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] })).isError, false);

  const ok = (await app('startSession', { qualificationId: SRC.qualificationId, sources: [source], accessCode: 'note-abc123' })).structuredContent;
  assert.ok(ok.sessionId);
  await app('startStudy', { qualificationName: '測量士補', learnerId: ok.learnerId });
  // 同じ学習者は、コードを入れ直さなくてよい
  assert.ok((await app('startSession', { qualificationId: SRC.qualificationId, sources: [source], learnerId: ok.learnerId })).structuredContent.sessionId);
  const q = (await app('nextQuestion', { sessionId: ok.sessionId })).structuredContent.question;
  assert.ok(!(await app('submitAnswer', { sessionId: ok.sessionId, questionId: q.questionId, value: '1' })).isError);
  // 1日1回まで：2問目は止まる。同じ問の再送は数えない
  const q2 = (await app('nextQuestion', { sessionId: ok.sessionId })).structuredContent.question;
  const lim = await app('submitAnswer', { sessionId: ok.sessionId, questionId: q2.questionId, value: '1' });
  assert.equal(lim.structuredContent.error, 'DAILY_LIMIT');
  // 回数を増やせば、続けられる。一覧にコードそのものは出ない
  await adminCall({ action: 'limit', code: 'note-abc123', dailyLimit: 5 });
  assert.ok(!(await app('submitAnswer', { sessionId: ok.sessionId, questionId: q2.questionId, value: '1' })).isError);
  const list = await adminCall({ action: 'list' });
  assert.equal(list.codes[0].usedToday, 2);
  assert.ok(!JSON.stringify(list).includes('note-abc123'));
  // 無効にすると、使っていた人も止まる
  await adminCall({ action: 'disable', code: 'note-abc123' });
  assert.equal((await app('nextQuestion', { sessionId: ok.sessionId })).structuredContent.error, 'ACCESS_CODE_REQUIRED');
});

test('showMenu：免除の確認と学習状況も、エンジンの固定の選択肢で出す', async () => {
  const env = makeEnv();
  const app = async (args) => (await rpc(env, 'tools/call', { name: 'showMenu', arguments: args }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  assert.deepEqual((await app({ kind: 'exempt' }))._meta.qlp.menu.choices, ['免除を利用する', '免除を利用しない']);
  assert.equal((await app({ kind: 'status' }))._meta.qlp.menu.choices.length, 4);
});

test('showMenu：免除のあとは学習状況、学習状況のあとは学習計画へ進むよう、AIに次の1手を伝える', async () => {
  const env = makeEnv();
  const app = async (args) => (await rpc(env, 'tools/call', { name: 'showMenu', arguments: args }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  assert.match((await app({ kind: 'exempt' })).structuredContent.howToProceed, /kind=status/);
  assert.match((await app({ kind: 'status' })).structuredContent.howToProceed, /kind=plan/);
});

test('宅建は試験概要の直下に免除→学習状況のボタン、免除なしの資格は学習状況だけ', () => {
  assert.deepEqual(onboardingSteps('q041').map((x) => x.kind), ['exempt', 'status']);
  assert.ok(overviewFor('q041').lines.some((l) => /免除制度：登録講習/.test(l)));
  assert.deepEqual(onboardingSteps('q063').map((x) => x.kind), ['status']);
  assert.ok(!overviewFor('q063').lines.some((l) => /免除制度/.test(l)));
});

test('アプリ：宅建を始めると nextQuestion の画面データに試験概要と免除ボタンが入る', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const s = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  const sid = (s.structuredContent ?? JSON.parse(s.content[0].text)).sessionId;
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: sid } });
  assert.equal(n._meta.qlp.status, 'needPlan');
  assert.deepEqual(n._meta.qlp.onboarding.map((x) => x.kind), ['exempt', 'status']);
  assert.match(n._meta.qlp.overview.title, /宅建/);
});

test('全資格：概要は公式ページの記載（台帳）を出し、出典と未掲載の注記が付く', () => {
  for (const c of Object.values(CATALOG)) {
    assert.ok(c.overview?.length >= 4, c.name);
    assert.ok(c.overview.every(([k, v]) => k && v), c.name);
    const ov = overviewFor(c.qualificationId);
    assert.ok(ov.lines.some((l) => /公式ページに書かれていない/.test(l)), c.name);
    assert.match(ov.source, /^https:\/\//);
  }
  assert.ok(overviewFor('q041').lines.some((l) => /試験時間：午後1時〜午後3時/.test(l)));
});
