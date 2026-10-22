/**
 * IPAから公開されたITパスポート問題・正答の原本を、ユーザー提供SHAで厳格に固定し
 * Vision OCRによる原本画像付き100問が完全な区分だけ共通ライブラリに登録する。
 * 未検証・欠落・重複した区分は一切登録しない。既存のユーザーデータに触れない。
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
const index = Number(process.argv[2]);
assert(Number.isInteger(index) && index >= 0 && index < 15, 'APPROVED_SOURCE_INDEX_ONLY');
assert.equal(process.argv[3], '--commit', 'COMMIT_SWITCH_REQUIRED');
assert.equal(process.env.QLP_IMPORT_APPROVED, 'YES', 'USER_APPROVAL_REQUIRED');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
assert.equal(process.env.QLP_IMPORT_ENV, 'official-shared-only', 'ENV_MISMATCH');
assert.equal(process.env.QLP_OCR, 'vision', 'VISION_REQUIRED');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(join(root,'engine/intake/itpass-official-pdf-pins-2026-10-22.json'), 'utf8'));
const s = manifest.sources[index];
const spec = CATALOG.itpass.officialShared;
const pin = spec.officialPdfPins[s.year];
assert.equal(pin[s.section], s.questionSha256, 'QUESTION_SHA_NOT_PINNED');
assert.equal(pin.answers?.[s.section], s.answerSha256, 'ANSWER_SHA_NOT_PINNED');
assert.equal(s.expectedCount, 100);
const store = new GcpStore({ bucket:'qualification-learning-qlp-figures' });
const sha256 = (b) => createHash('sha256').update(Buffer.from(b)).digest('hex');
const readPdf = async (sha) => {
  const raw = await store.get('att/'+sha+'.pdf','arrayBuffer');
  assert(raw?.byteLength > 500, 'PDF_NOT_ARCHIVED');
  const bytes = Buffer.from(raw);
  assert.equal(sha256(bytes),sha,'ARCHIVED_PDF_HASH_MISMATCH');
  return bytes;
};
const work = await mkdtemp(join(tmpdir(),'qlp-itpass-shared-'));
try {
  const question = await readPdf(s.questionSha256);
  const answer = await readPdf(s.answerSha256);
  const qpath = join(work,'question.pdf'), apath = join(work,'answer.pdf');
  await writeFile(qpath,question);
  await writeFile(apath,answer);
  const assetsDir = join(work,'assets');
  const args = ['-m','qlp_parser.cli','--adapter','itpass','--year',String(s.year),
    '--section',s.section,'--question-pdf',qpath,'--question-sha256',s.questionSha256,
    '--answer-pdf',apath,'--answer-sha256',s.answerSha256,'--assets-dir',assetsDir];
  let stdout;
  try {
    ({stdout} = await execFile('python3',args,{env:{...process.env,PYTHONPATH:join(root,'parser')},
      timeout:1800000,maxBuffer:120*1024*1024}));
  } catch (e) {
    if (!e.stdout) throw e;
    stdout=e.stdout;
  }
  const parsed=JSON.parse(stdout);
  console.log('ITPASS_PARSED',s.year,s.section,parsed.status,parsed.packetCount,
    'excluded',parsed.excluded?.length ?? 0);
  assert.equal(parsed.status,'ready','PARSER_PARTIAL_NO_SHARED_WRITE');
  assert.equal(parsed.packetCount,100,'INCOMPLETE_EXAM_NO_SHARED_WRITE');
  assert.deepEqual(parsed.excluded,[],'EXCLUDED_QUESTIONS_NO_SHARED_WRITE');
  assert.deepEqual(parsed.packets.map(p=>p.questionNumber),Array.from({length:100},(_,k)=>k+1));
  assert(parsed.packets.every(p=>p.fieldId && p.choices.length===4 &&
      Number.isInteger(p.correctAnswer) && p.correctAnswer>=1 && p.correctAnswer<=4 &&
      p.figures?.length>0),'SOURCE_QUESTIONS_OR_ANSWERS_UNVERIFIED');
  const assets={};
  for (const name of await readdir(assetsDir)) assets[name] = new Uint8Array(await readFile(join(assetsDir,name)));
  const source={qualificationId:'q006',adapter:'itpass',year:s.year,section:s.section,
    questionUrl:null,answerUrl:null,owner:'_shared'};
  const validated = await validateResult(source,{question:s.questionSha256,answer:s.answerSha256},'0.8.2',parsed,assets);
  assert.equal(validated.status,'ready','VALIDATED_RESULT_NOT_READY');
  assert.equal(validated.packetCount,100,'VALIDATION_EXCLUDED_QUESTIONS');
  assert.deepEqual(validated.excluded,[]);
  const key={qualificationId:'q006',year:s.year,section:s.section,
    questionSha256:s.questionSha256,answerSha256:s.answerSha256,parserVersion:'0.8.2',owner:'_shared'};
  const old=await readResult(store,key,Date.now());
  if(old.hit && old.result?.status==='ready' && old.result?.packetCount===100) {
    console.log('ITPASS_ALREADY_SHARED',s.year,s.section);
  } else {
    await writeResult(store,key,validated,assets,Date.now());
    console.log('ITPASS_WRITTEN_SHARED',s.year,s.section);
  }
  const again=await readResult(store,key,Date.now());
  assert.equal(again.result?.status,'ready');
  assert.equal(again.result?.packets?.length,100);
  assert.deepEqual(again.result.packets.map(p=>p.questionNumber),Array.from({length:100},(_,k)=>k+1));
  for(const p of again.result.packets) {
    for(const fig of p.figures||[]) {
      const b=await readFigure(store,s.questionSha256,'0.8.2',fig.file,'_shared');
      assert(b?.byteLength,'FIGURE_MISSING_'+p.questionNumber);
      assert.equal(sha256(b),fig.sha256,'FIGURE_HASH_MISMATCH_'+p.questionNumber);
    }
  }
  console.log('SHARED_ITPASS_YEAR_READBACK_OK',s.year,s.section,'questions=100');
} finally {
  await rm(work,{recursive:true,force:true});
}
