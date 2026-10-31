import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import manifest from '../data/land-surveyor-archive-source-manifest.json' with { type: 'json' };

const API = 'https://engine.example/v1/admin/seed-land-surveyor-archive';
const request = () => new Request(API,{method:'POST',
  headers:{authorization:'Bearer archive-test','content-type':'application/json'},body:'{}'});

test('実PDF全問検証済みの8区分だけを共通保存ジョブへ登録し、再実行でも増殖しない', async () => {
  const store = new MemoryStore();
  let kick = 0;
  const env = { STORE:store, API_TOKEN:'archive-test',
    PUBLIC_BASE_URL:'https://engine.example',
    selfFetch:async () => {kick++;return {ok:true};},
    clock:()=>Date.UTC(2026,9,31,14) };
  const response = await handle(request(),env);
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.equal(result.status,'archivedSharedImportQueued');
  assert.equal(result.requestedSections,8);
  assert.deepEqual(result.years,[2015,2017,2018,2019,2021]);
  const job=await store.get('job/land_surveyor~_archive_shared','json');
  assert.equal(job.persistent,true);
  assert.equal(job.sources.length,8);
  assert.ok(job.sources.every(x=>x.owner==='_shared' && x.adapter==='land_surveyor'));
  assert.ok(job.sources.every(x=>x.status==='pending'));
  assert.ok(job.sources.every(x=>x.questionUrl.startsWith('https://izuki.net/wp-content/uploads/')));
  const response2=await handle(request(),env);
  assert.equal(response2.status,200);
  const saved=await store.get('job/land_surveyor~_archive_shared','json');
  assert.equal(saved.sources.length,8);
  assert.ok(kick>=1);
  assert.equal(await store.get('lrnstate/test-user'),null,'個人履歴は作成しない');
});

test('平成19・20年度は全11問を現行午前・全22問を現行午後として分類し、未検証の正答を採点しない',()=>{
  for(const year of [2007,2008]){
    const row=manifest.years.find(x=>x.year===year);
    assert(row);
    assert.equal(row.sectionTotalQuestionCounts['午前の部'],11);
    assert.equal(row.sectionTotalQuestionCounts['午後の部'],22);
    assert.match(row.questionSources['午前の部'].url,/pm_q\.pdf$/);
    assert.match(row.questionSources['午後の部'].url,/am_q\.pdf$/);
    assert(!CATALOG.land_surveyor.archivedImportSources.some(x=>x.year===year));
  }
});
