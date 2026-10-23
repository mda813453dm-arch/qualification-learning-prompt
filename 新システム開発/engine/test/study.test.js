// 学習計画・出題順・復習の決め方（study.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState, pickNext, pin, grade } from '../src/engine.js';
import { updateReviewItem, selectDueReviews } from '../src/review.js';
import { FIXED_UI_CHOICES } from '../src/fixed-ui.js';
import { chooseField, dueReview, frequencyOrder, pickInField, reviewTurn } from '../src/study.js';
import { sourceQuestionLabel, gradedQuestionContents } from '../src/study-log.js';

const item = (year, n, fieldId) => ({ keyParts: {}, packet: { questionId: `q:${year}:${n}`, year, questionNumber: n, fieldId } });

test('土地家屋調査士の午前・午後を同じ年度・同じ問番号でも別の記録として表示する', () => {
  const morning = { year: 2025, section: '午前の部', number: 1 };
  const afternoon = { year: 2025, section: '午後の部', number: 1 };
  assert.equal(sourceQuestionLabel(morning), '2025年度 午前の部 問1');
  assert.equal(sourceQuestionLabel(afternoon), '2025年度 午後の部 問1');
  assert.notEqual(sourceQuestionLabel(morning), sourceQuestionLabel(afternoon));
  const history = {
    'land_surveyor:2025:午前の部:1': { source: morning, gradedAt: 2000, result: 'confident_correct' },
    'land_surveyor:2025:午後の部:1': { source: afternoon, gradedAt: 3000, result: 'wrong' },
    'land_surveyor:2024:午前の部:1': { source: { year: 2024, section: '午前の部', number: 1 }, gradedAt: 500, result: 'wrong' },
  };
  assert.deepEqual(gradedQuestionContents(history, 1000), [
    '2025年度 午前の部 問1：正解',
    '2025年度 午後の部 問1：不正解',
  ]);
  assert.equal(sourceQuestionLabel({}, 'land_surveyor:2024:午後の部:1'), '2024年度 午後の部 問1');
  assert.equal(sourceQuestionLabel({ year: 2025, section: 'main', number: 1 }), '2025年度 問1',
    '区分のない資格へ午前・午後を勝手に追加しない');
});

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
  assert.match(h, /SVG・HTML・XMLなどのタグを生成したり/);
  assert.match(h, /Markdownの比較表や番号付き手順/);
  assert.match(h, /図がなくても読みやすい日本語の表と文章/);
  assert.match(h, /未着手/);
  assert.doesNotMatch(h, /過去問演習中/);
  assert.match(h, /選んだのは2、正答は4/);
  assert.match(h, /法規（3問中2問まちがい）/);
  // 段階が分からないときは、4つの段階をすべて示して、利用者が答えた段階に合わせさせる
  assert.match(explainHow({}), /利用者が答えた学習段階に合わせる[\s\S]*未着手[\s\S]*過去問演習中/);
});

test('復習予定は分・時間の期限を正確に判定し、反復定着で卒業・再誤答で復帰', () => {
  const now = Date.parse('2026-10-20T01:00:00Z');
  const args = { today: '2026-10-20', now, intervalsMinutes: [3, 60] };
  const event = { unitId: 'unit1', topicId: 'field1', result: 'wrong' };
  const first = updateReviewItem(null, event, args).item;
  assert.equal(first.dueAt, '2026-10-20T01:03:00.000Z');
  assert.equal(selectDueReviews({ today: '2026-10-20', now: now + 179999, items: [first] }).items.length, 0);
  assert.equal(selectDueReviews({ today: '2026-10-20', now: now + 180000, items: [first] }).items.length, 1);
  const second = updateReviewItem(first, { ...event, result: 'confident_correct' },
    { ...args, now: now + 180000 }).item;
  assert.equal(second.dueAt, '2026-10-20T02:03:00.000Z');
  const mastered = updateReviewItem(second, { ...event, result: 'confident_correct' },
    { ...args, now: now + 3780000 }).item;
  assert.equal(mastered.mastered, true);
  assert.equal(selectDueReviews({ today: '2026-10-21', now: now + 86400000, items: [mastered] }).items.length, 0);
  const resumed = updateReviewItem(mastered, event, { ...args, now: now + 86400000 }).item;
  assert.equal(resumed.mastered, false);
  assert.equal(resumed.step, 0);
});

test('同じ検証済み論点の別問題を優先して復習し、異なる論点と混同しない', () => {
  const state = newState({ qualificationId: 'survey', now: 0 });
  state.review = { 'field1:topicA': { unitId: 'field1:topicA', topicId: 'field1',
    sourceQuestionId: 'q:2025:1', dueDate: '2026-10-20' } };
  const old = item(2025,1,'field1'), alternate = item(2024,2,'field1'), other = item(2024,3,'field1');
  old.packet.reviewUnitId = 'field1:topicA';
  alternate.packet.reviewUnitId = 'field1:topicA';
  other.packet.reviewUnitId = 'field1:topicB';
  const picked = pickNext(state, [old,alternate,other], { today:'2026-10-20', now:Date.parse('2026-10-20T12:00:00Z') });
  assert.equal(picked.status,'question');
  assert.equal(picked.kind,'review');
  assert.equal(picked.item.packet.questionId, alternate.packet.questionId);
});

test('期限復習は開始時最大5問、以降は新規問題2問ごとに復習1問に制限する', () => {
  const today = '2026-10-20', now = Date.parse('2026-10-20T09:00:00Z');
  const reviewPackets = Array.from({length: 7}, (_, i) => ({
    packet: { questionId: `r:2025:main:${i+1}`, year: 2025, section: 'main',
      questionNumber: i+1, fieldId: 'a', correctAnswer: 1, choices: ['a', 'b'] },
    keyParts: {},
  }));
  const freshPackets = Array.from({length: 4}, (_, i) => ({
    packet: { questionId: `n:2024:main:${i+1}`, year: 2024, section: 'main',
      questionNumber: i+1, fieldId: 'b', correctAnswer: 1, choices: ['a', 'b'] },
    keyParts: {},
  }));
  let state = newState({ qualificationId: 'q1', now });
  state.review = Object.fromEntries(reviewPackets.map(({packet}) => [packet.questionId, {
    unitId: packet.questionId, topicId: 'a', dueDate: today, step: 0, recallSuccesses: 0,
  }]));
  const kinds = [];
  for (let i = 0; i < 8; i++) {
    const picked = pickNext(state, [...reviewPackets, ...freshPackets], { today, now });
    assert.equal(picked.status, 'question');
    kinds.push(picked.kind);
    state = pin(state, picked.item, picked.kind, now);
    const result = grade(state, {questionId: picked.item.packet.questionId, value: '1'}, {today, now});
    assert.equal(result.ok, true);
    state = result.state;
  }
  assert.deepEqual(kinds, ['review','review','review','review','review','new','new','review']);
  assert.equal(state.reviewPacing.initialServed, 5);
  assert.equal(state.reviewPacing.newAnswered, 2);
  assert.equal(state.reviewPacing.sinceReview, 0);
});

test('日付が変わった場合は復習ペースを再開始し、翌日期限の復習を先に出す', () => {
  const today = '2026-10-21', now = Date.parse('2026-10-21T08:00:00Z');
  const q = item(2025, 1, 'a'), newQ = item(2025, 2, 'b');
  const state = newState({ qualificationId: 'q1', now });
  state.review = { [q.packet.questionId]: {
    unitId: q.packet.questionId, topicId: 'a', dueDate: today,
  } };
  state.reviewPacing = { initialServed: 0, newAnswered: 1, sinceReview: 1, lastDate: '2026-10-20' };
  const picked = pickNext(state, [q, newQ], { today, now });
  assert.equal(picked.kind, 'review');
  assert.equal(picked.item.packet.questionId, q.packet.questionId);
});
