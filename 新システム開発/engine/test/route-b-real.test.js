// 経路Bの通し確認（任意）：本物の分解サーバー（parser/ の qlp_parser.server）にエンジンから公式PDFを渡し、全問を出題・採点する。
//   QLP_PARSER_URL  分解サーバーのURL（例 http://127.0.0.1:8090）
//   QLP_PARSER_TOKEN 分解サーバーのトークン（設定していれば）
//   QLP_REAL_ADAPTER takken | surveyor、QLP_REAL_QID 資格ID（q041 / q063）、QLP_REAL_YEAR 年
//   QLP_REAL_Q / QLP_REAL_A  問題PDF・正答PDF（正答が問題PDFに入っていれば QLP_REAL_A は省略）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';

const e = process.env;

test('経路B：エンジンが分解サーバーを呼び、全問を出題・採点できる', { skip: !e.QLP_PARSER_URL && 'QLP_PARSER_URL 未設定', timeout: 300000 }, async () => {
  const qUrl = 'https://example.go.jp/q.pdf';
  const aUrl = e.QLP_REAL_A ? 'https://example.go.jp/a.pdf' : null;
  const files = { [qUrl]: new Uint8Array(readFileSync(e.QLP_REAL_Q)) };
  if (aUrl) files[aUrl] = new Uint8Array(readFileSync(e.QLP_REAL_A));
  let parserCalls = 0;
  const env = {
    STORE: new MemoryStore(),
    API_TOKEN: 't',
    PARSER_URL: e.QLP_PARSER_URL,
    PARSER_TOKEN: e.QLP_PARSER_TOKEN,
    fetchPdf: async (u) => files[u],
    parserFetch: (...args) => { parserCalls += 1; return fetch(...args); },
    clock: () => Date.parse('2026-10-15T01:00:00Z'),
  };
  const call = async (method, path, body) => {
    const res = await handle(new Request(`https://e.example${path}`, { method, headers: { authorization: 'Bearer t' }, body: body && JSON.stringify(body) }), env);
    return res.json();
  };
  const year = Number(e.QLP_REAL_YEAR);
  const s = await call('POST', '/v1/sessions', { qualificationId: e.QLP_REAL_QID, sources: [{ adapter: e.QLP_REAL_ADAPTER, year, section: 'main', questionUrl: qUrl, answerUrl: aUrl }] });
  // 1回の呼び出しの持ち時間（15秒）を超えて分解が続いても、次の呼び出しで終わっていればよい
  let job = s.job;
  for (let i = 0; i < 20 && job.state === 'running'; i += 1) job = (await call('GET', `/v1/jobs/${e.QLP_REAL_QID}`)).job;
  assert.equal(job.state, 'done', JSON.stringify(job));
  assert.equal(parserCalls, 1);
  let n = 0;
  for (;;) {
    const next = await call('POST', `/v1/sessions/${s.sessionId}/next`);
    if (next.status !== 'question') break;
    const q = next.question;
    // 正答は出題に入っていないので、まず1で回答し、採点結果の正答を確かめる
    const g = (await call('POST', `/v1/sessions/${s.sessionId}/answer`, { questionId: q.questionId, value: 1 })).grade;
    assert.equal(g.questionId, q.questionId);
    assert.ok(Number.isInteger(g.correctAnswer));
    n += 1;
  }
  assert.equal(n, job.sources[0].packetCount);
});
