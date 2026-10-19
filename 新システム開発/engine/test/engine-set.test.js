// 仕様：同じ分野（fieldId）の過去問を3問続けて出す
import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, newState, pickNext, pin, SET_SIZE } from '../src/engine.js';

const NOW = '2026-10-15T00:00:00Z';
const TODAY = '2026-10-15';

function item(n, fieldId) {
  return {
    keyParts: {},
    packet: { questionId: `q${n}`, fieldId, year: 2025, section: 'main', questionNumber: n, stem: `問${n}`, choices: ['一', '二', '三', '四'], correctAnswer: 1, questionPdfUrl: 'u', answerPdfUrl: 'a' },
  };
}

function solve(state, items, answer) {
  const r = pickNext(state, items, { today: TODAY });
  assert.equal(r.status, 'question');
  state = pin(state, r.item, r.kind, NOW);
  const g = grade(state, { questionId: r.item.packet.questionId, value: answer }, { today: TODAY, now: NOW });
  return { state: g.state, item: r.item };
}

test('同じ分野から3問続けて出し、終わったら別の分野へ移る', () => {
  // 問番号順では分野が交互に並ぶ
  const items = [item(1, 'a'), item(2, 'b'), item(3, 'a'), item(4, 'b'), item(5, 'a'), item(6, 'b'), item(7, 'a')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const seen = [];
  for (let i = 0; i < 6; i += 1) {
    const r = solve(state, items, 1);
    state = r.state;
    seen.push(r.item.packet.fieldId);
  }
  assert.equal(SET_SIZE, 3);
  assert.deepEqual(seen, ['a', 'a', 'a', 'b', 'b', 'b']);
});

test('分野の残りが3問に満たないときは、別の分野に移って続ける', () => {
  const items = [item(1, 'a'), item(2, 'b'), item(3, 'b'), item(4, 'b'), item(5, 'b')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    const r = solve(state, items, 1);
    state = r.state;
    seen.push(r.item.packet.fieldId);
  }
  // 頻出（出題数の多い）b から3問、次に a、残った b
  assert.deepEqual(seen, ['b', 'b', 'b', 'a', 'b']);
});

test('分類できていない問は新しい問として出さない', () => {
  const items = [item(1, null), item(2, 'a')];
  const state = newState({ qualificationId: 'q1', now: NOW });
  assert.equal(pickNext(state, items, { today: TODAY }).item.packet.questionId, 'q2');
});

test('同じ分野を2問続けて間違えたら、次は同じ分野の補強の問。補強を3回間違えたら確認問題を勧める（B15 分岐5・U21）', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'a'), item(5, 'a'), item(6, 'a'), item(7, 'b')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const log = [];
  for (const answer of [2, 2, 2, 2, 2]) { // 1が正解
    const r = pickNext(state, items, { today: TODAY });
    state = pin(state, r.item, r.kind, NOW);
    const g = grade(state, { questionId: r.item.packet.questionId, value: answer }, { today: TODAY, now: NOW });
    state = g.state;
    log.push([r.kind, r.item.packet.fieldId, !!g.grade.reinforceNext, g.grade.checkSuggested]);
  }
  assert.deepEqual(log, [
    ['new', 'a', false, false],
    ['new', 'a', true, false], // 2問続けて誤答 → 次は補強
    ['reinforce', 'a', true, false],
    ['reinforce', 'a', true, false],
    ['reinforce', 'a', false, true], // 補強を3回誤答 → 補強を止め、確認問題を勧める
  ]);
});

test('補強の問に正解したら、補強を終えて通常の出題に戻る', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'a')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const kinds = [];
  for (const answer of [2, 2, 1, 1]) {
    const r = pickNext(state, items, { today: TODAY });
    state = pin(state, r.item, r.kind, NOW);
    state = grade(state, { questionId: r.item.packet.questionId, value: answer }, { today: TODAY, now: NOW }).state;
    kinds.push(r.kind);
  }
  assert.deepEqual(kinds, ['new', 'new', 'reinforce', 'new']);
});

test('3問連続で間違えたあとは、同じ分野に戻って次の3問を出す', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'a'), item(5, 'a'), item(6, 'b'), item(7, 'b'), item(8, 'b'), item(9, 'b')];
  let state = newState({ qualificationId: 'q1', now: NOW, plan: { fieldWeights: { a: 1 } } });
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    const r = pickNext(state, items, { today: TODAY });
    state = pin(state, r.item, r.kind, NOW);
    seen.push(r.item.packet.fieldId);
    state = grade(state, { questionId: r.item.packet.questionId, value: 2 }, { today: TODAY, now: NOW }).state;
  }
  // 誤答3問で確認問題を勧めたあとも、aの残り2問を続けて出す（3問ごとに別の分野へ移さない）
  assert.deepEqual(seen, ['a', 'a', 'a', 'a', 'a']);
});
