// 合格条件6：問番号・本文・正答の誤結合なし／採点済みを採点保留へ戻さない／通常採点で再検索しない
// あわせて API の入口（経路A・経路B・図・認証）を確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { httpParser } from '../src/parser-client.js';
import { readJob, startJob } from '../src/ingest.js';
import { DAY, PNG, SRC, SVG, T0, assetsB64, fakeParser, fakeResult, fakeWeb, pdf } from './helpers.js';

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
  // 本文に入れたSVGの図は、画像のURLを渡さない（AIが別の方法で図を出そうとしないように）
  assert.equal(n2.figures[0].url, undefined);
  // 表示の全文：問題文 → 図（本文中のSVG）→ 選択肢。公式PDFの問題と同じ形
  assert.equal(n2.display, `問2の本文\n\n${new TextDecoder().decode(SVG)}\n\n1　一\n\n2　二\n\n3　三\n\n4　四\n\n5　五`);
  assert.equal(n2.figures[0].svgFile, undefined);
  assert.equal(q.display, '問1の本文\n\n1　一\n\n2　二\n\n3　三\n\n4　四\n\n5　五');
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
  // AIが studyId の代わりに引継ぎIDを渡しても、その引継ぎIDの最後の学習を終える
  const s3 = await call(env, 'POST', '/v1/study/start', { learnerId: s.body.learnerId });
  env.now += 10 * 60 * 1000;
  const e3 = await call(env, 'POST', `/v1/study/${s.body.learnerId}/end`, {});
  assert.equal(e3.status, 200, JSON.stringify(e3.body));
  assert.equal(e3.body.minutes, 10);
  assert.equal(e3.body.totalMinutes, 95);
  assert.ok(s3.body.studyId);
  assert.equal((await call(env, 'POST', '/v1/study/zzzzzzzzzz/end', {})).status, 404);
});

test('本番では、学習の開始と出題の呼び出しで分解を待たない（裏の取り込みに任せ、すぐ応答する）', async () => {
  const { env, parse } = makeEnv({ parserUrl: 'https://parser.example' });
  env.PUBLIC_BASE_URL = 'https://engine.example';
  const kicks = [];
  env.selfFetch = async (url) => {
    kicks.push(url);
    return new Response('{}');
  };
  const s = await startSession(env);
  assert.equal(parse.count, 0, '開始の応答の前に分解しない');
  assert.equal(s.job.state, 'running');
  assert.ok(kicks.some((u) => u.endsWith('?run=all')));
  const waiting = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body;
  assert.equal(waiting.status, 'waiting');
  assert.equal(parse.count, 0);
  // 裏の取り込み（自分自身への呼び出し）が終わると、出題できる
  const bg = await call(env, 'GET', new URL(kicks[0]).pathname + '?run=all');
  assert.equal(bg.status, 200, JSON.stringify(bg.body));
  assert.equal(parse.count, 1);
  const q = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body;
  assert.equal(q.status, 'question');
  // 待ったあとの最初の問題は、取り込めた年度を一言知らせてから出す（2問目からは付けない）
  assert.match(q.question.screen, /^\*\*\d{4}(〜\d{4})?年度の過去問の取り込みが終わりました。過去問を出題します。\*\*\n\n(📍.+\n)?■\d{4}年度 問/);
  const r = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/answer`, { questionId: q.question.questionId, value: '1' })).body;
  if (r.next?.question) assert.ok(!r.next.question.screen.includes('取り込みが終わりました'));
});

test('取り込み中は、進み具合の棒と残り時間の目安を返す。AIが書き崩した問題番号でも、出題中の問なら採点する', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  env.PUBLIC_BASE_URL = 'https://engine.example';
  const kicks = [];
  env.selfFetch = async (url) => {
    kicks.push(url);
    return new Response('{}');
  };
  const s = await startSession(env);
  const waiting = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body;
  assert.equal(waiting.status, 'waiting');
  assert.match(waiting.notice, /^📥 直近1年度の過去問を取り込み中：□{10} 0\/1年度（残り約1分）/);
  assert.match(waiting.job.progress, /0\/1年度/);
  // 待つ間の選択肢を番号で出し、解説のあとにも進み具合を確かめる選択肢を付けさせる
  assert.ok(waiting.screen.startsWith(waiting.notice));
  // 区切り線のあとの質問と選択肢で終える（ChatGPTがボタンにする形）
  assert.match(waiting.screen, /\n\n---\n■取り込みを待つ間、どうしますか？\n1：今の項目の解説を読む\n2：今の項目の確認問題を解く\n3：取り込みの進み具合を確認する$/);
  assert.match(waiting.afterScreen, /^---\n■次はどうしますか？\n1：取り込みの進み具合を確認する[^\n]*\n2：続けて解説を読む\n3：確認問題を解く$/);
  assert.match(waiting.howToShow, /afterScreen/);
  assert.doesNotMatch(waiting.screen + waiting.afterScreen, /セッション|session|nextQuestion/i);
  await call(env, 'GET', new URL(kicks[0]).pathname + '?run=all');
  const q = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body.question;
  // 別の問の番号は受け付けない
  assert.equal((await call(env, 'POST', `/v1/sessions/${s.sessionId}/answer`, { questionId: `${SRC.year}年 問2`, value: 1 })).status, 409);
  assert.equal((await call(env, 'POST', `/v1/sessions/${s.sessionId}/answer`, { questionId: `${SRC.year + 1}年 問${q.questionNumber}`, value: 1 })).status, 409);
  const r = await call(env, 'POST', `/v1/sessions/${s.sessionId}/answer`, { questionId: `${SRC.year}年 問${q.questionNumber}`, value: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.grade.questionId, q.questionId);
  assert.notEqual(r.body.next.question?.questionId, q.questionId, '採点した問は次に出さない');
  const again = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body;
  assert.notEqual(again.question?.questionId, q.questionId);
});

test('出題の画面は見出しから答え方までそろっており、「スキップ」で成績に数えず次の問へ進む', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId } = await startSession(env);
  const q = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  assert.match(q.screen, /^(\*\*.+取り込みが終わりました。過去問を出題します。\*\*\n\n)?(📍.+\n)?■\d{4}年度 問1\n\n問1の本文\n\n1　一[\s\S]*問題PDF：\[公式の問題PDF[^\]]*\]\(https:[^)]+\)\n\n[\s\S]*飛ばすときは「スキップ」と入力してください。$/);
  assert.match(q.howToShow, /question\.screen/);
  const r = (await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: q.questionId, value: 'スキップ' })).body;
  assert.equal(r.grade.skipped, true);
  assert.equal(r.grade.correctAnswer, undefined, 'スキップでは正答を見せない');
  assert.notEqual(r.next.question.questionId, q.questionId);
  const again = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  assert.notEqual(again.questionId, q.questionId, 'スキップした問は今回の学習では出し直さない');
});

test('エンジンが出題する資格の公式PDFは、renderPdfPages でページを出さない', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  await startSession(env);
  const r = await call(env, 'POST', '/v1/pdf-pages', { url: 'https://example.go.jp/q.pdf', find: '問26' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'ENGINE_QUESTION');
  assert.match(r.body.hint, /question\.screen/);
});

test('資格の番号だけで取り込み状況を聞かれても 404 にせず、nextQuestion で確かめるよう返す', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const r = await call(env, 'GET', '/v1/jobs/q063');
  assert.equal(r.status, 200);
  assert.equal(r.body.job, null);
  // 利用者に見せる文には内部の話を入れない。AIへの案内は hint に分ける
  assert.doesNotMatch(r.body.notice, /セッション|session|nextQuestion|startSession/i);
  assert.match(r.body.hint, /nextQuestion/);
});

test('sessionId の代わりに引継ぎIDや studyId が送られても、その学習者のセッションで出題する。無ければ startSession を促す', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const st = (await call(env, 'POST', '/v1/study/start', { qualificationName: '測量士補' })).body;
  const s = (await call(env, 'POST', '/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SOURCE], learnerId: st.learnerId })).body;
  const byLid = await call(env, 'POST', `/v1/sessions/${st.learnerId}/next`);
  assert.equal(byLid.status, 200, JSON.stringify(byLid.body));
  const q = byLid.body.question;
  const byStudy = await call(env, 'POST', `/v1/sessions/${st.studyId}/next`);
  assert.equal(byStudy.body.question.questionId, q.questionId, '同じセッションの出題中の問が返る');
  const a = await call(env, 'POST', `/v1/sessions/${st.learnerId}/answer`, { questionId: q.questionId, value: 1 });
  assert.equal(a.status, 200);
  const real = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body.question;
  assert.notEqual(real.questionId, q.questionId, '採点が本来のセッションに記録されている');
  const other = (await call(env, 'POST', '/v1/study/start', { qualificationName: '土地家屋調査士' })).body;
  const none = await call(env, 'POST', `/v1/sessions/${other.learnerId}/next`);
  assert.equal(none.status, 404);
  assert.match(none.body.hint, /startSession/);
});

test('startSession の前に引継ぎIDで出題を求められても、学習の開始で決めた資格（測量士補）の取り込みをエンジンが始める', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  env.fetchText = async () => `<tr><td>令和8年5月17日</td><td><a href="/common/2026q.pdf">問題</a><a href="/common/2026a.pdf">解答一覧</a></td></tr>`;
  const st = (await call(env, 'POST', '/v1/study/start', { qualificationName: '測量士補' })).body;
  const r = await call(env, 'POST', `/v1/sessions/${st.learnerId}/next`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(['waiting', 'question', 'finished'].includes(r.body.status), JSON.stringify(r.body).slice(0, 300));
  assert.deepEqual(r.body.job.sources.map((s) => s.year), [2026]);
});

test('引継ぎデータにエンジンの記録を載せず、引継ぎIDだけで続きから出題する（セッションが切れていても）', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const st = (await call(env, 'POST', '/v1/study/start', { qualificationName: '土地家屋調査士' })).body;
  const s = (await call(env, 'POST', '/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SOURCE], learnerId: st.learnerId })).body;
  const q = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body.question;
  await call(env, 'POST', `/v1/sessions/${s.sessionId}/answer`, { questionId: q.questionId, value: 3 });
  const e = (await call(env, 'POST', `/v1/study/${st.studyId}/end`, { sessionId: s.sessionId })).body;
  assert.doesNotMatch(e.display, /エンジンの記録/);
  assert.match(e.display, /正解\d+問・不正解\d+問/);
  env.now = T0 + 3 * DAY;
  // 別のチャット：引継ぎIDで出題を求める
  const n = await call(env, 'POST', `/v1/sessions/${st.learnerId}/next`);
  assert.equal(n.status, 200, JSON.stringify(n.body));
  assert.notEqual(n.body.question.questionId, q.questionId, '解いた問は飛ばす');
  // startSession を呼び直されても、記録を消さない
  env.now += DAY;
  const again = (await call(env, 'POST', '/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SOURCE], learnerId: st.learnerId })).body;
  const n2 = (await call(env, 'POST', `/v1/sessions/${again.sessionId}/next`)).body.question;
  assert.notEqual(n2.questionId, q.questionId);
  // 引継ぎデータ（エンジンの記録なし）を importHandoff に渡しても、引継ぎIDで続ける
  const imp = await call(env, 'POST', '/v1/handoff/import', { handoff: e.handoff });
  assert.equal(imp.status, 201, JSON.stringify(imp.body));
  assert.equal(imp.body.restored, 1);
});

test('宅建・測量士補は、AIが選んだ年度ではなく、公式の掲載ページにある過去問を新しい年度から全部取り込む', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const opened = [];
  env.fetchText = async (u) => {
    opened.push(u);
    return `<tr><td>令和6年5月19日</td><td><a href="/common/b.pdf">問題</a><a href="/common/b2.pdf">解答一覧</a><a href="/common/x.pdf">解答用紙</a></td>
      <td><a href="/common/2024q.pdf">問題</a><a href="/common/2024a.pdf">解答一覧</a></td></tr>
      <tr><td>令和8年5月17日</td><td><a href="/common/c.pdf">問題</a><a href="/common/y.pdf">解答用紙</a></td>
      <td><a href="/common/2026q.pdf">問題</a><a href="/common/2026a.pdf">解答一覧</a></td></tr>`;
  };
  const gpt = [{ adapter: 'surveyor', year: 2024, section: 'main', questionUrl: 'https://www.gsi.go.jp/common/2024q.pdf', answerUrl: 'https://www.gsi.go.jp/common/2024a.pdf' }];
  const r = await call(env, 'POST', '/v1/sessions', { qualificationId: 'q063', sources: gpt });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(opened, ['https://www.gsi.go.jp/LAW/SHIKEN/past.html']);
  assert.deepEqual(r.body.job.sources.map((s) => s.year), [2026, 2024]);
});

test('学習者ごとの取り込みに、まだ無い年度だけを後ろに足す（取り込み済みの年度はそのまま）', async () => {
  const store = new MemoryStore();
  const src = (y) => ({ qualificationId: 'q063', adapter: 'surveyor', year: y, section: 'main', questionUrl: `https://www.gsi.go.jp/${y}q.pdf`, answerUrl: `https://www.gsi.go.jp/${y}a.pdf` });
  await startJob(store, 'q063~abc', [src(2026), src(2024)], T0, { persistent: true });
  const job = await readJob(store, 'q063~abc');
  job.sources[0].status = 'done';
  await store.put('job/q063~abc', JSON.stringify(job));
  const merged = await startJob(store, 'q063~abc', [src(2026), src(2025), src(2024)], T0 + 1000, { persistent: true });
  assert.deepEqual(merged.sources.map((s) => [s.year, s.status]), [[2026, 'done'], [2024, 'pending'], [2025, 'pending']]);
});

test('直近3年度の取り込みが済むまでは新しい問を出さず、4年度目より前は待たない', async () => {
  const { pickNext, newState } = await import('../src/engine.js');
  const state = newState({ qualificationId: 'q063', plan: {}, now: T0 });
  const items = [{ packet: { questionId: 'a', fieldId: 's1' } }];
  const job = (st) => ({ state: 'running', sources: [2026, 2025, 2024, 2023].map((year, i) => ({ year, status: st[i] })) });
  assert.equal(pickNext(state, items, { today: '2026-10-17', job: job(['done', 'pending', 'pending', 'pending']) }).status, 'waiting');
  assert.equal(pickNext(state, items, { today: '2026-10-17', job: job(['done', 'done', 'failed', 'pending']) }).status, 'question');
});

test('同じ分野の3問は、年度を替えながら出す', async () => {
  const { pickNext, pin, newState } = await import('../src/engine.js');
  let state = newState({ qualificationId: 'q063', plan: {}, now: T0 });
  const it = (year, n) => ({ packet: { questionId: `q063:${year}:main:${n}`, fieldId: 's1', year, questionNumber: n, choices: ['a', 'b', 'c', 'd', 'e'], correctAnswer: 1 }, keyParts: {} });
  const items = [it(2026, 1), it(2026, 2), it(2025, 1), it(2024, 1)];
  const years = [];
  for (let i = 0; i < 3; i += 1) {
    const p = pickNext(state, items, { today: '2026-10-17', job: null });
    years.push(p.item.packet.year);
    state = pin(state, p.item, p.kind, T0);
    state = { ...state, history: { ...state.history, [p.item.packet.questionId]: { result: 'wrong' } }, current: null };
  }
  assert.deepEqual(years, [2026, 2025, 2024]);
});

test('学習計画・項目の進め方・再開の確認は、区切り線のあとの選択肢で終わる形を応答に添える（ChatGPTでボタンになる）', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const s = (await call(env, 'POST', '/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SOURCE] })).body;
  assert.match(s.planMenu, /^---\n学習を開始しますか？\n1：始めます$/);
  const st = (await call(env, 'POST', '/v1/study/start', { qualificationName: '測量士補', learnerId: s.learnerId })).body;
  assert.match(st.itemMenu, /^---\n■この項目はどう進めますか？[^\n]*\n1：解説あり[^\n]*\n2：確認問題から[^\n]*\n3：実践問題から[^\n]*$/);
  assert.match(st.howToShow, /itemMenu/);
  const e = (await call(env, 'POST', `/v1/study/${st.studyId}/end`, {})).body;
  const imp = (await call(env, 'POST', '/v1/handoff/import', { handoff: e.handoff })).body;
  assert.match(imp.resumeMenu, /^---\n■続きから始めますか？\n1：始めます$/);
});

test('賃管は、公式の掲載ページから年度ごとの問題と正解番号表のPDFを組にして集める', async () => {
  const { chintaiSources, pdfLinks } = await import('../src/discover.js');
  const html = ['2025', '2024', '2015'].map((y) => `<a href="/assets/common/else/past_question_${y}.pdf">（pdf）</a><a href="/assets/common/else/past_answer_${y}.pdf">（pdf）</a>`).join('')
    + '<a href="/assets/common/else/past_question_2014.pdf">（pdf）</a>';
  const s = chintaiSources(pdfLinks(html, 'https://www.chintaikanrishi.jp/exam/past/'), 99);
  assert.deepEqual(s.map((x) => x.year).sort(), [2015, 2024, 2025], '正解番号表の無い年度は取り込まない');
  assert.ok(s.every((x) => x.adapter === 'chintai' && x.answerUrl.endsWith(`past_answer_${x.year}.pdf`)));
});

test('startSession は資格名でも呼べる。エンジンが扱わない資格は、そのことと次の手を返す', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const ok = await call(env, 'POST', '/v1/sessions', { qualificationId: '賃管', sources: [] });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const ng = await call(env, 'POST', '/v1/sessions', { qualificationId: '気象予報士', sources: [] });
  assert.equal(ng.status, 422);
  assert.equal(ng.body.error, 'QUALIFICATION_NOT_SUPPORTED');
  assert.match(JSON.stringify(ng.body), /PDFを添付/);
});

test('FPは、公表問題（問題と正解が1つのPDF）と紙の試験（問題と正解が別）を、回ごとに集める。「FP」だけでは級を決めない', async () => {
  const { fp2Sources, pdfLinks } = await import('../src/discover.js');
  const html = ['g2_202605_qa', 'g3_202605_qa', 'g2_202409_q', 'g2_202409_a', 'g2_202405_q', 'j2_202405_q'].map((f) => `<a href="files/${f}.pdf">x</a>`).join('');
  const s = fp2Sources(pdfLinks(html, 'https://www.jafp.or.jp/exam/mohan/'), 99);
  assert.deepEqual(s.map((x) => [x.section, x.answerUrl?.split('/').pop() ?? null]), [['2026年5月', null], ['2024年9月', 'g2_202409_a.pdf']]);
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  assert.equal((await call(env, 'POST', '/v1/sessions', { qualificationId: 'FP3級', sources: [] })).status, 201);
  assert.equal((await call(env, 'POST', '/v1/sessions', { qualificationId: 'FP', sources: [] })).status, 422);
});

test('年に何回もある試験は、見出しを回の名前（2024年9月）にする', async () => {
  const { questionScreen } = await import('../src/engine.js');
  const s = questionScreen({ year: 2024, section: '2024年9月', questionNumber: 3, choices: [] }, '本文');
  assert.match(s, /^■2024年9月 問3/);
  assert.match(questionScreen({ year: 2024, section: 'main', questionNumber: 3, choices: [] }, '本文'), /^■2024年度 問3/);
});

test('答えていない問を残して終えたら、別のチャットで再開したときにその問から出す', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const st = (await call(env, 'POST', '/v1/study/start', { qualificationName: '土地家屋調査士' })).body;
  const s = (await call(env, 'POST', '/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SOURCE], learnerId: st.learnerId })).body;
  const q1 = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/next`)).body.question;
  const a = (await call(env, 'POST', `/v1/sessions/${s.sessionId}/answer`, { questionId: q1.questionId, value: 3 })).body;
  const shown = a.next.question; // 採点の応答に付いて表示された問（答えないまま終える）
  await call(env, 'POST', `/v1/study/${st.studyId}/end`, { sessionId: s.sessionId });
  env.now = T0 + 3 * DAY; // セッションは切れている
  const again = (await call(env, 'POST', '/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SOURCE], learnerId: st.learnerId })).body;
  const n = (await call(env, 'POST', `/v1/sessions/${again.sessionId}/next`)).body;
  assert.equal(n.question.questionId, shown.questionId);
  assert.equal(n.repeated, true);
});

test('利用者が問題を指定したら（「問3を出して」）、出題中の問があってもその問を出す。無ければ知らせて通常の次の問', async () => {
  const { env } = makeEnv({ parserUrl: 'https://parser.example' });
  const { sessionId } = await startSession(env);
  const first = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body.question;
  assert.notEqual(first.questionNumber, 3);
  const want = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`, { question: `${SRC.year}年度の問3` })).body;
  assert.equal(want.question.questionNumber, 3);
  // 指定した問がそのまま採点できる
  const g = await call(env, 'POST', `/v1/sessions/${sessionId}/answer`, { questionId: want.question.questionId, value: 4 });
  assert.equal(g.body.grade.correct, true);
  const none = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`, { question: '問99' })).body;
  assert.equal(none.status, 'question');
  assert.match(none.question.screen, /問99）は、取り込んだ過去問の中に見つかりませんでした/);
});

test('分解プログラムの版が上がったら、取り込み済みの年度も新しい版で分解し直し、終わるまでは前の版で出題を続ける', async () => {
  const { env, parse } = makeEnv({ parserUrl: 'https://parser.example' });
  env.PARSER_VERSION = '0.7.0';
  // 偽の分解サーバーは、いまエンジンが求める版で結果を返す
  const real = env.parserFetch;
  env.parserFetch = async (url, init) => {
    const r = await (await real(url, init)).json();
    r.result.parserVersion = env.PARSER_VERSION ?? r.result.parserVersion;
    return new Response(JSON.stringify(r));
  };
  const { sessionId, learnerId } = await startSession(env);
  const before = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body;
  assert.equal(before.status, 'question');
  const jobId = `${SRC.qualificationId}~${learnerId}`;
  assert.equal((await readJob(env.STORE, jobId)).sources[0].keyParts.parserVersion, '0.7.0');
  delete env.PARSER_VERSION;
  const n = parse.count;
  const after = (await call(env, 'POST', `/v1/sessions/${sessionId}/next`)).body;
  assert.equal(after.status, 'question');
  assert.equal((await readJob(env.STORE, jobId)).sources[0].keyParts.parserVersion, '0.8.0');
  assert.equal(parse.count, n + 1);
});
