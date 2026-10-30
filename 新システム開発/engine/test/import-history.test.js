import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { startJob, readJob, stepJob, importHistoryView } from '../src/ingest.js';
import { SRC, PV, T0, fakeWeb, fakeParser, pdf } from './helpers.js';

test('本人用の取込み履歴は受付→解析→検証完了を時刻・年度ごとに記録する',async()=>{
  const store=new MemoryStore(), jobId='q041~aaaaaaaaaa';
  const source={...SRC,owner:'aaaaaaaaaa'};
  const web=fakeWeb({[SRC.questionUrl]:pdf('q-v1'),[SRC.answerUrl]:pdf('a-v1')});
  const parser=fakeParser(web);
  await startJob(store,jobId,[source],T0,{persistent:true});
  await stepJob(store,jobId,{store,fetchPdf:web.fetchPdf,parse:parser,parserVersion:PV,now:T0+10},{clock:()=>T0+10});
  const job=await readJob(store,jobId);
  const history=importHistoryView(job);
  assert.equal(history.length,1);
  assert.equal(history[0].status,'done');
  assert.equal(history[0].questions,3);
  assert.deepEqual(history[0].events.map(e=>e.status),['registered','running','done']);
  assert.ok(history[0].events.every(e=>Number.isFinite(e.at)));
  assert.doesNotMatch(JSON.stringify(history),/https:\/\/|questionUrl|answerUrl|sha256|owner/,'ファイルURL・SHA・学習者IDは表示用履歴に含めない');
  assert.equal((await readJob(store,jobId)).persistent,true);
});
test('失敗→同一年度のみ再取込みしても以前の失敗履歴を保持する',async()=>{
  const store=new MemoryStore(),jobId='q090~aaaaaaaaaa';
  const src=(suffix)=>({adapter:'gyosei',year:2025,section:'年度共通',
    questionUrl:'https://personal.example/'+suffix+'.pdf',
    answerUrl:'https://official.example/ans.html',privateLicensedUpload:true,owner:'aaaaaaaaaa'});
  let job=await startJob(store,jobId,[src('first')],1000,{persistent:true});
  job.sources[0].status='failed';job.sources[0].reason='PARSER_FAILED';
  await store.put('job/'+encodeURIComponent(jobId),JSON.stringify(job));
  job=await startJob(store,jobId,[src('second')],2000,{persistent:true});
  const list=importHistoryView(job);
  assert.equal(list[0].year,2025);
  assert.equal(list[0].status,'pending');
  assert.deepEqual(list[0].events.map(e=>e.status),['registered','retry']);
  assert.equal(list[0].events[1].reason,'PARSER_FAILED');
  assert.equal(job.sources.length,1);
  assert.match(job.sources[0].questionUrl,/second\.pdf/);
});
test('旧版の取込み履歴は判明している最終状態だけ表示し、日付や過去の失敗を捏造しない',()=>{
  const job={startedAt:1000,updatedAt:2000,persistent:true,sources:[
    {year:2023,section:'年度共通',status:'done',packetCount:47,questionUrl:'https://private.example/doc.pdf'},
    {year:2024,section:'年度共通',status:'failed',reason:'PDF_INVALID'}
  ]};
  const rows=importHistoryView(job);
  assert.deepEqual(rows.map(x=>[x.year,x.status,x.historicalDetailAvailable]),[[2024,'failed',false],[2023,'done',false]]);
  assert.ok(rows.every(x=>x.events.length===0));
  assert.equal(rows[0].reason,'PDF_INVALID');
});
