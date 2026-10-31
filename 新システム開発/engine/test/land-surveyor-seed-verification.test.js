import test from 'node:test';
import assert from 'node:assert/strict';

const TARGETS = new Map([
  ['2015:午前の部', 10], ['2015:午後の部', 20],
  ['2017:午前の部', 10], ['2017:午後の部', 20],
  ['2018:午前の部', 10], ['2018:午後の部', 20],
  ['2019:午後の部', 20], ['2021:午後の部', 20],
]);

let runNumber = 0;
async function runVerification(sources) {
  const originalFetch = globalThis.fetch;
  const originalExit = process.exit;
  const priorBase = process.env.QLP_BASE_URL;
  const priorToken = process.env.QLP_TEST_TOKEN;
  let calls = 0;
  process.env.QLP_BASE_URL = 'https://engine.example';
  process.env.QLP_TEST_TOKEN = 'unit-test-token';
  globalThis.fetch = async (resource, options) => {
    calls++;
    const path = new URL(resource).pathname;
    if (path === '/v1/admin/seed-land-surveyor-archive' && options.method === 'POST')
      return new Response(JSON.stringify({status: 'archivedSharedImportQueued', requestedSections: 8}), {status: 200});
    if (path === '/v1/jobs/land_surveyor%7E_archive_shared' || path === '/v1/jobs/land_surveyor~_archive_shared')
      return new Response(JSON.stringify({job: {sources}}), {status: 200});
    throw Error('UNEXPECTED_ENDPOINT_' + path);
  };
  process.exit = code => { const e = new Error('SEED_SCRIPT_EXIT'); e.exitCode = code; throw e; };
  let failure = null;
  try {
    const suffix = '?run=' + (++runNumber);
    await import(new URL('../../deploy/seed-land-surveyor-archive.mjs' + suffix, import.meta.url).href);
  } catch (e) {
    failure = e;
  } finally {
    process.exit = originalExit;
    globalThis.fetch = originalFetch;
    if (priorBase === undefined) delete process.env.QLP_BASE_URL;
    else process.env.QLP_BASE_URL = priorBase;
    if (priorToken === undefined) delete process.env.QLP_TEST_TOKEN;
    else process.env.QLP_TEST_TOKEN = priorToken;
  }
  assert.ok(calls >= 2, 'source registration and status query both ran');
  return failure;
}

test('旧年度8区分の検証は既存2022〜2025年度8区分を数えず130問を正しく確認する', async () => {
  const archive = [...TARGETS].map(([key, count]) => {
    const [year, section] = key.split(':');
    return {year:Number(year),section,status:'done',packetCount:count,excludedCount:0};
  });
  const prior = [2022,2023,2024,2025].flatMap(year =>
    ['午前の部','午後の部'].map(section=>({
      year, section, status:'done', packetCount: section==='午前の部'?10:20, excludedCount:0,
    })));
  const failure = await runVerification([...prior,...archive]);
  assert.equal(failure?.exitCode,0,'8 verified archives plus 8 preexisting library rows must succeed');
});

test('旧年度の不足または二重登録があると既存年度に惑わされず失敗させる',async()=>{
  const archive=[...TARGETS].map(([key,count])=>{
    const [year,section]=key.split(':');
    return {year:Number(year),section,status:'done',packetCount:count,excludedCount:0};
  });
  const missing = await runVerification(archive.slice(1));
  assert.match(String(missing?.message),/ARCHIVE_SEED_TARGETS_MISSING_OR_DUPLICATE/);
  const doubled = await runVerification([...archive,archive[0]]);
  assert.match(String(doubled?.message),/ARCHIVE_SEED_TARGETS_MISSING_OR_DUPLICATE/);
});
