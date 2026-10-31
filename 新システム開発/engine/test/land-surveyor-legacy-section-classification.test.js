import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG } from '../src/catalog.js';
import { landSectionFromTotalQuestions, legacyLandSectionFromArchivedFileName } from '../src/land-surveyor-archive.js';

const path = new URL('../data/land-surveyor-archive-source-manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(path, 'utf8'));

test('平成19・20年度は11問構成を午前、22問構成を午後として登録する', () => {
  assert.deepEqual(manifest.legacySectionRule.appliesTo, [2007, 2008]);
  for (const year of [2007, 2008]) {
    const record = manifest.years.find((x) => x.year === year);
    assert.ok(record);
    assert.equal(record.legacySourceLabelsReversed, true);
    assert.equal(record.sectionTotalQuestionCounts['午前の部'], 11);
    assert.equal(record.sectionTotalQuestionCounts['午後の部'], 22);
    assert.deepEqual(record.sectionComposition['午前の部'], { multipleChoice: 10, written: 1 });
    assert.deepEqual(record.sectionComposition['午後の部'], { multipleChoice: 20, written: 2 });
    assert.equal(record.sectionQuestionCounts['午前の部'], 10, '記述問は択一として採点しない');
    assert.equal(record.sectionQuestionCounts['午後の部'], 20);
    assert.match(record.questionSources['午前の部'].url, /h(?:19|20)pm_q\.pdf$/);
    assert.match(record.questionSources['午後の部'].url, /h(?:19|20)am_q\.pdf$/);
    assert.equal(record.answerSource.sectionMapping['午前の部'], 'web-table-午後の部-10-multiple-choice');
    assert.equal(record.answerSource.sectionMapping['午後の部'], 'web-table-午前の部-20-multiple-choice');
    assert.notEqual(record.answerSource.verificationStatus, 'verified');
    assert.equal(record.answerSource.verifiedForGrading, false);
    assert.equal(record.answerSource.webAnswerCandidates['午前の部'].length, 10);
    assert.equal(record.answerSource.webAnswerCandidates['午後の部'].length, 20);
  }
});

test('平成21年度以降は午前11問、午後22問の区分を変更しない', () => {
  for (const year of Array.from({ length: 13 }, (_, i) => 2009 + i)) {
    const record = manifest.years.find((x) => x.year === year);
    assert.ok(record);
    assert.equal(record.sectionQuestionCounts['午前の部'], 10);
    assert.equal(record.sectionQuestionCounts['午後の部'], 20);
    assert.match(record.questionSources['午前の部'].url, /am_q\.pdf$/);
    assert.match(record.questionSources['午後の部'].url, /pm_q\.pdf$/);
    assert.notEqual(record.legacySourceLabelsReversed, true);
  }
});

test('検証前の平成19・20年度を公式過去問の自動出題対象に加えない', () => {
  const cat = CATALOG.land_surveyor;
  for (const year of [2007, 2008]) {
    assert.ok(manifest.years.find((x) => x.year === year));
    assert.ok(!cat.validatedUploadYears.includes(year));
    assert.ok(!cat.archivedImportSources?.some((s) => s.year === year));
  }
});

test('平成19・20年の登録時も、ファイル名のam/pmより11問・22問の分類を優先する', () => {
  for (const [year, era] of [[2007,'h19'],[2008,'h20']]) {
    assert.equal(landSectionFromTotalQuestions(year, 11), '午前の部');
    assert.equal(landSectionFromTotalQuestions(year, 22), '午後の部');
    assert.equal(landSectionFromTotalQuestions(year, 10), null);
    assert.equal(landSectionFromTotalQuestions(year, 20), null);
    assert.equal(legacyLandSectionFromArchivedFileName(year, 'c_'+era+'pm_q.pdf'), '午前の部');
    assert.equal(legacyLandSectionFromArchivedFileName(year, 'https://izuki.net/wp-content/uploads/c_'+era+'am_q.pdf'), '午後の部');
    assert.equal(legacyLandSectionFromArchivedFileName(year, 'c_'+(era==='h19'?'h20':'h19')+'am_q.pdf'), null, '別年度ファイルは拒否');
  }
  assert.equal(legacyLandSectionFromArchivedFileName(2009, 'c_h21am_q.pdf'), null);
});

test('平成20年の没問（第19問）を推測で正答補完しない', () => {
  const record = manifest.years.find((x) => x.year === 2008);
  assert.equal(record.answerSource.webAnswerCandidates['午後の部'][18], null);
  assert.deepEqual(record.answerSource.specialCases, [{
    section: '午後の部', questionNumber: 19, websiteValue: '没問',
    policy: 'exclude-from-automatic-grading-until-official-decision-verified',
  }]);
});
