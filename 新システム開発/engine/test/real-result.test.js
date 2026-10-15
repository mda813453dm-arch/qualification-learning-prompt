// 実データ確認（任意）：qlp_parser の本物の出力を経路Aで送り、エンジンが受け取って出題・採点できるか。
//   QLP_REAL_JSON     qlp_parser.cli の出力JSON
//   QLP_REAL_ASSETS   --assets-dir で書き出したフォルダ（図が無ければ省略可）
//   QLP_REAL_Q / QLP_REAL_A   分解したときの問題PDF・正答PDF（正答が問題PDFに入っていれば QLP_REAL_A は省略）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/worker.js';
import { toBase64 } from '../src/parser-client.js';

const { QLP_REAL_JSON, QLP_REAL_ASSETS, QLP_REAL_Q, QLP_REAL_A } = process.env;

test('本物の分解結果を経路Aで受け取り、全問を出題・採点できる', { skip: !QLP_REAL_JSON && 'QLP_REAL_JSON 未設定' }, async () => {
  const result = JSON.parse(readFileSync(QLP_REAL_JSON, 'utf8'));
  const assets = QLP_REAL_ASSETS ? Object.fromEntries(readdirSync(QLP_REAL_ASSETS).map((f) => [f, toBase64(readFileSync(join(QLP_REAL_ASSETS, f)))])) : {};
  const p0 = result.packets[0];
  const files = { [p0.questionPdfUrl]: new Uint8Array(readFileSync(QLP_REAL_Q)) };
  if (QLP_REAL_A) files[p0.answerPdfUrl] = new Uint8Array(readFileSync(QLP_REAL_A));
  const env = { QLP_CACHE: new MemoryStore(), API_TOKEN: 't', fetchPdf: async (u) => files[u], clock: () => Date.parse('2026-10-15T01:00:00Z') };
  const call = async (method, path, body) => {
    const res = await handle(new Request(`https://e.example${path}`, { method, headers: { authorization: 'Bearer t' }, body: body && JSON.stringify(body) }), env);
    return { status: res.status, body: res.headers.get('content-type').startsWith('application/json') ? await res.json() : null };
  };
  const source = { adapter: QLP_REAL_A ? 'surveyor' : 'takken', year: result.year, section: result.section, questionUrl: p0.questionPdfUrl, answerUrl: p0.answerPdfUrl === p0.questionPdfUrl ? null : p0.answerPdfUrl };
  const s = await call('POST', '/v1/sessions', { qualificationId: result.qualificationId, sources: [source] });
  const up = await call('POST', `/v1/jobs/${result.qualificationId}/sources/0/result`, { result, assets });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.job.sources[0].packetCount, result.packets.length);
  for (const p of result.packets) {
    const n = (await call('POST', `/v1/sessions/${s.body.sessionId}/next`)).body;
    assert.equal(n.question.questionNumber, p.questionNumber);
    assert.equal(n.question.figures.length, p.figures.length);
    if (p.stemMode === 'ocr') assert.equal(n.question.notices.length, 1);
    const g = (await call('POST', `/v1/sessions/${s.body.sessionId}/answer`, { questionId: n.question.questionId, value: p.correctAnswer })).body.grade;
    assert.equal(g.correct, true);
  }
  assert.equal((await call('POST', `/v1/sessions/${s.body.sessionId}/next`)).body.status, 'finished');
});
