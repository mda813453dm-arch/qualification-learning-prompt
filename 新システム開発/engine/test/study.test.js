// 学習計画・出題順・復習の決め方（study.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../src/engine.js';
import { updateReviewItem } from '../src/review.js';
import { FIXED_UI_CHOICES } from '../src/fixed-ui.js';
import { chooseField, dueReview, frequencyOrder, pickInField, reviewTurn } from '../src/study.js';

const item = (year, n, fieldId) => ({ keyParts: {}, packet: { questionId: `q:${year}:${n}`, year, questionNumber: n, fieldId } });

test('分野の中では、まだ解いていない年度を先にして複数年度にまたがる', () => {
  const items = [item(2025, 1, 'a'), item(2025, 2, 'a'), item(2025, 3, 'a'), item(2024, 4, 'a'), item(2023, 5, 'a')];
  const state = newState({ qualificationId: 'x', now: 0 });
  const seen = [];
  for (let i = 0; i < 3; i += 1) {
    const it = pickInField(state, items, 'a');
    seen.push(it.packet.year);
    state.history[it.packet.questionId] = { fieldId: 'a', source: { year: it.packet.year }, result: 'wrong' };
  }
  assert.deepEqual(seen, [2025, 2024, 2023]);
});

test('頻出分野の順番：検証済みの分類が2分野以上あれば出題数順、なければ公式の分野順', () => {
  assert.deepEqual(frequencyOrder(['a', 'b', 'c'], { a: 1, b: 5, c: 5 }).order, ['b', 'c', 'a']);
  const one = frequencyOrder(['a', 'b', 'c'], { a: 0, b: 7, c: 0 });
  assert.equal(one.basis, 'official_overview_order');
  assert.deepEqual(one.order, ['a', 'b', 'c']);
});

test('次の分野：計画の上位と正答率の低い分野ほど多く選ばれ、同じ分野ばかりにはならない', () => {
  const order = ['weak', 'mid', 'strong'];
  const stats = { weak: { n: 6, w: 5 }, mid: { n: 6, w: 3 }, strong: { n: 6, w: 0 } };
  const sets = { weak: 0, mid: 0, strong: 0 };
  const picks = [];
  for (let i = 0; i < 9; i += 1) {
    const f = chooseField({ order, stats, sets, candidates: order });
    picks.push(f);
    sets[f] += 1;
  }
  const n = (f) => picks.filter((x) => x === f).length;
  assert.equal(picks[0], 'weak');
  assert.ok(n('weak') > n('mid') && n('mid') > n('strong'), picks.join(','));
  assert.ok(n('strong') >= 1);
});

test('復習は学習の最初に最大5問、そのあとは新しい問題2問ごとに1問', () => {
  assert.equal(reviewTurn({ newCount: 0, reviewCount: 4 }), true);
  assert.equal(reviewTurn({ newCount: 0, reviewCount: 5 }), false);
  assert.equal(reviewTurn({ newCount: 3, sinceReview: 1 }), false);
  assert.equal(reviewTurn({ newCount: 3, sinceReview: 2 }), true);
  const state = newState({ qualificationId: 'x', now: 0 });
  state.review = { 'q:2025:1': { unitId: 'q:2025:1', dueDate: '2026-10-15' }, 'q:2025:2': { unitId: 'q:2025:2', dueDate: '2026-10-20' } };
  const items = [item(2025, 1, 'a'), item(2025, 2, 'a')];
  assert.equal(dueReview(state, items, '2026-10-15').packet.questionNumber, 1);
  assert.equal(dueReview(state, items, '2026-10-15', ['q:2025:1']), null, '同じセッションで復習済みの問は出さない');
});

test('復習の間隔は選んだ型に従う（集中型は当日から）', () => {
  const ev = { unitId: 'u', topicId: 't', result: 'wrong' };
  const focus = updateReviewItem(null, ev, { today: '2026-10-15', intervals: [0, 1, 3, 7] }).item;
  assert.equal(focus.dueDate, '2026-10-15');
  const next = updateReviewItem(focus, { ...ev, result: 'confident_correct' }, { today: '2026-10-15', intervals: [0, 1, 3, 7] }).item;
  assert.equal(next.dueDate, '2026-10-16');
  const slow = updateReviewItem(null, ev, { today: '2026-10-15', intervals: [3, 7, 14] }).item;
  assert.equal(slow.dueDate, '2026-10-18');
  const def = updateReviewItem(null, ev, { today: '2026-10-15' }).item;
  assert.equal(def.dueDate, '2026-10-16', '既定は翌日から');
});

test('エンジンの固定UIは、新システム開発/src/fixed-ui-choices.js と同じ', async () => {
  const src = new URL('../../src/fixed-ui-choices.js', import.meta.url);
  readFileSync(src);
  const { FIXED_UI_CHOICES: original } = await import(src.href);
  assert.deepEqual(JSON.parse(JSON.stringify(FIXED_UI_CHOICES)), JSON.parse(JSON.stringify(original)));
});

test('解説の書き方：学習段階・苦手な分野・正誤に合わせる', async () => {
  const { explainHow, stageNumber, weakFields } = await import('../src/explain.js');
  assert.equal(stageNumber('2：基礎学習中'), 2);
  assert.equal(stageNumber('過去問演習中'), 4);
  assert.equal(stageNumber('3'), 3);
  assert.equal(stageNumber(''), null);
  const history = {
    a: { fieldId: 's1', result: 'wrong' }, b: { fieldId: 's1', result: 'wrong' }, c: { fieldId: 's1', result: 'confident_correct' },
    d: { fieldId: 's2', result: 'confident_correct' }, e: { fieldId: 's2', result: 'wrong' }, f: { fieldId: 's3', result: 'wrong' },
  };
  assert.deepEqual(weakFields(history, { s1: '法規', s2: '基準点測量' }), ['法規（3問中2問まちがい）', '基準点測量（2問中1問まちがい）']);
  const h = explainHow({ stage: 1, weak: ['法規（3問中2問まちがい）'], grade: { result: 'wrong', selected: 2, correctAnswer: 4 }, fieldName: '法規' });
  assert.match(h, /マークダウンの表/);
  assert.match(h, /SVG/);
  assert.match(h, /写真があれば写真、無ければ図解/);
  assert.match(h, /未着手/);
  assert.doesNotMatch(h, /過去問演習中/);
  assert.match(h, /選んだのは2、正答は4/);
  assert.match(h, /法規（3問中2問まちがい）/);
  // 段階が分からないときは、4つの段階をすべて示して、利用者が答えた段階に合わせさせる
  assert.match(explainHow({}), /利用者が答えた学習段階に合わせる[\s\S]*未着手[\s\S]*過去問演習中/);
});
