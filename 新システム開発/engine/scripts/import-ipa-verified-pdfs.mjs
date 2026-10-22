/** IPA公式ページから確認済みの問題・正答PDF原本を共通ストレージへ保存する。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GcpStore } from '../src/gcp-store.js';
import { sha256Hex } from '../src/store.js';

assert.equal(process.argv[2], '--commit', 'COMMIT_SWITCH_REQUIRED');
assert.equal(process.env.QLP_IPA_IMPORT_APPROVED, 'YES', 'APPROVAL_REQUIRED');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'qualification-learning', 'PROJECT_MISMATCH');
const data = JSON.parse(await readFile(new URL('../data/ipa-official-source-manifest.json', import.meta.url), 'utf8'));
const store = new GcpStore({bucket: 'qualification-learning-qlp-figures'});
const ids = {'基本情報技術者': 'fe', '応用情報技術者': 'ap'};
const outcome = [];
for (const item of data.items) {
  if (!item.sourceVerified) continue;
  const qualification = ids[item.qualification];
  assert(qualification, 'UNEXPECTED_QUALIFICATION');
  assert(new URL(item.questionUrl).hostname === 'www.ipa.go.jp');
  assert(new URL(item.answerUrl).hostname === 'www.ipa.go.jp');
  const section = item.section === '科目A' ? 'a' : item.section === '科目B' ? 'b' : item.section === '秋期午前' ? 'autumn-am' : item.section === '秋期午後' ? 'autumn-pm' : item.section === '春期午前' ? 'spring-am' : item.section === '春期午後' ? 'spring-pm' : null;
  assert(section, 'UNRECOGNIZED_SECTION');
  const base = `ipa/${qualification}/${item.year}/${section}`;
  const saved = {};
  for (const kind of ['question','answer']) {
    const url = kind === 'question' ? item.questionUrl : item.answerUrl;
    const key = `src/${base}/${kind}.pdf`;
    let raw = await store.get(key, 'arrayBuffer');
    let action = 'existing';
    if (!raw) {
      const res = await fetch(url, {signal: AbortSignal.timeout(90000), headers: {'User-Agent': 'QLP-official-PDF-archive/1.0'}});
      if (!res.ok) throw Error(`${base}:${kind}:HTTP_${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.length > 1000 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'INVALID_PDF');
      raw = bytes;
      await store.put(key, bytes);
      action = 'stored';
    }
    const sha256 = await sha256Hex(new Uint8Array(raw));
    const back = await store.get(key, 'arrayBuffer');
    assert(back && await sha256Hex(new Uint8Array(back)) === sha256, 'PDF_READBACK_MISMATCH');
    saved[kind] = {key, sha256, bytes: back.byteLength, url, action};
  }
  const key = `ipa-source/${qualification}/${item.year}/${section}`;
  const row = {qualificationId: qualification, year: item.year, section: item.section,
    status: 'original-pdfs-saved-not-parsed', officialPage: item.officialPage,
    question: saved.question, answer: saved.answer};
  await store.put(key, JSON.stringify(row));
  const back = await store.get(key, 'json');
  assert.deepEqual(back, row, 'MANIFEST_READBACK_MISMATCH');
  outcome.push({qualification, year:item.year, section:item.section,
    question: saved.question.action, answer: saved.answer.action});
  console.log('IPA_SOURCE_SAVED_AND_READBACK_OK', JSON.stringify(outcome.at(-1)));
}
assert.equal(outcome.length, 12, 'VERIFIED_PAIR_COUNT_MISMATCH');
console.log('IPA_VERIFIED_SOURCE_IMPORT_OK', JSON.stringify({pairs:outcome.length, pdfs:outcome.length*2}));
