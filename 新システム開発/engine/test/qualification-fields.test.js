import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { overviewFor } from '../src/app.js';
import qualificationUrlIndex from '../data/qualification-url-index.json' with { type: 'json' };
import qualificationFields from '../data/qualification-fields.json' with { type: 'json' };

test('all 103 qualifications have distinct subject-specific learning fields', () => {
  assert.equal(qualificationUrlIndex.qualifications.length, 103);
  assert.equal(Object.keys(CATALOG).length, 103);
  assert.equal(Object.keys(qualificationFields.entries).length, 91);
  for (const qualification of Object.values(CATALOG)) {
    const subjects = Object.values(qualification.fields);
    assert.ok(subjects.length >= (['fe', 'ap'].includes(qualification.qualificationId) ? 1 : 2), qualification.name);
    assert.equal(new Set(subjects).size, subjects.length, qualification.name);
    assert.ok(subjects.every((name) => name && !name.includes('分野の詳細は未確認')), qualification.name);
    const overview = overviewFor(qualification.qualificationId);
    assert.deepEqual(overview.fields, subjects);
  }
});

test('new qualifications preserve the exact name/ID match and disclose verification', () => {
  for (const item of qualificationUrlIndex.qualifications) {
    const registered = qualificationFields.entries[item.sourceId];
    if (!registered) continue;
    assert.equal(registered.name, item.name);
    assert.ok(['official', 'provisional'].includes(registered.verification));
    const catalog = Object.values(CATALOG).find((c) => c.qualificationId === item.sourceId);
    assert.ok(catalog, item.name);
    assert.equal(catalog.fieldVerification, registered.verification);
    assert.deepEqual(Object.values(catalog.fields), registered.fields);
    assert.ok(!overviewFor(item.sourceId).lines.some((line) => /別リポジトリ|URL台帳/.test(line)));
  }
});

test('nurse subject list follows the confirmed official syllabus rather than a generic field', () => {
  const c = Object.values(CATALOG).find((x) => x.qualificationId === 'q070');
  assert.ok(c);
  assert.equal(c.fieldVerification, 'official');
  assert.equal(Object.keys(c.fields).length, 12);
  for (const f of ['必修問題', '基礎看護学', '成人看護学', '老年看護学', '精神看護学']) {
    assert.ok(Object.values(c.fields).includes(f), f);
  }
});

test('existing special-purpose subject catalogs are retained', () => {
  for (const key of ['takken', 'surveyor', 'land_surveyor', 'mankan', 'itpass', 'chintai']) {
    assert.ok(CATALOG[key], key);
    assert.ok(Object.keys(CATALOG[key].fields).length >= 2, key);
  }
});
