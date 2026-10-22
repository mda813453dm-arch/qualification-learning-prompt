/**
 * 本人が添付済みの測量士補問題・正答を、GCPに保持したPDF原本から再解析する。
 * 28問すべての原本・正答・画像の照合に成功した年度だけ _shared に永続登録。
 * 失敗した年度の旧キャッシュは削除・上書きしない。
 * GCP Actions 用。本人の問題本文や学習記録はログに出さない。
 */
import { GcpStore } from '../src/gcp-store.js';
import { readJob, validateResult } from '../src/ingest.js';
import { httpParser } from '../src/parser-client.js';
import { writeResult, readResult, readFigure } from '../src/cache.js';
import { officialLibrary } from '../src/official-library.js';
import { CATALOG } from '../src/catalog.js';
import { sha256Hex } from '../src/store.js';

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
for (const source of [...(job.sources ?? [])].sort((a,b)=>a.year-b.year)) {
  if (![2022, 2023, 2024, 2025, 2026].includes(source.year) || source.section !== 'main') continue;
  try {
  const k = source.keyParts;
  if (!k?.questionSha256 || !k?.answerSha256) throw new Error(`SOURCE_HASH_MISSING:${source.year}`);
  // 2026年度は公式サイトからPDFを再取得できないことがある。
  // 本人の取り込み時に同じ公式原本SHA・同じ検証器で28問照合済みなら、
  // その検証済みパケットと保存済み公式画像を共有へ複製できる。
  // 全画像を照合できない場合や旧版パケットは流用しない。
  if (source.year === 2026 && k.parserVersion === parserVersion) {
    const previous = await readResult(store, k, Date.now());
    const v = previous.result;
    const completePrior = previous.hit && v?.status === 'ready' && v.packetCount === 28 &&
      v.excluded?.length === 0 && v.packets?.length === 28 &&
      v.packets.every(p => p.figures?.length ||
        (p.diagramRequired === false && ['text','ocr'].includes(p.stemMode) &&
          ['text','ocr'].includes(p.choiceMode) &&
          p.verification?.visual === 'question_level_pdf_graphics_checked'));
    if (completePrior) {
      const originalFiles = new Set(v.packets.flatMap(p =>
        (p.figures || []).flatMap(f => f.svgFile ? [f.file, f.svgFile] : [f.file])));
      const assets = {};
      for (const f of originalFiles) {
        if (!f) throw new Error('SOURCE_ASSET_NAME_MISSING');
        const b = await readFigure(store, k.questionSha256, parserVersion, f, k.owner);
        if (!b) throw new Error(`SOURCE_ASSET_MISSING:${f}`);
        assets[f] = new Uint8Array(b);
      }
      const sharedKey = { ...k, owner:'_shared' };
      await writeResult(store,sharedKey,v,assets,Date.now());
      const saved = await readResult(store,sharedKey,Date.now());
      if (!saved.hit || saved.result?.packetCount !== 28) throw new Error('YEAR_2026_SAVE_UNVERIFIED');
      updated.push(source.year);
      console.log('YEAR_2026_IMPORTED:28:VERIFIED_EXISTING_OFFICIAL_CACHE');
      continue;
    }
  }
  let questionStored = await store.get(`att/${k.questionSha256}.pdf`, 'arrayBuffer');
  let answerStored = await store.get(`att/${k.answerSha256}.pdf`, 'arrayBuffer');
  // 2026年度の問題は添付されていないため、既に照合した公式URLだけを試す。
  // 取得不能やSHA不一致なら共有登録を見送り、既存キャッシュは変更しない。
  if (source.year === 2026 && (!questionStored || !answerStored)) {
    const get = async (url,sha) => {
      const res = await fetch(url,{signal:AbortSignal.timeout(60000)});
      if (!res.ok) throw new Error(`OFFICIAL_PDF_HTTP_${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (await sha256Hex(bytes) !== sha) throw new Error('OFFICIAL_PDF_SHA_MISMATCH');
      return bytes.buffer;
    };
    questionStored ||= await get(source.questionUrl,k.questionSha256);
    answerStored ||= await get(source.answerUrl,k.answerSha256);
  }
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
  } catch (error) {
    console.log(`YEAR_${source.year}_NOT_IMPORTED:${error?.code || error?.message || 'UNKNOWN'}`);
  }
}
const lib = await officialLibrary(store, CATALOG.surveyor, parserVersion, Date.now());
console.log('SURVEYOR_SHARED_LIBRARY',JSON.stringify({
  updated,stored:lib.stored,missing:lib.missing,totalQuestions:lib.totalQuestions,
}));
if (lib.totalQuestions !== 140) process.exitCode = 1;
