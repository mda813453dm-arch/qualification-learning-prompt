/** 共有ライブラリの実保存を読み戻すだけの全12区分監査。書き込みはしない。 */
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { GcpStore } from '../src/gcp-store.js';
import { officialLibrary } from '../src/official-library.js';

assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
const store = new GcpStore({ bucket: 'qualification-learning-qlp-figures' });
const view = await officialLibrary(store, CATALOG.takken, '0.8.2');
console.log('SHARED_TAKKEN_FULL_LIBRARY_AUDIT', JSON.stringify(view));
const expected = [
  ...[2016,2017,2018,2019,2022,2023,2024,2025].map(year => `${year}:年度共通`),
  '2020:10月', '2020:12月', '2021:10月', '2021:12月',
].sort();
assert.deepEqual(view.stored.map(x=>`${x.year}:${x.section}`).sort(), expected);
assert.deepEqual(view.missing, []);
assert.deepEqual(view.supportedYears, [2025,2024,2023,2022,2021,2020,2019,2018,2017,2016]);
assert.deepEqual(view.completeYears, view.supportedYears);
assert.equal(view.totalQuestions, 600);
assert(view.stored.every(x=>x.questions===50));
console.log('SHARED_TAKKEN_ALL_600_READBACK_OK sections=12 questions=600');
