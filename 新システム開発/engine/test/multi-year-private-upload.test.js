import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { readJob } from '../src/ingest.js';
import { availablePackets } from '../src/engine.js';
import { assetsB64, fakeResult, pdf, T0 } from './helpers.js';

const token = 'batch-licensed-test';
function setup() {
  const received = [];
  return { received, env: { STORE: new MemoryStore(), API_TOKEN: token,
    PUBLIC_BASE_URL: 'https://engine.example', now: T0, clock: () => T0,
    selfFetch: async () => new Response('{}', { status: 200 }),
    fetchText: async () => '',
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

test('保留していた旧年度PDFは公式正答を検証できたら再添付なしに登録処理へ戻る', async()=>{
  const {env,received}=setup();
  env.fetchText=async()=> '';
  const a=await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const path='/v1/sessions/'+a.body.sessionId;
  await req(env,'POST',path+'/upload-permission',{year:0,confirmed:true});
  const first=await req(env,'POST',path+'/attach',{year:2017,question:{download_url:'https://uploads.example/2017.pdf'}});
  assert.equal(first.body.status,'pendingOfficialAnswer');
  assert.equal(received.length,1);
  await env.STORE.put('official-answer-index/html','<a href="/doc/exam/h29ans.html">平成２９年度試験問題の正解</a>');
  const checked=await req(env,'GET',path+'/official-library');
  assert.equal(checked.status,200,JSON.stringify(checked.body));
  const job=await readJob(env.STORE,'q090~'+a.body.learnerId);
  assert.equal(job.sources[0].year,2017);
  assert.equal(job.sources[0].answerUrl,'https://gyosei-shiken.or.jp/doc/exam/h29ans.html');
  assert.equal(received.length,1,'原本PDFは再添付せず保存済みの本人用控えを使う');
  assert.ok(!checked.body.pendingOfficialAnswerYears.includes(2017));
});

test('賃管の問題・正答PDFは2ファイルずつ消費し、計10ファイルを超えない',async()=>{
  const {env,received}=setup();
  const a=await req(env,'POST','/v1/sessions',{qualificationId:'q097'});
  const path='/v1/sessions/'+a.body.sessionId;
  await req(env,'POST',path+'/upload-permission',{year:0,confirmed:true});
  for(let year=2020;year<2025;year++){
    const r=await req(env,'POST',path+'/attach',{year,question:{download_url:'https://uploads.example/q'+year+'.pdf'},answer:{download_url:'https://uploads.example/a'+year+'.pdf'}});
    assert.equal(r.status,200,JSON.stringify(r.body));
  }
  assert.equal(received.length,10);
  const over=await req(env,'POST',path+'/attach',{year:2025,question:{download_url:'https://uploads.example/q2025.pdf'},answer:{download_url:'https://uploads.example/a2025.pdf'}});
  assert.equal(over.status,403,JSON.stringify(over.body));
  assert.equal(received.length,10,'許諾のファイル上限到達後は原本にアクセスしない');
});

test('チャット添付6年度を1回の登録呼び出しで順番に受け取り、処理開始と完了を区別する', async () => {
  const {env, received} = setup();
  const start = await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const base = '/v1/sessions/' + start.body.sessionId;
  const years = [2020,2021,2022,2023,2024,2025];
  const files = years.map((year) => ({
    file_name: 'R' + (year - 2018) + '_mondai.pdf',
    download_url: 'https://uploads.example/' + year + '.pdf',
    file_id: 'file_' + year,
    mime_type: 'application/pdf'
  }));
  const before = await req(env,'POST',base+'/attach-batch',{questionPdfs:files});
  assert.equal(before.status,200);
  assert.equal(before.body.status,'attachedBatch');
  assert.equal(before.body.failed,6);
  assert.equal(received.length,0,'許諾が未確認ならPDF原本を一切取得しない');
  await req(env,'POST',base+'/upload-permission',{year:0,confirmed:true});
  const result = await req(env,'POST',base+'/attach-batch',{questionPdfs:files});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.status,'attachedBatch');
  assert.equal(result.body.requested,6);
  assert.equal(result.body.failed,0,JSON.stringify(result.body.results));
  assert.equal(result.body.queued,6);
  assert.equal(received.length,6);
  const job = await readJob(env.STORE,'q090~' + start.body.learnerId);
  assert.deepEqual(job.sources.map(x=>x.year),years);
  assert.ok(job.sources.every(s=>s.status==='pending'),'受理時点で解析済みと装わない');
});
test('一括登録は年度不明だけ失敗させ、他ファイルを止めず、11件は原本取得前に拒否する', async()=>{
  const {env,received}=setup();
  const start=await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const base='/v1/sessions/'+start.body.sessionId;
  await req(env,'POST',base+'/upload-permission',{year:0,confirmed:true});
  const file=(name)=>({file_name:name,download_url:'https://uploads.example/'+name,file_id:'file_'+name});
  const tooMany=await req(env,'POST',base+'/attach-batch',{questionPdfs:Array.from({length:11},(_,i)=>file('R'+(i+1)+'.pdf'))});
  assert.equal(tooMany.status,400);
  assert.equal(received.length,0);
  const result=await req(env,'POST',base+'/attach-batch',{questionPdfs:[file('not-a-year.pdf'),file('R2_mondai.pdf')]});
  assert.equal(result.status,200);
  assert.equal(result.body.failed,1);
  assert.equal(result.body.queued,1);
  assert.equal(received.length,1);
  assert.deepEqual(result.body.results.map(x=>x.status),['failed','attached']);
});

test('PDF解析用の自己リクエストは1.5秒で切断せず、登録APIはすぐに返答する', async()=>{
  const {env}=setup();
  let workerSignal=null;
  let workerStarted=0;
  env.selfFetch=async (_url, options)=>{
    workerStarted++;
    workerSignal=options.signal;
    await new Promise(resolve=>setTimeout(resolve,1700));
    return new Response('{}',{status:200});
  };
  const s=await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const base='/v1/sessions/'+s.body.sessionId;
  await req(env,'POST',base+'/upload-permission',{year:0,confirmed:true});
  const begin=Date.now();
  const response=await req(env,'POST',base+'/attach-batch',{
    questionPdfs:[{file_name:'R2_mondai.pdf',download_url:'https://uploads.example/R2.pdf',file_id:'f2'}]
  });
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.queued,1);
  assert.ok(Date.now()-begin < 1500,'長時間の解析を待たず登録処理受付を返す');
  assert.equal(workerStarted,1);
  await new Promise(resolve=>setTimeout(resolve,1750));
  assert.equal(workerSignal.aborted,false,'解析ワーカーを1.5秒でAbortしない');
});

test('個人用2年度を解析完了まで進め、検証済み問題を出題候補として取得する',async()=>{
  const {env}=setup();
  env.PARSER_URL='https://parser.example';
  env.PARSER_VERSION='0.8.2';
  const question=(year)=>pdf('gyosei-question-'+year);
  env.fetchAttached=async (link)=>question(link.includes('2020')?2020:2021);
  env.fetchPdf=async (link)=>{
    if (/ans\.html$/.test(link)) return new TextEncoder().encode('<!doctype html><html>official answers</html>');
    throw new Error('UNEXPECTED_FETCH:'+link);
  };
  env.parserFetch=async(_path, init)=>{
    const input=JSON.parse(init.body);
    const q=Uint8Array.from(Buffer.from(input.question.base64,'base64'));
    const a=Uint8Array.from(Buffer.from(input.answer.base64,'base64'));
    const parsed=await fakeResult({
      src:{qualificationId:input.qualificationId,year:input.year,section:input.section,
        questionUrl:input.question.url,answerUrl:input.answer.url},
      qBytes:q,aBytes:a,figureOn:[],answers:[1,2],fieldIds:['g1','g1']
    });
    return new Response(JSON.stringify({result:parsed.result,assets:assetsB64(parsed.assets)}),{status:200});
  };
  env.selfFetch=async(link,options)=>handle(new Request(link,{headers:options.headers}),env);
  const session=await req(env,'POST','/v1/sessions',{qualificationId:'q090'});
  const base='/v1/sessions/'+session.body.sessionId;
  await req(env,'POST',base+'/upload-permission',{year:0,confirmed:true});
  const batch=await req(env,'POST',base+'/attach-batch',{questionPdfs:[2020,2021].map(year=>({
    file_name:'R'+(year-2018)+'_mondai.pdf',file_id:'f'+year,download_url:'https://uploads.example/'+year+'.pdf'
  }))});
  assert.equal(batch.status,200,JSON.stringify(batch.body));
  assert.equal(batch.body.queued,2);
  let library;
  for(let n=0;n<25;n++){
    await new Promise(resolve=>setTimeout(resolve,80));
    library=await req(env,'GET',base+'/official-library');
    if(library.body.personalUploadedYears?.length===2)break;
  }
  assert.deepEqual(library.body.personalUploadedYears,[2020,2021],JSON.stringify(library.body));
  assert.deepEqual(library.body.readyYearDetails.map(x=>x.questions),[2,2]);
  const job=await readJob(env.STORE,'q090~'+session.body.learnerId);
  assert.equal(job.sources.filter(x=>x.status==='done').length,2);
  const packets=await availablePackets(env.STORE,job,T0);
  assert.equal(packets.length,4,'出題・採点用に検証された4問が取得できる');
  const app=async(name,args)=>{
    const response=await handle(new Request('https://engine.example/app',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:100,method:'tools/call',params:{name,arguments:args}})
    }),env);
    return (await response.json()).result;
  };
  const started=await app('startStudy',{learnerId:session.body.learnerId,qualificationName:'行政書士'});
  assert.notEqual(started.isError,true,JSON.stringify(started));
  const chosen=await app('chooseItem',{sessionId:session.body.sessionId,fieldName:'基礎法学',mode:'practice'});
  assert.equal(chosen.structuredContent.status,'item',JSON.stringify(chosen));
  const next=await app('nextQuestion',{sessionId:session.body.sessionId,question:'基礎法学'});
  const real=next._meta?.qlp??next.structuredContent;
  assert.equal(real.status,'question',JSON.stringify(real));
  assert.ok([2020,2021].includes(real.question?.year));
  assert.equal(real.question?.choices?.length,5);
});
