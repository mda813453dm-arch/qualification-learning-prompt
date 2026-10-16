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

test('未対応の資格でも、公式PDFの指定ページを画像にして返す（表の文字を返すため毎回作る）', async () => {
  const OTHER = 'https://example.go.jp/exam/other.pdf';
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  env.fetchPdf = async (u) => (u === OTHER ? pdf('other-v1') : null);
  env.PUBLIC_BASE_URL = 'https://engine.example';
  let renders = 0;
  env.parserFetch = async (url, init) => {
    assert.ok(url.endsWith('/v1/pages'));
    const b = JSON.parse(init.body);
    renders += 1;
    const pages = Object.fromEntries(b.pages.map((n) => [`p${n}.png`, btoa(String.fromCharCode(...PNG))]));
    return new Response(JSON.stringify({ pageCount: 20, pages, excerpt: btoa('%PDF-excerpt') }));
  };
  const r = await call(env, 'POST', '/v1/pdf-pages', { url: OTHER, pages: [12, 11] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.pages.map((p) => p.page), [11, 12]);
  const img = await call(env, 'GET', new URL(r.body.pages[1].url).pathname, undefined, null);
  assert.equal(img.status, 200);
  assert.equal(img.type, 'image/png');
  const again = await call(env, 'POST', '/v1/pdf-pages', { url: OTHER, pages: [11, 12] });
  assert.equal(again.status, 200);
  assert.equal(renders, 2);
  assert.equal(again.body.tables, null);
  assert.equal(again.body.figureCount, 0);
  assert.match(again.body.notice, /11〜12ページ/);
  // 入力の検査と認証
  assert.equal((await call(env, 'POST', '/v1/pdf-pages', { url: 'http://x.example/a.pdf', pages: [1] })).status, 400);
  assert.equal((await call(env, 'POST', '/v1/pdf-pages', { url: OTHER, pages: [0] })).status, 400);
  assert.equal((await call(env, 'POST', '/v1/pdf-pages', { url: OTHER, pages: [1] }, 'wrong')).status, 401);
});

test('見出し（find）でページを探して画像にする。見つからなければ422', async () => {
  const OTHER = 'https://example.go.jp/exam/find.pdf';
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  env.PUBLIC_BASE_URL = 'https://engine.example';
  env.fetchPdf = async () => pdf('find-v1');
  env.parserFetch = async (url, init) => {
    const b = JSON.parse(init.body);
    if (b.find !== '第11問') return new Response(JSON.stringify({ error: 'FIND_NOT_FOUND' }), { status: 400 });
    assert.equal(b.span, 2);
    const png = btoa(String.fromCharCode(...PNG));
    const tables = [
      { page: 14, caption: '〔観測結果〕', rows: [['器械点', '視準点', '水平角'], ['T1', 'T2', '0°00′00″'], ['', 'F', '243°44′07″']] },
      { page: 14, caption: '〔測量成果〕 北は、X軸正方向に一致する。', rows: [['点名', 'X座標(m)'], ['A|B', '205.41']] },
    ];
    return new Response(JSON.stringify({ pageCount: 30, matchedPage: 14, pages: { 'p14.png': png, 'p15.png': png }, excerpt: btoa('%PDF-excerpt'), tables, figures: [{ page: 15, bbox: [68, 142, 556, 525] }], display: '第11問　本文\n\n<svg viewBox="0 0 1 1"></svg>' }));
  };
  const r = await call(env, 'POST', '/v1/pdf-pages', { url: OTHER, find: '第11問' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.matchedPage, 14);
  assert.deepEqual(r.body.pages.map((p) => p.page), [14, 15]);
  // ChatGPTは外部の画像を表示しないので、同じページのPDFをファイルとして返す
  assert.deepEqual(r.body.openaiFileResponse, ['https://engine.example/v1/pagepdf/' + r.body.fileUrl.split('/v1/pagepdf/')[1]]);
  assert.match(r.body.fileUrl, /\/14-15\.pdf$/);
  // 表はエンジンが読み取った文字で返し、図は切り出したPDFで付ける
  assert.equal(r.body.figureCount, 1);
  assert.equal(r.body.display, '第11問　本文\n\n<svg viewBox="0 0 1 1"></svg>');
  assert.match(r.body.notice, /図を切り出して/);
  assert.equal(
    r.body.tables,
    '〔観測結果〕\n| 器械点 | 視準点 | 水平角 |\n| --- | --- | --- |\n| T1 | T2 | 0°00′00″ |\n| 　 | F | 243°44′07″ |\n\n〔測量成果〕 北は、X軸正方向に一致する。\n| 点名 | X座標(m) |\n| --- | --- |\n| A｜B | 205.41 |',
  );
  const file = await handle(new Request('https://engine.example' + new URL(r.body.fileUrl).pathname), env);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.match(file.headers.get('content-disposition'), /attachment; filename="official-pages-14-15\.pdf"/);
  assert.equal(new TextDecoder().decode(await file.arrayBuffer()), '%PDF-excerpt');
  assert.equal((await call(env, 'GET', new URL(r.body.pages[0].url).pathname, undefined, null)).status, 200);
  assert.equal((await call(env, 'POST', '/v1/pdf-pages', { url: OTHER, find: '第99問' })).status, 422);
});

test('学習の開始と終了：時刻はエンジンが取り、累計は引継ぎIDごとに一度だけ足す', async () => {
  const { env } = makeEnv();
  const s = await call(env, 'POST', '/v1/study/start', { qualificationName: '土地家屋調査士' });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.match(s.body.display, /^📚 学習開始｜\d{2}:\d{2}\n🔑 引継ぎID：[a-z2-9]{10}/);
  assert.equal(s.body.resumed, false);
  env.now += 25 * 60 * 1000;
  const body = { area: '測量', results: { practiceCorrect: 2, practiceWrong: 1 }, weaknesses: ['令和7年度 第11問 座標法'] };
  const e = await call(env, 'POST', `/v1/study/${s.body.studyId}/end`, body);
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(e.body.minutes, 25);
  assert.equal(e.body.totalMinutes, 25);
  assert.match(e.body.display, /⏱ 今回の学習時間：25分/);
  assert.match(e.body.display, /・採点確定回答3問（正解2問・不正解1問）/);
  assert.match(e.body.display, /```text\n【学習引き継ぎデータ】[\s\S]*引継ぎID：[a-z2-9]{10}[\s\S]*・資格名：土地家屋調査士[\s\S]*【引き継ぎデータ ここまで】\n```$/);
  // 二度呼んでも累計は増えない
  env.now += 5 * 60 * 1000;
  const again = await call(env, 'POST', `/v1/study/${s.body.studyId}/end`, body);
  assert.equal(again.body.totalMinutes, 25);
  // 別のチャットで同じ引継ぎIDから始めると、累計が引き継がれる
  const s2 = await call(env, 'POST', '/v1/study/start', { qualificationName: '土地家屋調査士', learnerId: s.body.learnerId });
  assert.equal(s2.body.resumed, true);
  assert.equal(s2.body.totalMinutes, 25);
  assert.match(s2.body.display, /これまでの累計学習時間：25分/);
  env.now += 60 * 60 * 1000;
  const e2 = await call(env, 'POST', `/v1/study/${s2.body.studyId}/end`, {});
  assert.equal(e2.body.totalMinutes, 85);
  assert.match(e2.body.display, /📊 累計学習時間：1時間25分/);
  assert.equal((await call(env, 'POST', '/v1/study/00000000-0000-0000-0000-000000000000/end', {})).status, 404);
});
