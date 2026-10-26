import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { readJob } from '../src/ingest.js';
import { pdf, T0 } from './helpers.js';

const token = 'batch-licensed-test';
function setup() {
  const received = [];
  return { received, env: { STORE: new MemoryStore(), API_TOKEN: token,
    PUBLIC_BASE_URL: 'https://engine.example', now: T0, clock: () => T0,
    selfFetch: async () => new Response('{}', { status: 200 }),
    fetchAttached: async (u) => { received.push(u); return pdf('question'); } } };
}
async function req(env, method, path, data) {
  const r = await handle(new Request('https://engine.example' + path, {
    method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data) }), env);
  return { status: r.status, body: await r.json() };
}
test('行政書士のまとめ許諾は年度選択なしで複数PDFを受け、未確認年度の採点を保留する', async () => {
  const { env, received } = setup();
  const start = await req(env,'POST','/v1/sessions',{ qualificationId: 'q090' });
  assert.equal(start.status, 201);
  const path = '/v1/sessions/' + start.body.sessionId;
  const file = (year) => ({ year, question: { download_url: 'https://uploads.example/' + year + '.pdf' } });
  assert.equal((await req(env,'POST',path+'/attach',file(2020))).status,403);
  assert.equal(received.length,0,'許諾確認前に原本を取得しない');
  const confirmation = await req(env,'POST',path+'/upload-permission',{ year:0, confirmed:true });
  assert.equal(confirmation.status,200);
  assert.equal(confirmation.body.allYears,true);
  assert.equal(confirmation.body.maxBatchFiles,10);
  for (const year of [2020,2025]) {
    const r = await req(env,'POST',path+'/attach',file(year));
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(r.body.status,'attached');
    assert.equal(r.body.year,year);
    assert.equal(r.body.section,'年度共通');
  }
  const older = await req(env,'POST',path+'/attach',file(2017));
  assert.equal(older.status,200,JSON.stringify(older.body));
  assert.equal(older.body.status,'pendingOfficialAnswer');
  assert.equal(older.body.year,2017);
  const library = await req(env,'GET',path+'/official-library');
  assert.equal(library.status,200);
  assert.ok(library.body.pendingOfficialAnswerYears.includes(2017));
  const job = await readJob(env.STORE,'q090~'+start.body.learnerId);
  assert.deepEqual(job.sources.map(s => s.year),[2020,2025]);
  assert.equal(received.length,3);
});
test('まとめ許諾は10ファイルを超えて流用できず別セッションへ継承しない',async()=>{
  const {env} = setup();
  const a = await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const path = '/v1/sessions/'+a.body.sessionId;
  await req(env,'POST',path+'/upload-permission',{year:0,confirmed:true});
  for(let year=2010;year<2020;year++) assert.equal((await req(env,'POST',path+'/attach',{year,question:{download_url:'https://uploads.example/'+year+'.pdf'}})).status,200);
  const over = await req(env,'POST',path+'/attach',{year:2020,question:{download_url:'https://uploads.example/2020.pdf'}});
  assert.equal(over.status,403);
  assert.equal(over.body.error,'UPLOAD_PERMISSION_REQUIRED');
  const b = await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  assert.equal((await req(env,'POST','/v1/sessions/'+b.body.sessionId+'/attach',{year:2020,question:{download_url:'https://uploads.example/2020.pdf'}})).status,403);
});

test('新年度は公式掲載一覧で年度と正解を照合した場合のみ採点用に登録する', async () => {
  const {env} = setup();
  env.fetchText = async () => '<a href="/doc/exam/r8ans.html">令和８年度試験問題の正解</a>';
  const a = await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const path='/v1/sessions/'+a.body.sessionId;
  await req(env,'POST',path+'/upload-permission',{year:0,confirmed:true});
  const r = await req(env,'POST',path+'/attach',{year:2026,question:{download_url:'https://uploads.example/2026.pdf'}});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.status,'attached');
  const job = await readJob(env.STORE,'q090~'+a.body.learnerId);
  assert.equal(job.sources[0].answerUrl,'https://gyosei-shiken.or.jp/doc/exam/r8ans.html');
});
test('公式一覧の外部ドメイン・年度違いの正答リンクは利用しない',async()=>{
  const {env}=setup();
  env.fetchText=async()=>'<a href="https://evil.example/r8ans.html">令和８年度試験問題の正解</a><a href="/doc/exam/r8ans.html">令和９年度試験問題の正解</a>';
  const a=await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const path='/v1/sessions/'+a.body.sessionId;
  await req(env,'POST',path+'/upload-permission',{year:0,confirmed:true});
  const r=await req(env,'POST',path+'/attach',{year:2026,question:{download_url:'https://uploads.example/2026.pdf'}});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.status,'pendingOfficialAnswer');
  assert.equal(await readJob(env.STORE,'q090~'+a.body.learnerId),null);
});
