/**
 * 本人が添付済みの測量士補問題・正答を、GCPに保持したPDF原本から再解析する。
 * 28問すべての原本・正答・画像の照合に成功した年度だけ _shared に永続登録。
 * 失敗した年度の旧キャッシュは削除・上書きしない。
 * GCP Actions 用。本人の問題本文や学習記録はログに出さない。
 */
import { GcpStore } from '../src/gcp-store.js';
import { readJob, validateResult } from '../src/ingest.js';
import { httpParser } from '../src/parser-client.js';
import { writeResult, readResult } from '../src/cache.js';
import { officialLibrary } from '../src/official-library.js';
import { CATALOG } from '../src/catalog.js';

const parserVersion = '0.8.2';
const jobId = process.env.SURVEYOR_IMPORT_JOB;
const endpoint = process.env.PARSER_URL;
const token = process.env.PARSER_TOKEN;
if (!jobId || !endpoint || !token) throw new Error('IMPORT_CONFIGURATION_MISSING');
const store = new GcpStore({ bucket: 'qualification-learning-qlp-figures' });
const job = await readJob(store, jobId);
if (!job) throw new Error('IMPORT_JOB_NOT_FOUND');
const parse = httpParser({ endpoint, token, timeoutMs: 900000 });
const updated = [];
for (const source of job.sources ?? []) {
  if (![2022, 2023, 2024, 2025].includes(source.year) || source.section !== 'main') continue;
  const k = source.keyParts;
  if (!k?.questionSha256 || !k?.answerSha256) throw new Error(`SOURCE_HASH_MISSING:${source.year}`);
  const questionStored = await store.get(`att/${k.questionSha256}.pdf`, 'arrayBuffer');
  const answerStored = await store.get(`att/${k.answerSha256}.pdf`, 'arrayBuffer');
  if (!questionStored || !answerStored) {
    console.log(`YEAR_${source.year}_NOT_IMPORTED:PDF_SOURCE_MISSING`);
    continue;
  }
  const src = {
    qualificationId: 'q063', adapter: 'surveyor', year: source.year, section: 'main',
    questionUrl: source.questionUrl, answerUrl: source.answerUrl,
  };
  const parsed = await parse({
    ...src,
    question: { url: src.questionUrl, sha256: k.questionSha256, bytes: new Uint8Array(questionStored) },
    answer: { url: src.answerUrl, sha256: k.answerSha256, bytes: new Uint8Array(answerStored) },
  });
  const checked = await validateResult(src, {question: k.questionSha256, answer: k.answerSha256},
    parserVersion, parsed.result, parsed.assets);
  const complete = checked.status === 'ready' && checked.packetCount === 28 &&
    checked.excluded.length === 0 &&
    checked.packets.every(p => p.figures?.length ||
      (p.stemMode === 'text' && p.choiceMode === 'text' && p.verification?.visual === 'question_level_pdf_graphics_checked'));
  if (!complete) {
    console.log(`YEAR_${source.year}_NOT_IMPORTED:${JSON.stringify({count:checked.packetCount,
      excluded:checked.excluded.map(e=>({number:e.questionNumber,reason:e.reason})),
      missingVisual:checked.packets.filter(p=>!p.figures?.length && p.stemMode !== 'text').map(p=>p.questionNumber)})}`);
    continue;
  }
  const sharedKey = { qualificationId:'q063',year:source.year,section:'main',
    questionSha256:k.questionSha256,answerSha256:k.answerSha256,parserVersion,owner:'_shared' };
  await writeResult(store, sharedKey, checked, parsed.assets, Date.now());
  const saved = await readResult(store,sharedKey,Date.now());
  if (!saved.hit || saved.result?.packetCount !== 28) throw new Error(`YEAR_${source.year}_SAVE_UNVERIFIED`);
  updated.push(source.year);
  console.log(`YEAR_${source.year}_IMPORTED:28`);
}
const lib = await officialLibrary(store, CATALOG.surveyor, parserVersion, Date.now());
console.log('SURVEYOR_SHARED_LIBRARY',JSON.stringify({
  updated,stored:lib.stored,missing:lib.missing,totalQuestions:lib.totalQuestions,
}));
