/**
 * 公式の原本SHAが確定した土地家屋調査士（2022〜2025、午前・午後択一）
 * を1回だけ共有ライブラリへ取り込む。
 *
 * --dry-run : GitHub Actions が公開元から取得→原本SHA→Python解析→
 *             Node固定正答検査をすべて実施。Googleに書き込まない。
 * --commit  : 承認済み要求からだけ実行。Cloud Storage/Firestoreに
 *             _shared の解析結果と公式図を永続保存（個人の学習記録は触らない）。
 *
 * 公式PDF本体は GitHub にコミットしない。出力も保存しない。
 */
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore, sha256Hex } from '../src/store.js';
import { GcpStore } from '../src/gcp-store.js';
import { ingestSource } from '../src/ingest.js';
import { officialLibrary } from '../src/official-library.js';

const execFile = promisify(execFileCallback);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PARSER_DIR = join(ROOT, 'parser');
const cat = CATALOG.land_surveyor;
const MOJ = 'https://www.moj.go.jp/content/';
const PV = '0.8.2';
const mode = process.argv[2];
if (!['--dry-run', '--commit'].includes(mode)) throw new Error('SPECIFY_DRY_RUN_OR_COMMIT');
const commit = mode === '--commit';
// 実際のPDFと正答SHAを全年度照合できた承認済みジョブだけで、旧「画像一枚」の共有データを置き換える。
const textUpgrade = process.env.QLP_LAND_SURVEYOR_TEXT_UPGRADE === 'YES';
if (textUpgrade && (!commit || process.env.QLP_IMPORT_APPROVED !== 'YES')) {
  throw new Error('VERIFIED_TEXT_UPGRADE_REQUIRES_APPROVED_SHARED_IMPORT');
}
if (commit && (process.env.QLP_IMPORT_APPROVED !== 'YES' ||
    process.env.GOOGLE_CLOUD_PROJECT !== 'qualification-learning' ||
    process.env.QLP_IMPORT_ENV !== 'official-shared-only')) {
  throw new Error('PRODUCTION_IMPORT_APPROVAL_REQUIRED');
}
const work = await mkdtemp(join(tmpdir(), 'qlp-moj-share-'));
const pins = new Map();
for (const year of cat.validatedUploadYears) {
  const p = cat.officialPdfPins[year];
  assert(p, 'MISSING_OFFICIAL_PINS');
  pins.set(year, p);
}
const officialFile = (sha) => {
  for (const [year, p] of pins) {
    if (sha === p['午前の部']) return { name: ({2022:'001383834',2023:'001408935',2024:'001427201',2025:'001450010'})[year]+'.pdf', year, section:'午前の部' };
    if (sha === p['午後の部']) return { name: ({2022:'001383847',2023:'001408936',2024:'001427202',2025:'001450011'})[year]+'.pdf', year, section:'午後の部' };
    if (sha === p.answer) return { name: ({2022:'001383828',2023:'001406404',2024:'001427198',2025:'001450015'})[year]+'.pdf', year, section:'正答' };
  }
  throw new Error('UNKNOWN_PIN');
};
const saved = new Map();
const allFiles = [...pins.values()].flatMap((p) => [p['午前の部'], p['午後の部'], p.answer]);
const run = async (command, args, opts = {}) => execFile(command, args, { maxBuffer: 10*1024*1024, ...opts });

async function parseOfficial(input) {
  const p = pins.get(input.year);
  const expectedCount = cat.uploadQuestionCounts[input.section];
  if (!p || !expectedCount || input.question.sha256 !== p[input.section] ||
      input.answer.sha256 !== p.answer) throw new Error('SOURCE_PIN_MISMATCH');
  const assetsDir = await mkdtemp(join(work, 'figures-'));
  try {
    const q = officialFile(input.question.sha256);
    const a = officialFile(input.answer.sha256);
    const args = ['-m','qlp_parser.cli', '--adapter','land_surveyor',
      '--year',String(input.year),'--section',input.section,
      '--question-pdf',join(work,q.name),'--question-url',input.question.url,
      '--question-sha256',input.question.sha256,
      '--answer-pdf',join(work,a.name),'--answer-url',input.answer.url,
      '--answer-sha256',input.answer.sha256,'--assets-dir',assetsDir];
    const { stdout } = await run('python3',args,{
      env: { ...process.env, PYTHONPATH: [PARSER_DIR,process.env.PYTHONPATH].filter(Boolean).join(':') },
      timeout: 420000,
    });
    const result = JSON.parse(stdout);
    if (result.status !== 'ready' || result.packetCount !== expectedCount ||
        (result.excluded ?? []).length || result.packets?.length !== expectedCount ||
        result.packets.some((x) => !((x.figures || []).length ||
          (x.stemMode === 'text' && x.choiceMode === 'text' &&
           x.diagramRequired === false && x.verification?.visual === 'question_level_pdf_graphics_checked')))) {
      throw new Error('OFFICIAL_QUESTIONS_INCOMPLETE');
    }
    const assets = {};
    for (const file of await readdir(assetsDir)) assets[file] = new Uint8Array(await readFile(join(assetsDir,file)));
    return { result, assets };
  } finally {
    await rm(assetsDir, { recursive:true, force:true });
  }
}

try {
  // まず12件全部を取得し、ユーザーが確認済みのSHAが一致することを検証。
  // 一件でも差し替わっていれば書き込む前に停止する。
  for (const sha of allFiles) {
    const info = officialFile(sha);
    const dest = join(work, info.name);
    await run('curl',['--fail','--silent','--show-error','--location',
      '--max-time','45','--retry','2',
      '--header','User-Agent: Mozilla/5.0 (compatible; qualification-learning-verify/1.0)',
      '--output',dest,MOJ+info.name],{timeout:110000});
    const bytes = new Uint8Array(await readFile(dest));
    assert.equal(await sha256Hex(bytes),sha,'SOURCE_PDF_CHANGED: '+info.name);
    saved.set(MOJ+info.name,bytes);
  }
  console.log('SHA-256 validated for all 12 official PDF files');
  const store = commit ? new GcpStore({bucket:'qualification-learning-qlp-figures'}) : new MemoryStore();
  const before = await officialLibrary(store,cat,PV,Date.now());
  const wanted = cat.validatedUploadYears.slice().sort((a,b)=>b-a).flatMap((year)=>
    cat.uploadSections.map((section)=>({year,section})));
  const present = new Set(before.stored.map((x)=>x.year+':'+x.section));
  const fetchPdf = async (url) => {
    if (!saved.has(url)) throw new Error('SOURCE_NOT_IN_VERIFIED_LOCAL_PDFS');
    return saved.get(url);
  };
  for (const {year,section} of wanted) {
    const key = year+':'+section;
    if (present.has(key) && !textUpgrade) { console.log(year, section, 'already shared; reused'); continue; }
    const q = officialFile(pins.get(year)[section]);
    const a = officialFile(pins.get(year).answer);
    const now = Date.now();
    const src = { qualificationId:'land_surveyor', adapter:'land_surveyor', year,
      section, questionUrl:MOJ+q.name, answerUrl:MOJ+a.name, owner:'_shared' };
    const response = await ingestSource(src,{
      store, fetchPdf, parse:parseOfficial, parserVersion:PV, now,
      forceReparseVerifiedLand:textUpgrade,
    });
    assert.equal(response.result.status,'ready');
    assert.equal(response.result.packetCount,cat.uploadQuestionCounts[section]);
    if (textUpgrade && year === 2025 && section === '午前の部') {
      const first = response.result.packets.find(p => p.questionNumber === 1);
      if (!first || first.stemMode !== 'text' || first.choiceMode !== 'text' ||
          first.figures?.length || !first.stem.includes('トータルステーション') ||
          first.choices?.length !== 5) {
        throw new Error('MORNING_2025_Q1_TEXT_NOT_VERIFIED');
      }
    }
    const textCount = response.result.packets.filter(p => p.stemMode === 'text' && p.choiceMode === 'text').length;
    console.log(year,section,response.result.packetCount,'verifiedText='+textCount,commit?'saved':'verified only');
  }
  const after = await officialLibrary(store,cat,PV,Date.now());
  assert.equal(after.stored.length,8,'SHARED_SECTIONS_INCOMPLETE');
  assert.equal(after.totalQuestions,120,'SHARED_QUESTIONS_INCOMPLETE');
  assert.deepEqual(after.missing,[],'UNSAVED_SECTIONS_REMAIN');
  console.log('ALL 8 sections, 120 official questions verified',commit?'and persisted in shared library':'WITHOUT ANY PRODUCTION WRITES');
} finally {
  await rm(work,{recursive:true,force:true});
}
