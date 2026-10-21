/**
 * 検証済み宅建50問の区分をGCP共有キャッシュに追加する。
 * 解析に欠落がある区分は一切登録しない。既存の共有問題は保持する。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../src/catalog.js';
import { GcpStore } from '../src/gcp-store.js';
import { validateResult } from '../src/ingest.js';
import { readResult, writeResult, readFigure } from '../src/cache.js';

const execFile = promisify(execFileCallback);
const i = Number(process.argv[2]);
const commit = process.argv[3] === '--commit';
assert([2, 9, 10].includes(i) && commit, 'APPROVED_INDICES_ONLY');
assert.equal(process.env.QLP_IMPORT_APPROVED, 'YES', 'USER_APPROVAL_REQUIRED');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
assert.equal(process.env.QLP_IMPORT_ENV, 'official-shared-only', 'ENV_MISMATCH');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(join(root, 'deploy/takken-upload-manifest-20261022.json'), 'utf8'));
const file = manifest.files[i];
const spec = CATALOG.takken.officialShared;
const pin = spec.officialPdfPins[file.year][file.section];
assert.equal(pin, file.sha256, 'CATALOG_SHA_MISMATCH');
const uris = {
  2018: 'https://www.retio.or.jp/wp-content/uploads/2024/10/H30-q_a.pdf',
  2023: 'https://www.retio.or.jp/wp-content/uploads/2025/03/R5_qestion_answer%E3%80%80.pdf',
  2024: 'https://www.retio.or.jp/wp-content/uploads/2025/03/R6_question_answer.pdf',
};
const url = uris[file.year];
assert(url && file.section === '年度共通');
// 平成30年度公式PDFの「正解番号表」（最終ページ）と独立して照合する。
const official2018 = [
  4,4,3,2,3,1,2,1,3,4,
  2,3,1,4,1,4,4,3,2,4,
  3,1,2,3,1,2,4,1,2,4,
  3,1,4,2,3,3,2,1,4,2,
  3,4,1,2,3,1,2,3,4,3,
];

const store = new GcpStore({ bucket: 'qualification-learning-qlp-figures' });
const raw = await store.get(`att/${pin}.pdf`, 'arrayBuffer');
assert.equal(raw?.byteLength, file.bytes, 'ORIGINAL_NOT_IN_SHARED_GCS');
const bytes = Buffer.from(raw);
assert.equal(createHash('sha256').update(bytes).digest('hex'), pin, 'ORIGINAL_SHA_MISMATCH');
const work = await mkdtemp(join(tmpdir(), 'qlp-takken-seed-'));
try {
  const pdf = join(work, 'official.pdf');
  await writeFile(pdf, bytes);
  const assetsDir = join(work, 'assets');
  const args = ['-m', 'qlp_parser.cli', '--adapter', 'takken',
    '--year', String(file.year), '--section', file.section,
    '--question-pdf', pdf, '--question-url', url,
    '--question-sha256', pin, '--assets-dir', assetsDir];
  let stdout;
  try {
    ({ stdout } = await execFile('python3', args, {
      env: { ...process.env, PYTHONPATH: join(root, 'parser') },
      timeout: 1800000, maxBuffer: 100 * 1024 * 1024,
    }));
  } catch (e) {
    if (!e.stdout) throw e;
    stdout = e.stdout;
  }
  const parsed = JSON.parse(stdout);
  console.log('PARSE_SUMMARY', JSON.stringify({year:file.year,status:parsed.status,count:parsed.packetCount,exclusions:parsed.excluded?.length}));
  assert.equal(parsed.status, 'ready', 'INCOMPLETE_YEAR_NOT_REGISTERED');
  assert.equal(parsed.packetCount, 50, 'YEAR_NOT_50');
  assert.deepEqual(parsed.excluded, [], 'OFFICIAL_EXTRACTION_EXCLUDED_QUESTIONS');
  assert.deepEqual(parsed.packets.map(p => p.questionNumber), Array.from({length:50},(_,n)=>n+1));
  for (const p of parsed.packets) {
    assert.equal(p.choices.length, 4, `CHOICES_INCOMPLETE_${p.questionNumber}`);
    assert(Number.isInteger(p.correctAnswer)&&p.correctAnswer>=1&&p.correctAnswer<=4);
    if (file.year === 2018) assert.equal(p.correctAnswer, official2018[p.questionNumber-1],
      `INDEPENDENT_OFFICIAL_ANSWER_CONFLICT_${p.questionNumber}`);
  }
  const assets = {};
  for (const name of await readdir(assetsDir)) assets[name] = new Uint8Array(await readFile(join(assetsDir, name)));
  const src = {qualificationId:'q041',adapter:'takken',year:file.year,section:file.section,
    questionUrl:url,answerUrl:null,owner:'_shared'};
  const validated = await validateResult(src, {question:pin, answer:pin}, '0.8.2', parsed, assets);
  assert.equal(validated.status,'ready','INGEST_VALIDATION_FAILED');
  assert.equal(validated.packetCount,50);
  assert.deepEqual(validated.excluded,[]);
  const keyParts = {qualificationId:'q041',year:file.year,section:file.section,
    questionSha256:pin,answerSha256:pin,parserVersion:'0.8.2',owner:'_shared'};
  const old = await readResult(store,keyParts,Date.now());
  if (old.hit && old.result?.status==='ready' && old.result?.packetCount===50) {
    console.log(`ALREADY_SHARED_${file.year}`);
  } else {
    await writeResult(store,keyParts,validated,assets,Date.now());
    console.log(`COMMITTED_TAKKEN_${file.year}_50`);
  }
  const again = await readResult(store,keyParts,Date.now());
  assert.equal(again.result?.status,'ready');
  assert.equal(again.result?.packets?.length,50);
  assert.deepEqual(again.result.packets.map(p=>p.questionNumber), Array.from({length:50},(_,n)=>n+1));
  for (const p of again.result.packets) for (const fig of p.figures||[]) {
    const image = await readFigure(store,pin,'0.8.2',fig.file,'_shared');
    assert(image?.byteLength,`MISSING_FIGURE_${p.questionNumber}`);
    assert.equal(createHash('sha256').update(Buffer.from(image)).digest('hex'),fig.sha256,
      `FIGURE_HASH_MISMATCH_${p.questionNumber}`);
  }
  console.log(`SHARED_TAKKEN_YEAR_READBACK_OK year=${file.year} section=${file.section} questions=50`);
} finally {
  await rm(work,{recursive:true,force:true});
}
