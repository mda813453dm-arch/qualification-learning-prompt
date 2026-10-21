/**
 * 2026-10-22に利用者が提供した宅建公式PDF12本を原本のまま共有GCSへ確保する。
 * GitHubの一時的なGit blob断片を復元し、全ファイルをハッシュ照合してから保存する。
 * これは原本の保存であり、問題データ600問の登録完了を意味しない。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GcpStore } from '../src/gcp-store.js';

const mode = process.argv[2];
assert(['--check-manifest', '--commit'].includes(mode), 'MODE_REQUIRED');
if (mode === '--commit') {
  assert.equal(process.env.QLP_IMPORT_APPROVED, 'YES', 'EXPLICIT_APPROVAL_REQUIRED');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
  assert.equal(process.env.QLP_IMPORT_ENV, 'official-shared-only', 'ENV_MISMATCH');
  assert(process.env.GH_TOKEN, 'GITHUB_TOKEN_REQUIRED');
}
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(await readFile(resolve(appRoot, 'deploy/takken-upload-manifest-20261022.json'), 'utf8'));
assert.equal(manifest.qualificationId, 'q041');
assert.equal(manifest.files?.length, 12, 'EXACTLY_12_DOCUMENTS_REQUIRED');
const expectedSections = new Map(Array.from({ length: 10 }, (_, n) => {
  const year = 2016 + n;
  return [year, year === 2020 || year === 2021 ? ['10月', '12月'] : ['年度共通']];
}));
const seen = new Set();
for (const file of manifest.files) {
  assert(expectedSections.get(file.year)?.includes(file.section), `UNEXPECTED_YEAR_SECTION_${file.year}`);
  const key = `${file.year}:${file.section}`;
  assert(!seen.has(key), `DUPLICATED_SECTION_${key}`);
  seen.add(key);
  assert.match(file.sha256, /^[0-9a-f]{64}$/);
  assert(Number.isSafeInteger(file.bytes) && file.bytes > 1000);
  assert(file.gitBlobs?.length > 0);
  for (const blob of file.gitBlobs) assert.match(blob, /^[0-9a-f]{40}$/);
}
for (const [year, sections] of expectedSections) {
  for (const section of sections) assert(seen.has(`${year}:${section}`), `MISSING_${year}_${section}`);
}
console.log('MANIFEST_VERIFIED 12 source documents, 2016–2025, 600 source question slots');
if (mode === '--check-manifest') process.exit(0);

const repository = process.env.GITHUB_REPOSITORY || 'mda813453dm-arch/qualification-learning-prompt';
assert.equal(repository, 'mda813453dm-arch/qualification-learning-prompt', 'REPOSITORY_MISMATCH');
async function fetchBlob(sha) {
  const url = `https://api.github.com/repos/${repository}/git/blobs/${sha}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${process.env.GH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok) {
      const payload = await response.json();
      assert.equal(payload.sha, sha, 'GIT_BLOB_SHA_MISMATCH');
      assert.equal(payload.encoding, 'base64', 'BLOB_ENCODING_UNEXPECTED');
      const bytes = Buffer.from(payload.content.replace(/\s/g, ''), 'base64');
      assert.equal(bytes.length, payload.size, 'BLOB_SIZE_MISMATCH');
      return bytes;
    }
    if (attempt === 3 || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`GITHUB_BLOB_READ_FAILED_${response.status}_${sha}`);
    }
    await new Promise(done => setTimeout(done, 1000 * (attempt + 1)));
  }
}

// 全原本の復元とSHA256検査が成功するまでは、Cloudに一切書き込まない。
const sources = [];
for (const file of manifest.files) {
  const chunks = [];
  for (const sha of file.gitBlobs) chunks.push(await fetchBlob(sha));
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, file.bytes, `SOURCE_SIZE_MISMATCH_${file.year}_${file.section}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256,
    `SOURCE_SHA256_MISMATCH_${file.year}_${file.section}`);
  assert(bytes.subarray(0, 5).toString('ascii') === '%PDF-', `NOT_A_PDF_${file.year}_${file.section}`);
  sources.push({ file, bytes });
  console.log(`SOURCE_VERIFIED ${file.year}/${file.section} ${file.bytes}B`);
}

const store = new GcpStore({ bucket: 'qualification-learning-qlp-figures' });
let written = 0;
for (const { file, bytes } of sources) {
  const key = `att/${file.sha256}.pdf`;
  const existing = await store.get(key, 'arrayBuffer');
  if (existing?.byteLength) {
    assert.equal(createHash('sha256').update(Buffer.from(existing)).digest('hex'), file.sha256,
      `EXISTING_SOURCE_CORRUPT_${file.year}_${file.section}`);
    console.log(`ALREADY_PRESENT ${file.year}/${file.section}`);
  } else {
    await store.put(key, bytes);
    written++;
    console.log(`SOURCE_STORED ${file.year}/${file.section}`);
  }
}
for (const { file } of sources) {
  const result = await store.get(`att/${file.sha256}.pdf`, 'arrayBuffer');
  assert.equal(result?.byteLength, file.bytes, `CLOUD_READBACK_SIZE_MISMATCH_${file.year}`);
  assert.equal(createHash('sha256').update(Buffer.from(result)).digest('hex'), file.sha256,
    `CLOUD_READBACK_HASH_MISMATCH_${file.year}`);
}
console.log(`RAW_12_PDF_SHARED_SOURCE_STAGED verified=12 new=${written} source_question_slots=600`);
console.log('PARSED_SHARED_QUESTION_REGISTRATION_NOT_YET_CONFIRMED');
