/**
 * 2025年度宅建公式50問を、公式PDF原本・正答の固定SHAと照合して共有する。
 * --dry-run: 読取検証だけ（Cloudへの書き込みゼロ）。
 * --commit: 明示承認済みのCIでのみ _shared に永続登録。
 * 1問でも未検証なら全50問を一切登録しない。
 */
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore, sha256Hex } from '../src/store.js';
import { GcpStore } from '../src/gcp-store.js';
import { sourceKey } from '../src/source-store.js';
import { validateResult } from '../src/ingest.js';
import { writeResult } from '../src/cache.js';
import { officialLibrary } from '../src/official-library.js';

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cat = CATALOG.takken;
const spec = cat.officialShared;
const year = 2025;
const section = '年度共通';
const count = 50;
const version = '0.8.2';
const pin = spec.officialPdfPins[year][section];
const url = cat.sources.find(x=>x.year===year&&x.section===section)?.questionUrl;
const mode = process.argv[2];
assert(['--dry-run','--commit'].includes(mode),'SPECIFY_DRY_RUN_OR_COMMIT');
const commit = mode === '--commit';
if (commit && (process.env.QLP_IMPORT_APPROVED !== 'YES' ||
    process.env.GOOGLE_CLOUD_PROJECT !== 'qualification-learning' ||
    process.env.QLP_IMPORT_ENV !== 'official-shared-only')) {
  throw new Error('PRODUCTION_IMPORT_APPROVAL_REQUIRED');
}
assert.match(url,/^https:\/\/www\.retio\.or\.jp\//);
assert.equal(pin,spec.officialPdfPins[year].answer,'TAKKEN_ANSWERS_IN_SAME_OFFICIAL_PDF');
assert.equal(spec.uploadQuestionCounts[section],count);
const work = await mkdtemp(join(tmpdir(),'qlp-takken-share-'));
try {
  const pdf = join(work,'official-2025.pdf');
  // GCP内に本人が以前提供した原本が残っていれば優先。どちらでも同じPINで検査する。
  // --dry-run では外部からの読取以外の書き込みはしない。
  const remote = new GcpStore({bucket:'qualification-learning-qlp-figures'});
  const saved = await remote.get(await sourceKey(url),'arrayBuffer') ||
    await remote.get(`att/${pin}.pdf`,'arrayBuffer');
  if (saved?.byteLength) {
    await writeFile(pdf,new Uint8Array(saved));
    console.log('VERIFIED_SOURCE_CANDIDATE_FROM_EXISTING_STORAGE');
  } else {
    await execFile('curl',['--fail','--silent','--show-error','--location',
      '--max-time','60','--retry','3','--retry-all-errors',
      '--header','User-Agent: Mozilla/5.0 (compatible; qualification-learning-verify/1.0)',
      '--output',pdf,url],{timeout:300000});
    console.log('SOURCE_CANDIDATE_FROM_OFFICIAL_SITE');
  }
  const bytes = new Uint8Array(await readFile(pdf));
  assert.equal(await sha256Hex(bytes),pin,'OFFICIAL_PDF_HASH_MISMATCH');
  const assetsDir = join(work,'assets');
  const args = ['-m','qlp_parser.cli','--adapter','takken','--year',String(year),
    '--section',section,'--question-pdf',pdf,'--question-url',url,
    '--question-sha256',pin,'--assets-dir',assetsDir];
  let stdout;
  try {
    ({stdout} = await execFile('python3',args,{
      env:{...process.env,PYTHONPATH:join(root,'parser')},timeout:600000,maxBuffer:35*1024*1024,
    }));
  } catch (error) {
    if (!error.stdout) throw error;
    stdout = error.stdout;
  }
  const parsed = JSON.parse(stdout);
  console.log('PARSE_SUMMARY',JSON.stringify({status:parsed.status,packetCount:parsed.packetCount,excluded:parsed.excluded}));
  assert.equal(parsed.status,'ready','INCOMPLETE_OFFICIAL_EXTRACTION');
  assert.equal(parsed.packetCount,count,'NOT_50_QUESTIONS');
  assert.equal(parsed.packets.length,count,'NOT_50_PACKETS');
  assert.deepEqual(parsed.excluded,[],'EXCLUDED_QUESTIONS');
  const expectedNumbers = Array.from({length:count},(_,i)=>i+1);
  assert.deepEqual(parsed.packets.map(p=>p.questionNumber).sort((a,b)=>a-b),expectedNumbers,'QUESTION_NUMBER_GAPS');
  const index = JSON.parse(await readFile(join(root,'data/takken-2025-official-source-index.json'),'utf8'));
  assert.equal(index.source.sha256,pin,'OFFICIAL_INDEX_PIN_MISMATCH');
  const answers = new Map(index.questions.map(q=>[q.number,q.answerNumber]));
  for (const q of parsed.packets) {
    assert.equal(q.correctAnswer,answers.get(q.questionNumber),'ANSWER_MISMATCH_'+q.questionNumber);
    assert.equal(q.choices.length,4,'CHOICES_INCOMPLETE_'+q.questionNumber);
  }
  const assets = {};
  for (const file of await readdir(assetsDir)) assets[file] = new Uint8Array(await readFile(join(assetsDir,file)));
  const src = {qualificationId:'q041',adapter:'takken',year,section,questionUrl:url,answerUrl:null,owner:'_shared'};
  const validated = await validateResult(src,{question:pin,answer:pin},version,parsed,assets);
  assert.equal(validated.status,'ready','VALIDATION_NOT_READY');
  assert.equal(validated.packetCount,count,'VALIDATION_REDUCED_QUESTIONS');
  assert.deepEqual(validated.excluded,[],'VALIDATION_EXCLUSIONS');
  const key = {qualificationId:'q041',year,section,questionSha256:pin,answerSha256:pin,
    parserVersion:version,owner:'_shared'};
  const store = commit ? remote : new MemoryStore();
  const before = await officialLibrary(store,cat,version,Date.now());
  if (before.totalQuestions === count) console.log('ALREADY_SHARED; REUSING_50_QUESTIONS');
  else {
    // Cloudへの最初の書き込みは、原本・正答・50問・画像資産の全検査成功後のみ。
    await writeResult(store,key,validated,assets,Date.now());
    console.log(commit?'COMMITTED_50_QUESTIONS':'DRY_RUN_NO_PRODUCTION_WRITES');
  }
  const state = await officialLibrary(store,cat,version,Date.now());
  assert.equal(state.totalQuestions,count,'SHARED_READBACK_NOT_50');
  assert.deepEqual(state.missing,[],'SHARED_READBACK_INCOMPLETE');
  assert.deepEqual(state.completeYears,[year]);
  console.log(commit?'ALL_50_SHARED_AND_READ_BACK':'ALL_50_VERIFIED_WITHOUT_PRODUCTION_WRITES');
} finally {
  await rm(work,{recursive:true,force:true});
}
