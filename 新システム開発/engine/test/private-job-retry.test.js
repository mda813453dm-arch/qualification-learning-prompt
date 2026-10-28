import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { startJob, readJob } from '../src/ingest.js';

test('本人専用PDFの一部失敗後も過去の年度を保持し、失敗年度だけ再試行できる', async () => {
  const store = new MemoryStore();
  const id = 'q090~test-learner';
  const source = (year, suffix='first') => ({
    adapter:'gyosei', year, section:'年度共通',
    questionUrl:'https://private.example/' + year + '-' + suffix + '.pdf',
    answerUrl:'https://official.example/' + year + '.html',
    privateLicensedUpload:true,
  });
  const old = await startJob(store, id, [source(2020),source(2023)], 1000, {persistent:true});
  assert.equal(old.sources.length,2);
  old.sources[0].status = 'done';
  old.sources[1].status = 'failed';
  old.sources[1].reason = 'PDF_PARSE_FAILED';
  old.state = 'done';
  await store.put('job/' + encodeURIComponent(id), JSON.stringify(old));
  // 成功した年度も失敗した年度も残して、新年度を追加する。
  const appended = await startJob(store,id,[source(2024)],2000,{persistent:true});
  assert.deepEqual(appended.sources.map(x=>[x.year,x.status]),
    [[2020,'done'],[2023,'failed'],[2024,'pending']]);
  // 同じ年度の失敗だけ新しい原本で再試行する。
  const retried = await startJob(store,id,[source(2023,'corrected')],3000,{persistent:true});
  assert.deepEqual(retried.sources.map(x=>[x.year,x.status]),
    [[2020,'done'],[2023,'pending'],[2024,'pending']]);
  assert.equal(retried.sources[1].reason,null);
  assert.match(retried.sources[1].questionUrl,/corrected/);
  // 再度同じ年度を指定しても二重登録にしない。
  const duplicate = await startJob(store,id,[source(2024)],4000,{persistent:true});
  assert.equal(duplicate.sources.length,3);
  assert.equal((await readJob(store,id)).sources.length,3);
  // 全件失敗でも次の年度の添付時に過去の失敗記録が消えない。
  const failAll = await readJob(store,id);
  failAll.state='failed';
  failAll.sources.forEach(s => { s.status='failed'; s.reason='PDF_PARSE_FAILED'; });
  await store.put('job/' + encodeURIComponent(id), JSON.stringify(failAll));
  const afterFailure = await startJob(store,id,[source(2025)],5000,{persistent:true});
  assert.deepEqual(afterFailure.sources.map(s=>s.year),[2020,2023,2024,2025]);
  assert.equal(afterFailure.sources[0].reason,'PDF_PARSE_FAILED');
  assert.equal(afterFailure.sources[3].status,'pending');
});
