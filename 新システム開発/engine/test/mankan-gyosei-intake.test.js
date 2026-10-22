import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import { officialLibrary } from '../src/official-library.js';

test('マンション管理士は公式7年度14原本をSHA固定し、保存済みと混同しない', async () => {
  const cat = CATALOG.mankan;
  assert.equal(cat.qualificationId, 'q018');
  assert.equal(cat.shareOnVerifiedUpload, true);
  assert.equal(cat.officialShared.uploadAdapter, 'mankan');
  const years = [2019,2020,2021,2022,2023,2024,2025];
  assert.deepEqual(cat.officialShared.validatedUploadYears, years);
  for (const year of years) {
    const pins = cat.officialShared.officialPdfPins[year];
    assert.match(pins.main,/^[a-f0-9]{64}$/);
    assert.match(pins.answer,/^[a-f0-9]{64}$/);
    assert.notEqual(pins.main,pins.answer);
  }
  const before = await officialLibrary(new MemoryStore(),cat,'0.8.2');
  assert.equal(before.totalQuestions,0);
  assert.equal(before.stored.length,0);
  assert.equal(before.missing.length,7);
});

test('行政書士は未許諾では一切の自動取込・共有を行わず、年度ごとの公式正答HTMLだけを参照可能', () => {
  const cat = CATALOG.gyosei;
  assert.equal(cat.qualificationId, 'q090');
  assert.equal(cat.overviewOnly, true);
  assert.equal(cat.privateLicensedUpload, true);
  assert.equal(cat.shareOnVerifiedUpload, false);
  assert.deepEqual(cat.sharedLibrarySections, []);
  assert.deepEqual(cat.sources, []);
  assert.equal(cat.uploadAdapter, 'gyosei');
  assert.deepEqual(cat.uploadSections, ['年度共通']);
  assert.deepEqual(cat.availableUploadYears, [2020,2021,2022,2023,2024,2025]);
  for (const year of cat.availableUploadYears) {
    const url = new URL(cat.officialAnswerHtml[year]);
    assert.equal(url.protocol,'https:');
    assert.equal(url.hostname,'gyosei-shiken.or.jp');
    assert.equal(url.pathname,`/doc/exam/r${year-2018}ans.html`);
  }
});
