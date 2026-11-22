// 採点の照合：AIや古い画面から別区分・別資格の問の番号が届いても、出題中の問として採点しない（Issue #2）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { grade } from '../src/engine.js';

const CURRENT = 'land_surveyor:2026:午前の部:3';
function stateWith(questionId, section) {
  return {
    qualificationId: 'land_surveyor', plan: { examDate: '2027-10-01' }, review: {}, history: {}, withheld: [], skipped: [],
    current: { questionId, kind: 'new', choiceCount: 5, correctAnswer: 2, source: { year: 2026, section, number: 3 } },
  };
}
const run = (given, questionId = CURRENT, section = '午前の部') =>
  grade(stateWith(questionId, section), { questionId: given, value: '2' }, { today: '2026-11-22', now: 0 });

test('正式な形の番号は完全一致だけ採点する（同じ年度・問番号でも別区分・別資格は拒否）', () => {
  assert.equal(run(CURRENT).ok, true);
  for (const given of ['land_surveyor:2026:午後の部:3', 'other_qual:2026:午前の部:3', 'land_surveyor:2025:午前の部:3', 'land_surveyor:2026:午前の部:13']) {
    const r = run(given);
    assert.equal(r.ok, false, given);
    assert.equal(r.reason, 'QUESTION_BINDING_MISMATCH', given);
  }
});

test('書き崩した番号に午前・午後があれば、出題中の区分と同じときだけ採点する', () => {
  for (const given of ['2026年 午前 問3', '2026 am 3', '午前の部 問3']) {
    const r = run(given);
    assert.equal(r.ok, true, given);
    assert.equal(r.grade.questionId, CURRENT, '記録は出題中の正式な番号で残す');
  }
  for (const given of ['2026年 午後 問3', '2026 pm 3', '午後の部 問3', '2026年 午前・午後 問3']) {
    assert.equal(run(given).reason, 'QUESTION_BINDING_MISMATCH', given);
  }
  // 区分のない資格（main）に午前・午後と書かれて届いたときも採点しない
  assert.equal(run('2026年 午後 問3', 'surveyor:2026:main:3', 'main').reason, 'QUESTION_BINDING_MISMATCH');
});

test('区分を書かない従来の書き崩しは、これまでどおり出題中の問として採点する', () => {
  for (const given of ['3', '問3', '2026年 問3', 'q063-2026-3']) {
    const r = run(given);
    assert.equal(r.ok, true, given);
    assert.equal(r.grade.questionId, CURRENT);
  }
  for (const given of ['問13', '2025年 問3', '']) assert.equal(run(given).ok, false, given);
  // 区分のない資格でも従来どおり
  assert.equal(run('2026年 問3', 'surveyor:2026:main:3', 'main').ok, true);
});
