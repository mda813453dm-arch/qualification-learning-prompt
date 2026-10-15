// 合格条件6：問番号・本文・正答の誤結合なし／採点済みを採点保留へ戻さない／通常採点で再検索しない
// あわせて API の入口（経路A・経路B・図・認証）を確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { httpParser } from '../src/parser-client.js';
import { DAY, PNG, SRC, T0, assetsB64, fakeParser, fakeResult, fakeWeb, pdf } from './helpers.js';

const TOKEN = 'test-token';
const SOURCE = { adapter: SRC.adapter, year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };

/** 読み書きを記録する保存先。 */
class SpyStore extends MemoryStore {
  constructor() {
    super();
    this.reads = [];
  }
  async get(key, type) {
    this.reads.push(key);
    return super.get(key, type);
  }
}

function makeEnv({ parserUrl } = {}) {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web);
  const env = { STORE: new SpyStore(), API_TOKEN: TOKEN, fetchPdf: web.fetchPdf, now: T0 };
  env.clock = () => env.now;
  if (parserUrl) {
    env.PARSER_URL = parserUrl;
    // 経路Bの分解サーバーの偽物：送られてきたPDF（base64）を偽の分解器にかける
    env.parserFetch = async (url, init) => {
      const b = JSON.parse(init.body);
      const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
      const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
      return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
    };
  }
  return { env, web, parse };
}

async function call(env, method, path, body, token = TOKEN) {
  const res = await handle(new Request(`https://engine.example${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, body: type.startsWith('application/json') ? await res.json() : new Uint8Array(await res.arrayBuffer()), type };
}

async function startSession(env) {
  const r = await call(env, 'POST', '/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SOURCE] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test('トークンが無い・違うときは図以外を受け付けない', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  assert.equal((await call(env, 'POST', '/v1/sessions', {}, null)).status, 401);
  assert.equal((await call(env, 'POST', '/v1/sessions', {}, 'wrong')).status, 401);
});

test('http の公式PDF・多すぎる取り込み元は受け付けない', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const http = await call(env, 'POST', '/v1/sessions', { qualificationId: 'surveyor', sources: [{ ...SOURCE, questionUrl: 'http://example.go.jp/q.pdf' }] });
  assert.equal(http.status, 400);
  const many = await call(env, 'POST', '/v1/sessions', { qualificationId: 'surveyor', sources: Array(41).fill(SOURCE) });
  assert.equal(many.status, 400);
});

test('経路B：出題には正答を入れず、採点は出題時に控えた正答で行い、保存データを読み直さない', async () => {
  const { env, web } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId, job } = await startSession(env);
  assert.equal(job.state, 'done');
  const next = await call(env, 'POST', `/v1/sessions/${sessionId}/next`);
  assert.equal(next.body.status, 'question');
  const q = next.body.question;
  assert.equal(q.questionNumber, 1);
  assert.equal(q.stem, '問1の本文');
  assert.ok(!JSON.stringify(q).includes('correctAnswer'), '出題に正答を入れない');

  // 採点：セッション以外は読まない・公式PDFも取りに行かない
  const fetchesBefore = web.calls.length;
  env.STORE.reads = [];
  const g = await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q.questionId, value: '3' });
  assert.equal(g.status, 200);
  assert.equal(g.body.grade.correct, true);
  assert.equal(g.body.grade.correctAnswer, 3);
  // 採点は最初にセッションだけを読む（次の問を決めるための取り込み記録の読み取りは、そのあと）
  assert.equal(env.STORE.reads[0], `ses/${sessionId}`);
  assert.ok(g.body.next, '採点の応答に次の問が付く');
  assert.equal(web.calls.length, fetchesBefore);
});

test('出題中と違う問番号の回答は採点しない（誤結合の防止）', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId } = await startSession(env);
  const q = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  const wrongId = await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: 'surveyor:2026:main:2', value: 1 });
  assert.equal(wrongId.status, 409);
  assert.equal(wrongId.body.error, 'QUESTION_BINDING_MISMATCH');
  const out = await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q.questionId, value: 9 });
  assert.equal(out.body.error, 'ANSWER_INPUT_INVALID');
  // 回答前に「次」を押しても、同じ問を返す（別の問に差し替えない）
  const again = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body;
  assert.equal(again.repeated, true);
  assert.equal(again.question.questionId, q.questionId);
});

test('採点済みの問に再回答しても採点保留に戻さず、同じ結果を返す', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId } = await startSession(env);
  const q = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  const first = (await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q.questionId, value: 1 })).body.grade;
  assert.equal(first.result, 'wrong');
  const second = (await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q.questionId, value: 3 })).body.grade;
  assert.equal(second.alreadyGraded, true);
  assert.equal(second.selected, 1);
  assert.equal(second.result, 'wrong');
  const n2 = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  assert.equal(n2.questionNumber, 2, '採点済みの問は出し直さず次へ進む');
  assert.equal(n2.figures.length, 1);
  // 図はトークン無しで取れる
  const fig = await call(env, 'GET', new URL(n2.figures[0].url, 'https://engine.example').pathname, undefined, null);
  assert.equal(fig.status, 200);
  assert.equal(fig.type, 'image/png');
  assert.deepEqual(fig.body, PNG);
});

test('間違えた問は翌日の復習で最初に出る', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId } = await startSession(env);
  const q1 = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q1.questionId, value: 1 });
  env.now = T0 + DAY - 60 * 1000; // 翌日（日本時間）・セッションの24時間以内
  const n = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  assert.equal(n.kind, 'review');
  assert.equal(n.questionId, q1.questionId);
});

test('経路A：分解サーバーが無いときはアプリの分解結果を待ち、届いた結果を照合してから出題する', async () => {
  const { env } = makeEnv();
  const { sessionId, job, learnerId } = await startSession(env);
  const jobPath = `/v1/jobs/${SRC.qualificationId}~${learnerId}/sources/0/result`;
  assert.equal(job.sources[0].reason, 'AWAITING_UPLOAD');
  assert.equal((await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.status, 'waiting');

  // 別のPDFで分解した結果（SHAが合わない）は受け取らない
  const forged = await fakeResult({ qBytes: pdf('fake'), aBytes: pdf('a-v1') });
  const bad = await call(env, 'POST', jobPath, { result: forged.result, assets: assetsB64(forged.assets) });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.reason, 'RESULT_SHA_MISMATCH');

  const real = await fakeResult({ qBytes: pdf('q-v1'), aBytes: pdf('a-v1') });
  const ok = await call(env, 'POST', jobPath, { result: real.result, assets: assetsB64(real.assets) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.job.state, 'done');
  const next = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body;
  assert.equal(next.question.questionNumber, 1);
});

test('PNGでない図は受け取らない', async () => {
  const { env } = makeEnv();
  await startSession(env);
  const real = await fakeResult({ qBytes: pdf('q-v1'), aBytes: pdf('a-v1') });
  const r = await call(env, 'POST', '/v1/jobs/surveyor/sources/0/result', { result: real.result, assets: { 'q2.png': btoa('<svg/>') } });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'ASSETS_INVALID');
});

test('引継ぎデータを出力し、別のセッションで復元できる', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId } = await startSession(env);
  const q = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q.questionId, value: 3 });
  const { handoff } = (await call(env, 'GET', `/v1/sessions/${sessionId}/handoff`)).body;
  env.now = T0 + 3 * DAY;
  const imp = await call(env, 'POST', '/v1/handoff/import', { handoff, sources: [SOURCE] });
  assert.equal(imp.status, 201, JSON.stringify(imp.body));
  assert.equal(imp.body.restored, 1);
  assert.deepEqual(imp.body.withheld, []);
  const n = (await call(env, 'POST', `/v1/sessions/${imp.body.sessionId}/next`)).body.question;
  assert.equal(n.questionNumber, 2, '解いた問は飛ばす');
  assert.equal((await call(env, 'POST', '/v1/handoff/import', { handoff: '{"schema":"x"}' })).status, 400);
});

test('経路Bの分解サーバーが失敗したら、その取り込み元を失敗にして理由を返す', async () => {
  const parse = httpParser({ endpoint: 'https://parser.example', fetch: async () => new Response('x', { status: 500 }) });
  await assert.rejects(parse({ question: { url: 'u', sha256: 's', bytes: pdf('q') }, answer: null }), (e) => e.code === 'PARSER_FAILED');
  assert.throws(() => httpParser({ endpoint: 'http://parser.example' }), /PARSER_URL_INVALID/);
});

test('採点の応答に次の問が付き、あとで nextQuestion を呼んでも同じ問が返る。回答を再送しても同じ結果', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId } = await startSession(env);
  const q1 = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  const g = await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q1.questionId, value: 3 });
  assert.equal(g.body.grade.correct, true);
  assert.equal(g.body.next.status, 'question');
  assert.equal(g.body.next.question.questionNumber, 2);
  assert.ok(!JSON.stringify(g.body.next).includes('correctAnswer'), '次の問にも正答を入れない');
  const again = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body;
  assert.equal(again.repeated, true);
  assert.equal(again.question.questionId, g.body.next.question.questionId);
  // 次の問を先に控えたあとでも、前の問の回答の再送は「採点済み」として同じ結果を返す
  const retry = await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q1.questionId, value: 1 });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.grade.alreadyGraded, true);
  assert.equal(retry.body.grade.selected, 3);
});
