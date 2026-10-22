import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import { officialLibrary } from '../src/official-library.js';
import {
  FUTURE_OFFICIAL_SHARED_KEYS,
  futureOfficialShareTargets,
  futureOfficialShareTarget,
} from '../src/future-official-share.js';

test('6資格を既存の資格IDで後日共有対象に登録でき、未検証PDFを共有済みとして表示しない', async () => {
  const keys = ['takken','surveyor','itpass','chintai','mankan','gyosei'];
  assert.deepEqual(FUTURE_OFFICIAL_SHARED_KEYS,keys);
  const targets = futureOfficialShareTargets();
  assert.equal(targets.length,6);
  assert.equal(new Set(targets.map(t => t.qualificationId)).size,6);
  for (const target of targets) {
    const cat = CATALOG[target.qualificationKey];
    assert.equal(target.qualificationId,cat.qualificationId);
    assert.equal(target.qualificationName,cat.name);
    assert.equal(target.officialExamPage,cat.pastExamPage);
    assert.equal(target.sharedRegistrationStatus,'not_registered');
    assert.deepEqual(target.uploadedYears,[]);
    assert.deepEqual(target.savedSections,[]);
    assert.equal(target.sharedQuestionCount,0);
    assert.ok(target.requirements.length>10, '資格ごとの確認要件が記載されている');
    assert.deepEqual(futureOfficialShareTarget(cat.qualificationId),target);
    assert.deepEqual(futureOfficialShareTarget(target.qualificationKey),target);
    if (target.qualificationKey === 'takken') {
      assert.match(cat.officialShared.officialPdfPins[2025]['年度共通'],/^[a-f0-9]{64}$/,
        '2025年度宅建の公式原本は既にSHA照合済み。ただし保存済みとは限らない');
    } else if (target.qualificationKey === 'surveyor') {
      assert.match(cat.officialShared.officialPdfPins[2025].main,/^[a-f0-9]{64}$/,
        '測量士補の添付原本SHAを固定。保存状況は別途検査する');
    } else {
      assert.equal(cat.officialPdfPins,undefined,
        '原本PDF未検証の資格で、SHA固定済みだと誤表示しない');
    }
    // 未登録年度から共有される問題を生成しない。
    const lib=await officialLibrary(new MemoryStore(),cat,'0.8.2',Date.now());
    assert.equal(lib.totalQuestions,0);
    assert.deepEqual(lib.stored,[]);
    if (target.qualificationKey === 'takken') {
      assert.equal(lib.missing.length, 12);
      assert.deepEqual(lib.missing.filter(x => x.year === 2020),
        [{year:2020,section:'10月'}, {year:2020,section:'12月'}]);
      assert.deepEqual(lib.missing.filter(x => x.year === 2021),
        [{year:2021,section:'10月'}, {year:2021,section:'12月'}]);
    } else if (target.qualificationKey === 'surveyor') {
      assert.deepEqual(lib.missing,[2026,2025,2024,2023,2022].map(year=>({year,section:'main'})));
    } else if (target.qualificationKey === 'mankan') {
      assert.deepEqual(lib.missing,[2025,2024,2023,2022,2021,2020,2019].map(year=>({year,section:'main'})));
    } else if (target.qualificationKey === 'itpass') {
      assert.deepEqual(lib.missing,[
        ...[2026,2025,2024,2023,2022,2021,2020].map(year=>({year,section:'公開問題'})),
        ...[2019,2018,2017,2016].flatMap(year=>[
          {year,section:'春期'}, {year,section:'秋期'},
        ]),
      ], '原本の参照先が増えても、検証済みの共有問題とは扱わない');
    } else {
      assert.deepEqual(lib.missing, []);
    }
  }
  assert.equal(futureOfficialShareTarget('invalid'),null);
});

test('将来登録は資格別の正答形態と免除を保護する', () => {
  const t=Object.fromEntries(futureOfficialShareTargets().map(x=>[x.qualificationKey,x]));
  assert.match(t.takken.requirements,/同一PDF/);
  assert.deepEqual(CATALOG.takken.exemption?.numbers,[46,47,48,49,50]);
  assert.match(t.surveyor.requirements,/図表/);
  assert.match(t.itpass.requirements,/CBT/);
  assert.match(t.chintai.requirements,/5問免除/);
  assert.match(t.mankan.requirements,/四肢択一/);
  assert.match(t.gyosei.requirements,/公式HTML/);
  assert.match(t.gyosei.requirements,/記述式/);
});
