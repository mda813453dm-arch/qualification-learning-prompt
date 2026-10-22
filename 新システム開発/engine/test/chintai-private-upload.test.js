import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import { sourceKey } from '../src/source-store.js';
import { readJob } from '../src/ingest.js';
import { handle } from '../src/app.js';
import { pdf, T0 } from './helpers.js';

const TOKEN = 'rights-test-token';

async function call(env, method, path, payload) {
  const response = await handle(new Request('https://engine.example' + path, {
    method,
    headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  }), env);
  return {
    status: response.status,
    body: (response.headers.get('content-type') ?? '').includes('application/json')
      ? await response.json() : await response.text(),
  };
}

function envForTest() {
  const received = [];
  return {
    received,
    env: {
      STORE: new MemoryStore(),
      API_TOKEN: TOKEN,
      PUBLIC_BASE_URL: 'https://engine.example',
      selfFetch: async () => new Response('{}', { status: 200 }),
      fetchAttached: async (url) => {
        received.push(url);
        return pdf(url.endsWith('question.pdf') ? 'question' : 'answer');
      },
      now: T0,
      clock: () => T0,
    },
  };
}

const files = {
  question: { download_url: 'https://attachments.example/question.pdf' },
  answer: { download_url: 'https://attachments.example/answer.pdf' },
};

test('賃管は2015～2025年度の取込予定だけを持ち、問題・正答を自動収集しない', async () => {
  const cat = CATALOG.chintai;
  assert.equal(cat.overviewOnly, true);
  assert.equal(cat.privateLicensedUpload, true);
  assert.equal(cat.shareOnVerifiedUpload, false);
  assert.deepEqual(cat.sources, []);
  assert.deepEqual(cat.availableUploadYears, [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025]);
  assert.deepEqual(cat.validatedUploadYears, [2015,2016,2018,2019,2021,2022,2023,2025]);
  const { env, received } = envForTest();
  const start = await call(env, 'POST', '/v1/sessions', { qualificationId: 'q097' });
  assert.equal(start.status, 201, JSON.stringify(start.body));
  assert.equal(await readJob(env.STORE, 'q097~' + start.body.learnerId), null);
  assert.deepEqual(received, []);
});

test('年度別の本人による許諾確認を経ない限りPDFを取得も保存もしない', async () => {
  const { env, received } = envForTest();
  const start = await call(env, 'POST', '/v1/sessions', { qualificationId: 'q097' });
  assert.equal(start.status, 201);
  const url = '/v1/sessions/' + start.body.sessionId;
  const upload = { year: 2025, ...files };
  const body = { year: upload.year, question: upload.question, answer: upload.answer };
  const blocked = await call(env, 'POST', url + '/attach', body);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'UPLOAD_PERMISSION_REQUIRED');
  assert.equal(received.length, 0, '権利未確認では一時添付先にもアクセスしない');
  assert.equal((await call(env, 'POST', url + '/upload-permission', { year: 2025, confirmed: false })).status, 403);
  assert.equal((await call(env, 'POST', url + '/upload-permission', { year: 2024, confirmed: true })).status, 422);
  const confirm = await call(env, 'POST', url + '/upload-permission', { year: 2025, confirmed: true });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  assert.equal(confirm.body.status, 'uploadPermissionConfirmed');
  assert.equal(received.length, 0, '同意ボタンだけではPDFを保存しない');
  assert.equal((await call(env, 'POST', url + '/attach', { ...body, year: 2023 })).status, 403,
    '別年度の同意を流用できない');
  const accepted = await call(env, 'POST', url + '/attach', body);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.status, 'attached');
  assert.equal(received.length, 2);
  const job = await readJob(env.STORE, 'q097~' + start.body.learnerId);
  assert.equal(job.sources.length, 1);
  assert.equal(job.sources[0].owner, start.body.learnerId);
  const source = job.sources[0];
  assert.match(source.questionUrl, /\\/v1\\/private-source\\//);
  assert.notEqual(source.questionUrl, source.answerUrl);
  assert.ok(await env.STORE.get(await sourceKey(source.questionUrl), 'arrayBuffer'));
  assert.equal((await call(env, 'GET', new URL(source.questionUrl).pathname)).status, 404,
    '原本PDFは公開URLから取得不可');
  const other = await call(env, 'POST', '/v1/sessions', { qualificationId: 'q097' });
  assert.equal(other.status, 201);
  assert.equal((await call(env, 'POST', '/v1/sessions/' + other.body.sessionId + '/attach', body)).status, 403,
    'ある利用者の許諾確認は別の利用者に継承しない');
});
