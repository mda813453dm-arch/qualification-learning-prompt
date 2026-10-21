/** 共有保存済み宅建公式PDFを年度別に読み込み、分解品質を検査する。書き込み先はCIの一時領域だけ。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GcpStore } from '../src/gcp-store.js';
const execFile = promisify(_execFile);
const index = Number(process.argv[2]);
assert(Number.isInteger(index) && index >= 0 && index < 12, 'FILE_INDEX_REQUIRED');
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(join(appRoot, 'deploy/takken-upload-manifest-20261022.json'), 'utf8'));
const file = manifest.files[index];
const cloud = new GcpStore({ bucket: 'qualification-learning-qlp-figures' });
const raw = await cloud.get(`att/${file.sha256}.pdf`, 'arrayBuffer');
assert.equal(raw?.byteLength, file.bytes, 'ORIGINAL_NOT_STORED');
const source = Buffer.from(raw);
assert.equal(createHash('sha256').update(source).digest('hex'), file.sha256);
const work = await mkdtemp(join(tmpdir(), 'qlp-takken-inspect-'));
try {
  const pdf = join(work, 'source.pdf');
  await writeFile(pdf, source);
  let stdout;
  try {
    ({ stdout } = await execFile('python3', [
      '-m', 'qlp_parser.cli', '--adapter', 'takken',
      '--year', String(file.year), '--section', file.section,
      '--question-pdf', pdf, '--question-sha256', file.sha256,
    ], { env: { ...process.env, PYTHONPATH: join(appRoot, 'parser') }, timeout: 1800000, maxBuffer: 100 * 1024 * 1024 }));
  } catch (e) {
    if (!e.stdout) throw e;
    stdout = e.stdout;
  }
  const parsed = JSON.parse(stdout);
  const actual = parsed.packets || [];
  const nums = new Set(actual.map(p => p.questionNumber));
  const summary = {
    year: file.year, section: file.section, status: parsed.status,
    packetCount: parsed.packetCount || 0,
    missingNumbers: Array.from({ length: 50 }, (_, i) => i + 1).filter(n => !nums.has(n)),
    excluded: parsed.excluded,
    reasons: parsed.reason ? [parsed.reason] : [],
    modeCounts: actual.reduce((acc, p) => (acc[p.stemMode] = (acc[p.stemMode] || 0) + 1, acc), {}),
    figCount: actual.reduce((n, p) => n + (p.figures?.length || 0), 0),
  };
  console.log('TAKKEN_PARSE_DIAGNOSTIC ' + JSON.stringify(summary));
} finally {
  await rm(work, { recursive: true, force: true });
}
