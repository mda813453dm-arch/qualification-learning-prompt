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
  assert.equal(job.sources[0].privateLicensedUpload, true, '本人専用の問題は共通解析キャッシュを使わない');
  const source = job.sources[0];
  assert.ok(source.questionUrl.includes('/v1/private-source/'));
  assert.notEqual(source.questionUrl, source.answerUrl);
  assert.ok(await env.STORE.get(await sourceKey(source.questionUrl), 'arrayBuffer'));
  assert.equal((await call(env, 'GET', new URL(source.questionUrl).pathname)).status, 404,
    '原本PDFは公開URLから取得不可');
  const other = await call(env, 'POST', '/v1/sessions', { qualificationId: 'q097' });
  assert.equal(other.status, 201);
  assert.equal((await call(env, 'POST', '/v1/sessions/' + other.body.sessionId + '/attach', body)).status, 403,
    'ある利用者の許諾確認は別の利用者に継承しない');
});

test('行政書士は年度別許諾確認後、本人の問題PDFと当該年度の公式正答HTMLだけを結び付ける', async () => {
  const { env, received } = envForTest();
  const start = await call(env, 'POST', '/v1/sessions', { qualificationId: 'q090' });
  assert.equal(start.status, 201);
  assert.equal(await readJob(env.STORE, 'q090~' + start.body.learnerId), null);
  const url = '/v1/sessions/' + start.body.sessionId;
  const body = { year: 2025, section: '本試験', question: files.question };
  const blocked = await call(env, 'POST', url + '/attach', body);
  assert.equal(blocked.status, 403);
  assert.equal(received.length, 0);
  const confirm = await call(env, 'POST', url + '/upload-permission', { year: 2025, confirmed: true });
  assert.equal(confirm.status, 200);
  assert.equal(received.length, 0, '同意のみでは公式過去問原本を取得しない');
  const accepted = await call(env, 'POST', url + '/attach', body);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.status, 'attached');
  assert.equal(received.length, 1, '行政書士は正解HTMLの添付を要求しない');
  const job = await readJob(env.STORE, 'q090~' + start.body.learnerId);
  assert.equal(job.sources.length, 1);
  assert.equal(job.sources[0].section, '年度共通', 'AIが一般的な区分名を渡しても唯一の公式区分で検証する');
  assert.equal(job.sources[0].owner, start.body.learnerId);
  assert.equal(job.sources[0].privateLicensedUpload, true);
  assert.ok(job.sources[0].questionUrl.includes('/v1/private-source/'));
  assert.equal(job.sources[0].answerUrl, CATALOG.gyosei.officialAnswerHtml[2025]);
  assert.equal((await call(env, 'GET', new URL(job.sources[0].questionUrl).pathname)).status, 404);
  const other = await call(env, 'POST', '/v1/sessions', { qualificationId: 'q090' });
  const otherBlocked = await call(env, 'POST', '/v1/sessions/' + other.body.sessionId + '/attach', body);
  assert.equal(otherBlocked.status, 403, '本人許諾を他の利用者へ引き継がない');
});

test('行政書士2020年度はAIが区分を誤指定しても年度共通で取り込み、未許諾ならPDFを取得しない', async () => {
  const { env, received } = envForTest();
  const started = await call(env, 'POST', '/v1/sessions', { qualificationId: '行政書士' });
  assert.equal(started.status, 201);
  const url = '/v1/sessions/' + started.body.sessionId;
  const uploaded = { year: 2020, section: '午後の部', question: files.question };
  const before = await call(env, 'POST', url + '/attach', uploaded);
  assert.equal(before.status, 403, '区分の言い換えより先に本人の許諾を確認する');
  assert.equal(before.body.error, 'UPLOAD_PERMISSION_REQUIRED');
  assert.equal(received.length, 0);
  assert.equal((await call(env, 'POST', url + '/upload-permission', { year: 2020, confirmed: true })).status, 200);
  const accepted = await call(env, 'POST', url + '/attach', uploaded);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.section, '年度共通');
  assert.equal(received.length, 1, '行政書士では問題PDFのみ受け取る');
  const job = await readJob(env.STORE, 'q090~' + started.body.learnerId);
  assert.equal(job.sources[0].answerUrl, CATALOG.gyosei.officialAnswerHtml[2020]);
});
