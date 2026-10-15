// 合格条件5：24時間以内は取り直さない／期限後は取り直す／差し替えられた公式PDFの問は出題しない
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { IngestError, ingestSource, startJob, stepJob, validateResult } from '../src/ingest.js';
import { readResult } from '../src/cache.js';
import { exportHandoff, importHandoff } from '../src/handoff.js';
import { grade, newState, pin, availablePackets, pickNext } from '../src/engine.js';
import { DAY, PV, SRC, T0, fakeParser, fakeResult, fakeWeb, pdf } from './helpers.js';

const setup = () => {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web);
  const store = new MemoryStore();
  return { web, parse, store, deps: (now) => ({ store, fetchPdf: web.fetchPdf, parse, parserVersion: PV, now }) };
};

test('24時間以内の2回目は公式PDFを取りに行かず、分解もしない', async () => {
  const { web, parse, deps } = setup();
  const first = await ingestSource(SRC, deps(T0));
  assert.equal(first.from, 'parsed');
  assert.equal(web.calls.length, 2);
  const second = await ingestSource(SRC, deps(T0 + DAY - 1));
  assert.equal(second.from, 'cache');
  assert.equal(web.calls.length, 2, '取り直していない');
  assert.equal(parse.count, 1, '分解し直していない');
  assert.deepEqual(second.result.packets.map((p) => p.correctAnswer), [3, 1, 4]);
});

test('24時間を過ぎたら公式PDFを取り直して、分解し直す', async () => {
  const { web, parse, store, deps } = setup();
  const first = await ingestSource(SRC, deps(T0));
  assert.equal((await readResult(store, first.keyParts, T0 + DAY)).reason, 'EXPIRED');
  const again = await ingestSource(SRC, deps(T0 + DAY));
  assert.equal(again.from, 'parsed');
  assert.equal(web.calls.length, 4);
  assert.equal(parse.count, 2);
});

test('期限後に公式PDFが差し替わっていたら、新しい版を別のキーで取り込む（古い版の結果は使わない）', async () => {
  const { web, deps } = setup();
  const v1 = await ingestSource(SRC, deps(T0));
  web.files[SRC.questionUrl] = pdf('q-v2');
  const v2 = await ingestSource(SRC, deps(T0 + DAY));
  assert.notEqual(v2.keyParts.questionSha256, v1.keyParts.questionSha256);
  assert.equal(v2.result.packets[0].questionPdfSha256, v2.keyParts.questionSha256);
});

test('引継ぎで再開したとき、公式PDFが差し替わっていた問は出題せず理由を返す', async () => {
  const { web, store, deps } = setup();
  const r = await ingestSource(SRC, deps(T0));
  let state = newState({ qualificationId: SRC.qualificationId, now: T0 });
  const job = { sources: [{ status: 'done', keyParts: r.keyParts }] };
  const items = await availablePackets(store, job, T0);
  const pick = pickNext(state, items, { today: '2026-10-15', job });
  state = pin(state, pick.item, pick.kind, T0);
  state = grade(state, { questionId: pick.item.packet.questionId, value: 2 }, { today: '2026-10-15', now: T0 }).state;
  const text = exportHandoff(state);
  assert.ok(!text.includes('本文'), '引継ぎに問題本文を入れない');

  web.files[SRC.questionUrl] = pdf('q-v2');
  const later = await importHandoff(text, { store, fetchPdf: web.fetchPdf, now: T0 + 2 * DAY });
  assert.equal(Object.keys(later.history).length, 0);
  assert.deepEqual(later.withheld.map((w) => w.reason), ['OFFICIAL_PDF_REPLACED']);

  delete web.files[SRC.questionUrl];
  const gone = await importHandoff(text, { store, fetchPdf: web.fetchPdf, now: T0 + 4 * DAY });
  assert.deepEqual(gone.withheld.map((w) => w.reason), ['OFFICIAL_PDF_UNAVAILABLE']);

  web.files[SRC.questionUrl] = pdf('q-v1');
  const same = await importHandoff(text, { store, fetchPdf: web.fetchPdf, now: T0 + 6 * DAY });
  assert.equal(same.withheld.length, 0);
  assert.equal(same.history[pick.item.packet.questionId].result, 'wrong');
  assert.equal(same.review[pick.item.packet.questionId].dueDate, '2026-10-16');
});

test('24時間の控えの間に公式PDFが差し替わったら、その回は取り込まず次の回で新しい版を取り込む', async () => {
  const { web, store, deps } = setup();
  const qid = SRC.qualificationId;
  await ingestSource(SRC, deps(T0)); // 公式PDFのSHA-256の控え（v1）ができる
  web.files[SRC.questionUrl] = pdf('q-v2');
  // 分解器の版が上がって保存が無い → PDF本体を取り直すと、控えと違う
  const parse = async (i) => {
    const r = await fakeResult({ qBytes: i.question.bytes, aBytes: i.answer.bytes });
    r.result.parserVersion = '0.4.0';
    return r;
  };
  const d = { store, fetchPdf: web.fetchPdf, parse, parserVersion: '0.4.0' };
  await startJob(store, qid, [SRC], T0);
  const job1 = await stepJob(store, qid, { ...d, now: T0 + 1000 }, { clock: () => T0 + 1000 });
  assert.equal(job1.sources[0].status, 'pending');
  assert.equal(job1.sources[0].reason, 'PDF_CHANGED_DURING_INGEST');
  const job2 = await stepJob(store, qid, { ...d, now: T0 + 2000 }, { clock: () => T0 + 2000 });
  assert.equal(job2.state, 'done');
  const r = await readResult(store, job2.sources[0].keyParts, T0 + 2000);
  assert.equal(r.result.packets[0].questionPdfSha256, job2.sources[0].keyParts.questionSha256);
});

test('指定のSHA-256と違う公式PDFは取り込まない', async () => {
  const { deps } = setup();
  await assert.rejects(ingestSource({ ...SRC, expectedQuestionSha256: 'a'.repeat(64) }, deps(T0)), (e) => e instanceof IngestError && e.code === 'PDF_HASH_MISMATCH');
});

test('PDFでないもの・取得できないものは、その取り込み元だけ失敗にしてほかは続ける', async () => {
  const { web, store, parse } = setup();
  const bad = { ...SRC, year: 2025, questionUrl: 'https://example.go.jp/html', answerUrl: 'https://example.go.jp/a.pdf' };
  web.files[bad.questionUrl] = new TextEncoder().encode('<html>');
  const missing = { ...SRC, year: 2024, questionUrl: 'https://example.go.jp/none.pdf' };
  await startJob(store, 'surveyor', [bad, missing, SRC], T0);
  const job = await stepJob(store, 'surveyor', { store, fetchPdf: web.fetchPdf, parse, parserVersion: PV, now: T0 }, { clock: () => T0 });
  assert.deepEqual(job.sources.map((s) => s.reason ?? s.status), ['PDF_INVALID', 'PDF_FETCH_FAILED', 'done']);
  assert.equal(job.state, 'done');
});

test('時間の上限を過ぎたら残りは次回に回し、20秒を過ぎたら案内文を付ける', async () => {
  const { web, store, parse } = setup();
  const second = { ...SRC, year: 2025 };
  await startJob(store, 'surveyor', [SRC, second], T0);
  let t = T0;
  const clock = () => t;
  const slowParse = async (i) => { t += 25000; return parse(i); };
  const job = await stepJob(store, 'surveyor', { store, fetchPdf: web.fetchPdf, parse: slowParse, parserVersion: PV, now: T0 }, { budgetMs: 20000, clock });
  assert.deepEqual(job.sources.map((s) => s.status), ['done', 'pending']);
  assert.equal(job.state, 'running');
  assert.match(job.notice, /取り込みが済んだ問題から出題します/);
});

test('形の崩れた問はその問だけ外し、理由を残す', async () => {
  const q = pdf('q'); const a = pdf('a');
  const { result, assets } = await fakeResult({ qBytes: q, aBytes: a });
  result.packets[0].correctAnswer = 9;
  result.packets[1].questionId = 'surveyor:2026:main:99';
  result.packets[2].figures[0] = { file: 'q2.png', sha256: 'b'.repeat(64) };
  result.packets[2].figures = [{ file: 'x.png', sha256: 'b'.repeat(64) }];
  const v = await validateResult(SRC, { question: result.questionPdfSha256, answer: result.answerPdfSha256 }, PV, result, assets);
  assert.deepEqual(v.excluded.map((e) => e.reason), ['OFFICIAL_ANSWER_OUT_OF_RANGE', 'QUESTION_ID_MISMATCH', 'FIGURE_ASSET_MISMATCH']);
  assert.equal(v.status, 'unavailable');
  await assert.rejects(validateResult(SRC, { question: 'c'.repeat(64), answer: result.answerPdfSha256 }, PV, result, assets), (e) => e.code === 'RESULT_SHA_MISMATCH');
});
