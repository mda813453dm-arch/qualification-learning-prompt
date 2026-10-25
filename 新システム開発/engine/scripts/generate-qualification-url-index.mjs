/**
 * shikaku-kakomon-urls の資格一覧と統合URL台帳から、プラグイン用の軽量索引を生成する。
 * 使用: node scripts/generate-qualification-url-index.mjs [--check]
 * URL台帳は取得先の手がかりであり、原本・正答の検証済み出題データではない。
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(engineRoot, 'data', 'qualification-urls');
const resultFile = path.join(engineRoot, 'data', 'qualification-url-index.json');

function csvRows(filename) {
  const input = readFileSync(filename);
  const source = (filename.endsWith('.gz') ? gunzipSync(input).toString('utf8') : input.toString('utf8')).replace(/^\uFEFF/, '');
  const records = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((v) => v !== '')) records.push(row);
      row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error(`CSV引用符が閉じていません: ${filename}`);
  if (field !== '' || row.length) {
    row.push(field.replace(/\r$/, ''));
    records.push(row);
  }
  const [headers, ...data] = records;
  assert.ok(headers?.length, `CSVヘッダーがありません: ${filename}`);
  return data.map((values, i) => {
    assert.equal(values.length, headers.length, `CSV列数不一致: ${filename}, 行${i + 2}`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j]]));
  });
}

const rawIndex = csvRows(path.join(sourceDir, 'index.csv'));
const rawUrls = csvRows(path.join(sourceDir, 'shikaku_kakomon_urls.csv.gz'));
assert.equal(rawIndex.length, 103, '移行元索引の資格数が変わっています。重複や追加を検証してください。');
assert.equal(new Set(rawIndex.map((x) => x['資格名'])).size, rawIndex.length, '重複資格名があります');
const urlsByName = new Map();
for (const record of rawUrls) {
  const name = record['資格名'];
  if (!urlsByName.has(name)) urlsByName.set(name, []);
  urlsByName.get(name).push(record);
}
assert.deepEqual(new Set(urlsByName.keys()), new Set(rawIndex.map((x) => x['資格名'])), '索引とURL台帳の資格が一致しません');

const qualifications = rawIndex.map((row, i) => {
  const records = urlsByName.get(row['資格名']);
  assert.ok(records?.length, `資格の出典がありません: ${row['資格名']}`);
  const list = records.find((r) => /^https:\/\//.test(r['過去問一覧URL']))?.['過去問一覧URL'] ?? null;
  const org = records.find((r) => r['実施団体'])?.['実施団体'] ?? '未確認';
  const years = [...new Set(records.map((r) => r['年度']).filter((s) => /^\d{4}$/.test(s)))].map(Number).sort((a,b) => b-a);
  return {
    sourceId: `q${String(i + 1).padStart(3, '0')}`,
    name: row['資格名'],
    group: records[0]['分野グループ'],
    type: records[0]['資格種別'],
    organization: org,
    pastExamPage: list,
    urlRecordCount: records.length,
    linkedUrlCount: records.filter((r) => /^https:\/\//.test(r['URL'])).length,
    listedYears: years,
  };
});

const manifest = {
  sourceRepository: 'mda813453dm-arch/shikaku-kakomon-urls',
  sourceFiles: ['index.csv', 'shikaku_kakomon_urls.csv.gz'],
  qualificationCount: qualifications.length,
  urlRecordCount: rawUrls.length,
  linkedUrlCount: qualifications.reduce((sum, q) => sum + q.linkedUrlCount, 0),
  urlVerification: 'NOT_VERIFIED_FOR_QUESTION_GRADING',
  qualifications,
};
const serialized = JSON.stringify(manifest, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(readFileSync(resultFile, 'utf8'), serialized, '資格索引の再生成が必要です');
  process.stdout.write(`資格索引OK: ${qualifications.length}資格／URLレコード${rawUrls.length}件\n`);
} else {
  writeFileSync(resultFile, serialized);
  process.stdout.write(`資格索引生成: ${qualifications.length}資格／URLレコード${rawUrls.length}件\n`);
}
