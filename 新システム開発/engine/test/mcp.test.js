// MCP の入口：Claude・Perplexity・Gemini のカスタムコネクタから、同じ学習の流れを動かせるか
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import { appKey, handle, onboardingSteps, overviewFor } from '../src/app.js';
import { INSTRUCTIONS } from '../src/instructions.js';
import { TOOLS } from '../src/mcp.js';
import { WIDGET_URI } from '../src/widget.js';
import { SRC, T0, assetsB64, fakeParser, fakeWeb, pdf } from './helpers.js';

const TOKEN = 'mcp-token';

function makeEnv(parserOptions = {}) {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, parserOptions);
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

test('従来の解説方針呼出しもAIが読めるcontentで返し、UI専用メタデータに隠さない', async () => {
  const r = await rpc(makeEnv(), 'tools/call', { name: 'explainSpec', arguments: { correct: false, selected: '1', correctAnswer: '3', fieldName: '測量に関する法規' } }, { path: '/app' });
  const value = r.body.result;
  assert.match(JSON.parse(value.content[0].text).explainHow, /マークダウンの表/);
  assert.match(value.structuredContent.order, /showMenu/);
  assert.equal(value._meta, undefined);
});

test('画面の非表示文脈がなくても、既知のsessionIdだけで解説対象を取得して解説画面へ渡せる', async () => {
  const env = makeEnv();
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  const { sessionId } = s.structuredContent;
  const q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: '3' });
  // AI役に与える入力は「2026年度 問1の解説を見る」と最初に返ったsessionIdのみ。
  // 画面内のtools/call結果・ui/update-model-contextはAI役に渡さない。
  const spec = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: { sessionId } }, { path: '/app' })).body.result;
  assert.equal(spec.isError, false);
  const context = spec.structuredContent;
  assert.equal(context.question.questionId, q.questionId);
  assert.equal(context.question.stem, q.stem);
  assert.deepEqual(context.question.choices, q.choices);
  assert.equal(context.grade.correctAnswer, 3);
  assert.equal(context.status, 'explanationContext');
  assert.ok(JSON.parse(spec.content[0].text).question.stem, 'AIに読めるcontentにも本文がある');
  assert.equal(spec._meta, undefined, '解説資料をUI専用の非表示領域に閉じ込めない');
  const body = `AIによる解説（結合試験用）\n\n対象は${context.question.year}年度 問${context.question.questionNumber}。\n正答は${context.grade.correctAnswer}です。\n\n|選択肢|確認|\n|---|---|\n|3|正答|`;
  const menu = (await rpc(env, 'tools/call', { name: 'showMenu', arguments: { kind: 'next', body, sessionId: context.sessionId, learnerId: context.learnerId } }, { path: '/app' })).body.result;
  assert.equal(menu._meta.qlp.menu.body, body);
  assert.equal(menu._meta.qlp.menu.sessionId, sessionId);
  const stale = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: { sessionId, questionId: 'surveyor:2026:main:2' } }, { path: '/app' })).body.result;
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.error, 'EXPLANATION_BINDING_MISMATCH');
});

test('同じ分野の3問は3択、次の分野へ移るときだけ4択。空の総復習は進行しない', async () => {
  const env = makeEnv({ answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's1', 's2'], figureOn: [] });
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const { sessionId } = s.structuredContent;
  let q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  assert.deepEqual([q.progress.position, q.progress.done, q.progress.total, q.progress.fieldQuestion], [1, 0, 24, 1]);
  for (let i = 0; i < 3; i += 1) {
    const grade = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: String([3, 1, 4][i]) })).structuredContent;
    assert.equal(grade.grade.correct, true);
    const menu = (await rpc(env, 'tools/call', { name: 'showMenu', arguments: { kind: 'next', body: '解説本文', sessionId } }, { path: '/app' })).body.result._meta.qlp.menu;
    assert.deepEqual(menu.actions, i < 2 ? ['next', 'explain', 'end'] : ['next', 'explain', 'continueField', 'review', 'end']);
    assert.deepEqual(menu.choices, i < 2 ? ['次の問題へ', '解説を見る', '今日はここまで（学習を終了）'] :
      ['次の分野の問題へ', '解説を見る', 'この分野の実践問題を続ける', '総復習（間違えた問題）', '今日はここまで（学習を終了）']);
    assert.equal(menu.journey.fieldIndex, 1);
    if (i < 2) {
      q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
      assert.equal(q.progress.position, i + 2);
      assert.equal(q.progress.fieldQuestion, i + 2);
    }
  }
  const before = await env.STORE.get(`ses/${sessionId}`);
  const empty = (await call(env, 'nextQuestion', { sessionId, question: '総復習（間違えた問題）' })).structuredContent;
  assert.equal(empty.status, 'reviewEmpty');
  assert.match(empty.notice, /間違えた問題はまだありません/);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), before);
  const exhausted = (await call(env, 'nextQuestion', { sessionId, question: 'この分野の未出題の実践問題を続ける' })).structuredContent;
  assert.equal(exhausted.status, 'fieldExhausted');
  assert.equal(await env.STORE.get(`ses/${sessionId}`), before, '未出題が無いときは次の分野を進めない');
  const next = (await call(env, 'nextQuestion', { sessionId })).structuredContent;
  assert.equal(next.question.questionNumber, 4);
  assert.deepEqual([next.question.progress.position, next.question.progress.done, next.question.progress.fieldIndex], [4, 3, 2]);
});

test('画面復帰：未回答・採点後・スキップ後・AI確認問題を保存済みの位置に読取専用で復元', async () => {
  const env = makeEnv({ answers: [3, 1, 4], fieldIds: ['s1', 's1', 's1'], figureOn: [1] });
  const { sessionId } = (await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] })).structuredContent;
  const restore = async () => (await rpc(env, 'tools/call',
    { name: 'restoreStudyView', arguments: { sessionId } }, { path: '/app' })).body.result;
  const q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  const original = await env.STORE.get(`ses/${sessionId}`);
  const pending = await restore();
  assert.equal(pending.structuredContent.status, 'question');
  assert.equal(pending.structuredContent.question.questionId, q.questionId);
  assert.equal(pending._meta.qlp.question.figureUrls.length, q.figures.length, '図は画面専用の完全なデータに保持する');
  assert.equal(pending.structuredContent.question.figureCount, q.figures.length, 'モデルへ図URLを配布しない');
  assert.equal(await env.STORE.get(`ses/${sessionId}`), original, '表示復元でセッションを変更しない');
  assert.equal(pending.structuredContent.question.stem, q.stem, 'アプリ専用ツールは内部表示と別経路でも動く');

  const answered = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: '3' })).structuredContent;
  assert.equal(answered.grade.correct, true);
  const gradedSaved = await env.STORE.get(`ses/${sessionId}`);
  const graded = await restore();
  assert.equal(graded.structuredContent.status, 'restoredGrade');
  assert.equal(graded.structuredContent.question.questionId, q.questionId);
  assert.equal(graded.structuredContent.grade.correctAnswer, 3);
  assert.equal(graded.structuredContent.next.question.questionId, answered.next.question.questionId);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), gradedSaved, '採点結果復元で次問を進めない');

  const next = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  assert.equal(next.questionId, answered.next.question.questionId);
  const nextSaved = await env.STORE.get(`ses/${sessionId}`);
  const current = await restore();
  assert.equal(current.structuredContent.status, 'question');
  assert.equal(current.structuredContent.question.questionId, next.questionId);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), nextSaved);

  const skip = (await call(env, 'submitAnswer', { sessionId, questionId: next.questionId, value: 'スキップ' })).structuredContent;
  assert.equal(skip.grade.skipped, true);
  const skippedSaved = await env.STORE.get(`ses/${sessionId}`);
  const afterSkip = await restore();
  assert.equal(afterSkip.structuredContent.status, 'question', 'スキップ後に採点結果メニューを挟まない');
  assert.notEqual(afterSkip.structuredContent.question.questionId, next.questionId);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), skippedSaved);

  const env2 = makeEnv();
  const s2 = (await call(env2, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] })).structuredContent;
  const fieldName = CATALOG[SRC.qualificationId].fields.s1;
  await rpc(env2, 'tools/call', { name: 'chooseItem', arguments: { sessionId: s2.sessionId, fieldName, mode: 'check' } }, { path: '/app' });
  const ai = (await rpc(env2, 'tools/call', { name: 'registerConfirmationQuestion',
    arguments: { sessionId: s2.sessionId, question: '確認問題として出題する十分な長さの本文です。', choices: ['A','B','C'], correctAnswer: 2 } },
  { path: '/app' })).body.result._meta.qlp;
  const aiSaved = await env2.STORE.get(`ses/${s2.sessionId}`);
  const restoredAi = (await rpc(env2, 'tools/call', { name: 'restoreStudyView',
    arguments: { sessionId: s2.sessionId } }, { path: '/app' })).body.result._meta.qlp;
  assert.equal(restoredAi.status, 'confirmation_question');
  assert.equal(restoredAi.challengeId, ai.challengeId, '同じ正答固定済みの問題へ復帰する');
  assert.equal(restoredAi.correctAnswer, undefined, '復元で正答を先に公開しない');
  assert.equal(await env2.STORE.get(`ses/${s2.sessionId}`), aiSaved);
});

test('通常の確認問題は1問目から全3問と全分野の位置を固定し、3問終了後に同じ分野の実践問題へ進む', async () => {
  const env = makeEnv({ answers: [3, 1, 4], fieldIds: ['s1', 's1', 's1'], figureOn: [] });
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const sessionId = s.structuredContent.sessionId;
  const app = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { path: '/app' })).body.result;
  const fieldName = CATALOG[SRC.qualificationId].fields.s1;
  const choice = (await app('chooseItem', { sessionId, fieldName, mode: 'explain' })).structuredContent;
  assert.deepEqual(choice.journey, { fieldIndex: 1, fieldTotal: Object.keys(CATALOG[SRC.qualificationId].fields).length });
  for (let i = 1; i <= 3; i++) {
    const args = { sessionId, question: `確認問題の第${i}問の本文です。`, choices: ['A', 'B', 'C'], correctAnswer: 2 };
    const q = (await app('registerConfirmationQuestion', args))._meta.qlp;
    assert.equal(q.position, i);
    assert.equal(q.total, 3);
    assert.deepEqual(q.journey, choice.journey);
    assert.equal(q.correctAnswer, undefined, '画面とモデルには正答を先渡ししない');
    const repeated = (await app('registerConfirmationQuestion', { ...args, question: '別の問題を上書きしようとする' }))._meta.qlp;
    assert.equal(repeated.challengeId, q.challengeId);
    const answer = (await app('answerConfirmationQuestion', { sessionId, challengeId: q.challengeId, selected: i === 2 ? '1' : '2' })).structuredContent;
    assert.equal(answer.position, i);
    assert.equal(answer.complete, i === 3);
    assert.equal(answer.correctCount, i === 3 ? 2 : 1);
    if (i === 3) assert.equal(answer.nextFieldName, CATALOG[SRC.qualificationId].fields.s2);
  }
  const after = await app('registerConfirmationQuestion', { sessionId, question: '4問目を登録しないための文章です。', choices: ['A', 'B'], correctAnswer: 1 });
  assert.equal(after.structuredContent.error, 'CONFIRMATION_NOT_ACTIVE');
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.match(html, /同じ分野の実践問題へ/);
  assert.match(html, /localBar\('この分野の確認問題', d.position, 3\)/);
  assert.match(html, /journeyBar\(j.fieldIndex, j.fieldTotal, 'check' \+ d.position/);
  const practice = (await app('chooseItem', { sessionId, fieldName, mode: 'practice' })).structuredContent;
  assert.equal(practice.mode, 'practice');
  const official = (await call(env, 'nextQuestion', { sessionId })).structuredContent;
  assert.equal(official.question.fieldName, fieldName);
});

test('3問後に同じ分野の未出題の実践問題を続けると、先取りした次分野を飛ばさず元の分野の4問目を出す', async () => {
  const env = makeEnv({ answers: [3, 1, 4, 2, 3], fieldIds: ['s1', 's1', 's1', 's1', 's2'], figureOn: [] });
  const { sessionId } = (await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] })).structuredContent;
  let q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  for (const answer of ['3', '1', '4']) {
    const graded = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: answer })).structuredContent;
    if (answer !== '4') q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
    else assert.equal(graded.next.question.fieldName !== q.fieldName, true);
  }
  const continued = (await call(env, 'nextQuestion', { sessionId, question: 'この分野の未出題の実践問題を続ける' })).structuredContent;
  assert.equal(continued.status, 'question');
  assert.equal(continued.question.questionNumber, 4);
  assert.equal(continued.question.fieldName, q.fieldName);
  assert.equal(continued.fieldChanged, false);
  assert.equal(continued.question.progress.fieldQuestion, 1, '同じ分野で新しい3問セットを始める');
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
  assert.equal(nq._meta['openai/outputTemplate'], WIDGET_URI);
  assert.equal(nq._meta.ui.resourceUri, WIDGET_URI);
  // 資格名を受けたら、startSession の結果としてすぐ試験概要と免除・学習状況のボタンを画面に出す（AIの次の呼び出しに頼らない）
  assert.equal(tools.find((t) => t.name === 'startSession')._meta['openai/outputTemplate'], WIDGET_URI);
  const opened = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  assert.ok(Array.isArray(opened._meta.qlp.onboarding));
  assert.ok(opened._meta.qlp.overview);
  assert.equal(opened.structuredContent.onboarding, undefined);
  assert.ok(opened.structuredContent.sessionId);
  const menu = await app('tools/call', { name: 'showMenu', arguments: { kind: 'plan' } });
  assert.equal(menu._meta.qlp.menu.choices[0], '承認して始める');
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
  assert.match(started.howToProceed, /画面のボタン/);
  assert.match(started.howToProceed, /nextQuestion も呼ばない/);
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

test('アプリ：前回の学習の記録があっても、新しいセッションは学習の開始（startStudy）をするまで出題しない', async () => {
  let t = T0;
  const env = makeEnv();
  env.clock = () => t;
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const first = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } }));
  const learnerId = first.learnerId;
  await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '宅建', learnerId } });
  t += 60_000;
  // 同じ引継ぎIDで、新しいチャット（新しいセッション）を始める。学習の開始はまだ
  const again = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [], learnerId } }));
  const n1 = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: again.sessionId } });
  assert.equal(n1._meta.qlp.status, 'needPlan');
  assert.equal(n1._meta.qlp.question, undefined);
  t += 60_000;
  await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '宅建', learnerId } });
  const n2 = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: again.sessionId } });
  assert.notEqual(n2._meta.qlp.status, 'needPlan');
});

test('アプリ：初期診断は、分野と問数を先に示し、過去問をエンジンだけで出して採点し、結果で計画を並べ直す（AIに頼らない）', async () => {
  const env = makeEnv();
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, { answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's2', 's1'], figureOn: [2] });
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: SRC.qualificationId, sources: [source] } }));
  const listed = (await app('tools/list', {})).tools;
  assert.equal(listed.find((t) => t.name === 'diagQuestion'), undefined);
  assert.equal(listed.find((t) => t.name === 'diagStep')._meta['openai/visibility'], 'private');
  const start = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'start' } }));
  assert.equal(start.diag.total, 3);
  assert.deepEqual(start.diag.fields.map((f) => f.count), [2, 1]);
  assert.equal(start.question.label, '初期診断 1/3');
  assert.ok(!JSON.stringify(start).includes('correctAnswer'));
  let q = start.question;
  const seen = [];
  let last;
  for (let i = 0; i < 3; i++) {
    seen.push(q.questionNumber);
    // 測量の分野（s1）は間違え、s2 だけ正解する
    const right = { 1: '3', 2: '1', 3: '4', 4: '2' }[q.questionNumber];
    last = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'answer', questionId: q.questionId, value: q.fieldName === start.diag.fields[1].name ? right : '5' } }));
    if (i === 0) {
      const duplicate = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'answer', questionId: q.questionId, value: '1' } }));
      assert.equal(duplicate.grade.alreadyGraded, true, '同じ問の再送は採点し直さない');
      assert.equal(duplicate.question.questionId, last.question.questionId, '再送で次問へ進まない');
    }
    q = last.question;
  }
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(last.status, 'diagResult');
  assert.equal(last.order[0], start.diag.fields[0].name);
  assert.equal(last.diagResult[0].answered, 2);
  assert.equal(last.diagResult[0].correct, 0);
  const applied = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'apply' } }));
  assert.equal(applied.planReady, true);
  assert.equal(applied.plan.fields[0], start.diag.fields[0].name);
  // 診断のあとも、学習の開始（startStudy）までは実践問題を出さない
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: s.sessionId } });
  assert.equal(n._meta.qlp.status, 'needPlan');
});

test('アプリ：項目開始で選んだ分野から、過去問を出す', async () => {
  const env = makeEnv();
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, { answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's2', 's1'], figureOn: [] });
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: SRC.qualificationId, sources: [source] } }));
  await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '測量士補', learnerId: s.learnerId } });
  const s2 = CATALOG.surveyor.fields.s2;
  const bad = await app('tools/call', { name: 'chooseItem', arguments: { sessionId: s.learnerId, fieldName: 'ない分野', mode: 'practice' } });
  assert.equal(bad.isError, true);
  const ok = content(await app('tools/call', { name: 'chooseItem', arguments: { sessionId: s.learnerId, fieldName: s2, mode: 'practice' } }));
  assert.equal(ok.mode, 'practice');
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: s.learnerId } });
  assert.equal(n._meta.qlp.question.questionNumber, 3);
});

test('アプリ：免除が適用確定なら免除される問を出さず、学習段階は残す（U02・U03）', async () => {
  const env = makeEnv();
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, { src: { ...SRC, qualificationId: 'takken' }, answers: Array(47).fill(1), fieldIds: Array(47).fill('t7'), figureOn: [] });
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const source = { adapter: 'takken', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: 'takken', sources: [source] } }));
  const steps = onboardingSteps(CATALOG.takken.qualificationId);
  assert.equal(steps[0].prompt, '今回の試験での免除適用状況');
  assert.equal(steps[0].choices.length, 3);
  assert.equal(steps[1].prompt, '今の学習の段階');
  const saved = content(await app('tools/call', { name: 'saveProfile', arguments: { sessionId: s.learnerId, exemption: 'confirmed', stage: 3 } }));
  assert.equal(saved.exemption, 'confirmed');
  const st = content(await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '宅建', learnerId: s.learnerId } }));
  assert.equal(st.learnerStage ?? 3, 3);
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: s.learnerId, question: '2026年度 問46' } });
  assert.notEqual(n._meta.qlp.question.questionNumber, 46);
  assert.notEqual(n._meta.qlp.question.questionNumber, 47);
});

test('アプリ：過去問がまだ無いときの初期診断は、取り込み待ちのエラーで返す', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const s = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  const lid = (s.structuredContent ?? JSON.parse(s.content[0].text)).learnerId;
  const r = await app('tools/call', { name: 'diagStep', arguments: { sessionId: lid, action: 'start' } });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.error, 'DIAG_NO_PAST_EXAMS');
});

test('アプリ：宅建を始めると nextQuestion の画面データに試験概要と免除ボタンが入る', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const s = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  const sid = (s.structuredContent ?? JSON.parse(s.content[0].text)).sessionId;
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: sid } });
  assert.equal(n._meta.qlp.status, 'needPlan');
  assert.deepEqual(n._meta.qlp.onboarding.map((x) => x.kind), ['exempt', 'status']);
  assert.equal(n._meta.qlp.overview.title, '■試験概要');
  assert.ok(n._meta.qlp.overview.lines.some((l) => /宅建/.test(l)));
});

test('全資格：概要は公式ページの記載（台帳）を出し、出典と未掲載の注記が付く', () => {
  for (const c of Object.values(CATALOG)) {
    assert.ok(c.overview?.length >= 4, c.name);
    assert.ok(c.overview.every(([k, v]) => k && v), c.name);
    const ov = overviewFor(c.qualificationId);
    assert.equal(ov.title, '■試験概要', c.name);
    assert.ok(ov.lines.some((l) => /^公式：/.test(l)) && ov.lines.includes('参考（非公式）：なし'), c.name);
    assert.ok(ov.lines.some((l) => /^合格基準/.test(l)), c.name);
    assert.match(ov.source, /^https:\/\//);
  }
  assert.ok(overviewFor('q041').lines.some((l) => /試験時間：午後1時〜午後3時/.test(l)));
});

test('アプリ：利用者が添付した過去問PDFを受け取り、保管して取り込みに足す（PDFでないものは断る）', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const listed = (await app('tools/list', {})).tools.find((t) => t.name === 'attachPdf');
  assert.deepEqual(listed._meta['openai/fileParams'], ['questionPdf', 'answerPdf']);
  const s = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  const sid = (s.structuredContent ?? JSON.parse(s.content[0].text)).sessionId;
  const bytes = new TextEncoder().encode('%PDF-1.7 attached question 2019');
  env.fetchAttached = async (u) => {
    if (u === 'https://files.example/q.pdf') return bytes;
    if (u === 'https://files.example/a.png') return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    throw new Error('HTTP 404');
  };
  const bad = await app('tools/call', { name: 'attachPdf', arguments: { sessionId: sid, year: 2019, questionPdf: { download_url: 'https://files.example/a.png', file_id: 'f2' } } });
  assert.equal(bad.isError, true);
  assert.equal(bad.structuredContent.error, 'ATTACH_NOT_PDF');
  const r = await app('tools/call', { name: 'attachPdf', arguments: { sessionId: sid, year: 2019, questionPdf: { download_url: 'https://files.example/q.pdf', file_id: 'f1' } } });
  assert.equal(r.isError, false);
  assert.equal(r.structuredContent.status, 'attached');
  assert.match(r.structuredContent.notice, /2019年度/);
  const added = r.structuredContent.job.sources.find((x) => x.year === 2019);
  assert.match(added.questionUrl, /\/v1\/attached\/[a-f0-9]{64}\.pdf$/);
  assert.equal(added.adapter, 'takken');
  const got = await handle(new Request(added.questionUrl), env);
  assert.equal(got.status, 200);
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), bytes);
  // 年度が無いときは受け取らない
  const noYear = await app('tools/call', { name: 'attachPdf', arguments: { sessionId: sid, year: 0, questionPdf: { download_url: 'https://files.example/q.pdf' } } });
  assert.equal(noYear.structuredContent.error, 'ATTACH_YEAR_REQUIRED');
});

test('画面からチャットに送る文は短い普通の言葉だけ。AIへの手順はアプリのツールの説明にある', () => {
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  const mcp = readFileSync(new URL('../src/mcp.js', import.meta.url), 'utf8');
  // 利用者のチャットに「AIへの指示」が見えないこと
  assert.ok(!html.includes('【順番】'), '画面の送信文に手順を入れない');
  assert.ok(html.includes('var visible = actionLabel || text;'), '会話には操作名だけを渡す');
  assert.ok(!html.includes('ui/update-model-context') && !html.includes('setWidgetState'), '入力欄にモデル文脈を添付しない');
  assert.ok(html.includes("field + 'を解説から始めます。'"));
  assert.ok(html.includes('function planEditMenu()'));
  assert.ok(html.includes("callTool('saveStudyPlan'"), '計画確定は学習開始の承認後だけ');
  // 続きのボタンは解説・確認問題の「下」に出す（画面の上に押すボタンを置かない）
  assert.ok(!html.includes('id="toPractice"'));
  // 根拠のない「おすすめ」は付けない／長いURLは枠からはみ出さず折り返す
  assert.ok(!html.includes('苦手分野を調べる（おすすめ）'));
  assert.ok(html.includes('overflow-wrap:anywhere'));
  // 短い文に対するAIの手順は、アプリのツールの説明にある
  assert.ok(mcp.includes('「○○を解説から始めます。」と送ってきたら'));
  assert.ok(mcp.includes('「学習計画の希望：…」と送ってきたら'));
  // 最初の公式過去問は画面から直接取得し、取得失敗時も同じ要求で復旧する。
  assert.ok(html.includes('function nextBelow(fallback, say)'));
  assert.ok(html.includes('await fallback();'));
  assert.ok(html.includes('id="nextHere" disabled'));
  assert.ok(!html.includes('出ないときは、ここで次の問題へ'));
  const nextBody = html.slice(html.indexOf('function nextBelow('), html.indexOf('function scrollUp('));
  assert.ok(!nextBody.includes('ask('), '初回出題をChatGPTの再呼び出しに任せない');
  assert.ok(!nextBody.includes("callTool('redisplayQuestion'"), '未出題の問に再表示APIを呼ばない');
  assert.ok(mcp.includes('「○○を実践問題から始めます。」「次の問題へ」と送ってきたら'));
});

test('解説の本文は showMenu の body に入れ、画面のボタンの上（同じ枠）に出る', async () => {
  const mcp = readFileSync(new URL('../src/mcp.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  const show = TOOLS.find((t) => t.name === 'showMenu');
  assert.ok(show.inputSchema.properties.body, 'body を受け付ける');
  const r = show.local({ kind: 'next', body: '## 解説\n- 要点' });
  assert.equal(r.menu.body, '## 解説\n- 要点');
  assert.equal(show.local({ kind: 'next' }).menu.body, undefined);
  assert.equal(show.local({ kind: 'next', body: 'あ'.repeat(9000) }).menu.body.length, 8000);
  assert.ok(mcp.includes('の body に入れて呼ぶ'));
  assert.ok(!mcp.includes('まず答え合わせと解説を書き、最後に showMenu'));
  assert.ok(html.includes('function md(src)') && html.includes("var body = m.body ? '<div class=\"md\">'"));
  // 待ち画面（解説は下に出ます）に「終了」ボタンを置かない
  assert.ok(!html.includes("は、この下に出ます。少し待つと文章が出てきます。終わると、その下に進むためのボタンが出ます（出ないときは「次の問題へ」と送ってください）。</div>' + endBar()"));
});

test('問題文は文ごとに段落へ分けて表示する', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('function stemHtml'));
  assert.ok(h.includes('stemHtml(q.stem)'));
});

test('解説の本文のURLは、押して開けるリンクにする', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('target=\\"_blank\\"') || h.includes('target=\\\\"_blank\\\\"') || h.includes('_blank'));
  assert.ok(h.includes('.md a{'));
});

test('解説の依頼に問題文を載せない／新しい画面が出たら古い画面のボタンを押せなくする', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(!h.includes('qtext'));
  assert.ok(h.includes('function lockOld') && h.includes("BroadcastChannel('qlp-widget')") && h.includes('stamp(data);'));
});

test('「今日はここまで」は問題の画面に出さず、解説・次へのメニューと一緒に出す', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('id="endMenu"'));
  assert.ok(!/h \+= endBar\(\);\s*app\.innerHTML = h;\s*scrollUp\(\);/.test(h));
});

test('メニューの「今日はここまで」は、画面から直接 endStudy を呼んで終了する', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('function saveIds') && h.includes('function loadIds'));
  assert.ok(h.includes("callTool('endStudy', { studyId: lid, sessionId: ids.sid || lid"));
});

test('再表示は読み取り専用で、内部指示を利用者の発言として送らず、終了時には引継ぎ本文を描画する', () => {
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const again = TOOLS.find((t) => t.name === 'redisplayQuestion');
  assert.ok(again && again.appOnly && again.uiOnly);
  assert.deepEqual(again.api({ sessionId: 'abc' }), ['GET', '/v1/sessions/abc/redisplay']);
  assert.ok(app.includes('async function redisplayView('));
  const fn = app.split('async function redisplayView(')[1].split('/** 図をもう一度')[0];
  assert.ok(!fn.includes('saveSession(') && !fn.includes('nextView(') && !fn.includes('pin('));
  assert.ok(!html.includes("rpc('ui/update-model-context'"));
  assert.ok(!html.includes('window.openai.sendFollowUpMessage({ prompt: text })'), '内部依頼文を利用者のチャットへ送らない');
  assert.ok(!html.includes("rpc('ui/message', { role: 'user', content: [{ type: 'text', text: text }] })"));
  assert.ok(html.includes('showEnd(r);'));
  assert.ok(html.includes("typeof r.handoff === 'string'"));
  assert.ok(!html.includes("ask('今日はここまで。学習を終了します。')"));
});
test('解説・次へのメニューには学習ID等を渡せる', () => {
  const show = TOOLS.find((t) => t.name === 'showMenu');
  const r = show.local({ kind: 'next', body: '解説', sessionId: 's1', studyId: 'st1', learnerId: 'l1' });
  assert.equal(r.menu.sessionId, 's1');
  assert.equal(r.menu.studyId, 'st1');
  assert.equal(r.menu.learnerId, 'l1');
});

test('AI作成確認問題は出題時の正答固定を行い、AIには画面の本文・選択肢を再配布しない', async () => {
  const { forModel } = await import('../src/mcp.js');
  const { WIDGET_URI } = await import('../src/widget.js');
  const reg = TOOLS.find((t) => t.name === 'registerRemediationQuestion');
  const answer = TOOLS.find((t) => t.name === 'completeRemediation');
  assert.ok(reg && reg.appOnly && !reg.uiOnly);
  assert.ok(answer && answer.appOnly && answer.uiOnly);
  assert.deepEqual(reg.api({ sessionId: 'abc', question: '確認問題の長い本文です。どれが適切ですか？',
    choices: ['選択肢1','選択肢2'], correctAnswer: 2 }),
    ['POST', '/v1/sessions/abc/remediation/register',
      { question: '確認問題の長い本文です。どれが適切ですか？', choices: ['選択肢1','選択肢2'], correctAnswer: 2 }]);
  assert.deepEqual(answer.api({ sessionId: 'abc', challengeId: 'id1', selected: '2' }),
    ['POST', '/v1/sessions/abc/remediation/complete', { challengeId: 'id1', selected: '2' }]);
  const result = forModel({ status: 'remediation_question', question: '問題本文', choices: ['A','B'],
    sessionId: 'abc', challengeId: 'id1', correctAnswer: 2 });
  assert.equal(result.question, undefined);
  assert.equal(result.choices, undefined);
  assert.equal(result.correctAnswer, undefined);
  assert.equal(result.challengeId, 'id1');
  assert.equal(WIDGET_URI, 'ui://qlp/question-v50.html');
});
