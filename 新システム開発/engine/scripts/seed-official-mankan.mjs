/**
 * マンション管理センターが公開した2019～2025年度のマンション管理士試験
 * （各50問、計350問）を公式原本SHAと正答で検証して共有ライブラリへ保存する。
 *
 * --dry-run: 14原本を検証・解析するだけで共有環境への書き込みはゼロ。
 * --commit : 明示承認マーカーと本番環境変数が一致するときだけ _shared へ保存。
 * 問題・正解PDFのバイナリはGitHubへ保存しない。
 */
import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
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

const run = promisify(execFileCb);
const mode = process.argv[2];
if (!['--dry-run', '--commit'].includes(mode)) throw new Error('SPECIFY_DRY_RUN_OR_COMMIT');
const commit = mode === '--commit';
if (commit && (process.env.QLP_IMPORT_APPROVED !== 'YES' ||
  process.env.QLP_IMPORT_ENV !== 'official-shared-only' ||
  process.env.GOOGLE_CLOUD_PROJECT !== 'qualification-learning')) {
  throw new Error('PRODUCTION_IMPORT_APPROVAL_REQUIRED');
}
const cat = CATALOG.mankan;
const spec = cat.officialShared;
const years = [...spec.validatedUploadYears].sort((a, b) => b - a);
const prefix = 'https://www.mankan.org/pdf/';
const VERSION = '0.8.2';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PARSER = join(ROOT, 'parser');
// 実際の公式掲載リンク（2026-10-22確認）。連番規則から推測しない。
const original = [
  [2025, 'R7_shiken.pdf', 'R7_answer.pdf'],
  [2024, 'R6_shiken.pdf', 'R6_answer.pdf'],
  [2023, 'R5_shiken.pdf', 'R5_answer.pdf'],
  [2022, 'R4_shiken.pdf', 'R04_answer.pdf'],
  [2021, 'R3_shiken.pdf', 'R03_answer.pdf'],
  [2020, 'R2_shiken.pdf', 'R2_answer2.pdf'],
  [2019, 'R01_shiken.pdf', 'R01_answer.pdf'],
];
assert.deepEqual(original.map(([year]) => year), years, 'OFFICIAL_YEAR_SET_MISMATCH');
const work = await mkdtemp(join(tmpdir(), 'qlp-mankan-share-'));
const verified = new Map();

async function parseOfficial(input) {
  const pin = spec.officialPdfPins[input.year];
  if (!pin || input.section !== 'main' ||
    input.question.sha256 !== pin.main || input.answer.sha256 !== pin.answer) {
    throw new Error('SOURCE_PIN_MISMATCH');
  }
  const row = original.find(([year]) => year === input.year);
  const assetsDir = await mkdtemp(join(work, 'figures-'));
  try {
    const args = ['-m', 'qlp_parser.cli',
      '--adapter', 'mankan', '--year', String(input.year),
      '--section', 'main',
      '--question-pdf', join(work, row[1]),
      '--question-url', input.question.url,
      '--question-sha256', input.question.sha256,
      '--answer-pdf', join(work, row[2]),
      '--answer-url', input.answer.url,
      '--answer-sha256', input.answer.sha256,
      '--assets-dir', assetsDir];
    const { stdout } = await run('python3', args, {
      env: { ...process.env, PYTHONPATH: [PARSER, process.env.PYTHONPATH].filter(Boolean).join(':') },
      timeout: 420000, maxBuffer: 12 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    assert.equal(result.status, 'ready', 'INCOMPLETE_YEAR_' + input.year);
    assert.equal(result.packetCount, 50, 'QUESTION_COUNT_' + input.year);
    assert.equal(result.packets.length, 50, 'PACKET_COUNT_' + input.year);
    assert.deepEqual(result.excluded, [], 'EXCLUDED_QUESTION_' + input.year);
    assert.deepEqual(result.packets.map((p) => p.questionNumber), Array.from({length: 50}, (_, i) => i + 1),
      'QUESTION_NUMBERS_' + input.year);
    assert(result.packets.every((p) =>
      (p.acceptedAnswers?.length || 1) >= 1 &&
      (p.diagramRequired ? p.figures.length > 0 : true) &&
      p.verification?.answer === 'same_year_official_answer_checked'),
      'ANSWER_OR_FIGURE_INVALID_' + input.year);
    // 表を画像で示す例外3問は、必ず問題の位置に本物のPNGが必要。
    const imageQuestion = ({2024: 24, 2022: 50, 2020: 3})[input.year];
    if (imageQuestion) assert(result.packets.find((p) => p.questionNumber === imageQuestion)?.figures.length,
      'TABLE_IMAGE_MISSING_' + input.year);
    const assets = {};
    for (const f of await readdir(assetsDir)) assets[f] = new Uint8Array(await readFile(join(assetsDir, f)));
    return { result, assets };
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
}

try {
  // すべての原本SHAを先に照合してから、共有保存の書き込みを開始。
  for (const [year, question, answer] of original) {
    for (const [kind, file] of [['main', question], ['answer', answer]]) {
      const destination = join(work, file);
      const offline = !commit && process.env.QLP_MANKAN_LOCAL_DIR;
      if (offline) {
        const bytes = new Uint8Array(await readFile(join(process.env.QLP_MANKAN_LOCAL_DIR, file)));
        verified.set(prefix + file, bytes);
      } else {
        await run('curl', ['--fail', '--silent', '--show-error', '--location',
          '--max-time', '55', '--retry', '2',
          '--header', 'User-Agent: Mozilla/5.0 (compatible; qualification-learning-verify/1.0)',
          '--output', destination, prefix + file], { timeout: 130000 });
        verified.set(prefix + file, new Uint8Array(await readFile(destination)));
      }
      const bytes = verified.get(prefix + file);
      const expected = spec.officialPdfPins[year][kind];
      assert.equal(await sha256Hex(bytes), expected, 'SOURCE_PDF_CHANGED_' + year + '_' + kind);
      // Python解析器は作業場所のパスを使うため、ローカル検証時にも一時領域へ書く。
      if (offline) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(destination, bytes);
      }
    }
  }
  console.log('ALL 14 OFFICIAL MAN-KAN PDF SHA-256 VERIFIED');
  const store = commit ? new GcpStore({ bucket: 'qualification-learning-qlp-figures' }) : new MemoryStore();
  const before = await officialLibrary(store, cat, VERSION, Date.now());
  const present = new Set(before.stored.map((x) => x.year));
  const fetchPdf = async (url) => {
    if (!verified.has(url)) throw new Error('SOURCE_NOT_VERIFIED');
    return verified.get(url);
  };
  for (const [year, question, answer] of original) {
    if (present.has(year)) {
      console.log(year, 'already shared; reused');
      continue;
    }
    const source = {
      qualificationId: cat.qualificationId, adapter: 'mankan', year, section: 'main',
      questionUrl: prefix + question, answerUrl: prefix + answer, owner: '_shared',
    };
    const response = await ingestSource(source, {
      store, fetchPdf, parse: parseOfficial, parserVersion: VERSION, now: Date.now(),
      forceReparsePartial: true,
    });
    assert.equal(response.result.status, 'ready');
    assert.equal(response.result.packetCount, 50);
    console.log(year, 'verified 50 official questions', commit ? 'saved' : 'dry-run');
  }
  const after = await officialLibrary(store, cat, VERSION, Date.now());
  assert.equal(after.stored.length, 7, 'SHARED_YEARS_INCOMPLETE');
  assert.equal(after.totalQuestions, 350, 'SHARED_QUESTIONS_INCOMPLETE');
  assert.deepEqual(after.missing, [], 'MISSING_OFFICIAL_YEAR');
  console.log('ALL 7 YEARS / 350 QUESTIONS', commit ? 'PERSISTED TO SHARED LIBRARY' : 'VERIFIED WITHOUT PRODUCTION WRITES');
} finally {
  await rm(work, { recursive: true, force: true });
}
