/** 読取専用：GCP本番の全15区分・1500問が本当に共通保存済みかを独立照合。 */
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { GcpStore } from '../src/gcp-store.js';
import { officialLibrary } from '../src/official-library.js';

assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'qualification-learning');
const store=new GcpStore({bucket:'qualification-learning-qlp-figures'});
const view=await officialLibrary(store,CATALOG.itpass,'0.8.2');
const expected=[
  ...[2016,2017,2018,2019].flatMap(year=>[year+':春期',year+':秋期']),
  ...[2020,2021,2022,2023,2024,2025,2026].map(year=>year+':公開問題'),
].sort();
const observed=view.stored.map(x=>x.year+':'+x.section).sort();
console.log('ITPASS_SHARED_READBACK',JSON.stringify(view));
assert.deepEqual(observed,expected,'MISSING_SHARED_SECTIONS');
assert.deepEqual(view.missing,[],'UNREGISTERED_EXAM');
assert.equal(view.totalQuestions,1500);
assert.equal(view.stored.length,15);
assert(view.stored.every(x=>x.questions===100));
console.log('SHARED_ITPASS_ALL_READBACK_OK sections=15 questions=1500');
