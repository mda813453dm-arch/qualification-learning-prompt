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

test('同じ分野で3問連続不正解なら、第4実践問題は出さず確認問題を必須にする', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'a'), item(5, 'b')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const kinds = [];
  for (const answer of [2, 2, 2]) {
    const r = pickNext(state, items, { today: TODAY });
    assert.equal(r.status, 'question');
    state = pin(state, r.item, r.kind, NOW);
    const g = grade(state, { questionId: r.item.packet.questionId, value: answer }, { today: TODAY, now: NOW });
    kinds.push([r.kind, !!g.grade.checkSuggested]);
    state = g.state;
  }
  assert.deepEqual(kinds, [['new', false], ['new', false], ['reinforce', true]]);
  assert.equal(state.wrongStreak.count, 3);
  assert.equal(state.remediation.required, true);
  assert.equal(state.remediation.fieldId, 'a');
  assert.equal(pickNext(state, items, { today: TODAY }).status, 'remediation', '確認問題の正解前は次の公式問題を許さない');
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

test('同一分野の3連続誤答を超えて別分野へ自動移動しない', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'b'), item(5, 'b')];
  let state = newState({ qualificationId: 'q1', now: NOW, plan: { fieldWeights: { a: 1 } } });
  for (let i = 0; i < 3; i++) {
    const r = pickNext(state, items, { today: TODAY });
    assert.equal(r.item.packet.fieldId, 'a');
    state = pin(state, r.item, r.kind, NOW);
    state = grade(state, { questionId: r.item.packet.questionId, value: 2 }, { today: TODAY, now: NOW }).state;
  }
  assert.equal(pickNext(state, items, { today: TODAY }).status, 'remediation');
  assert.equal(state.remediation.fieldId, 'a');
});

test('「分からない」は採点に数えず、正答を見せて復習に登録し、連続誤答にも数えない', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const r = pickNext(state, items, { today: TODAY });
  state = pin(state, r.item, r.kind, NOW);
  const g = grade(state, { questionId: r.item.packet.questionId, value: '分からない' }, { today: TODAY, now: NOW });
  assert.equal(g.ok, true);
  assert.equal(g.grade.dontKnow, true);
  assert.equal(g.grade.correctAnswer, 1);
  assert.equal(g.grade.correct, undefined);
  assert.equal(g.state.history[r.item.packet.questionId].result, 'recall_failure');
  assert.ok(g.state.review[r.item.packet.questionId]);
  assert.equal(g.state.wrongStreak?.count ?? 0, 0);
  // 次は別の（まだ出していない）問
  assert.notEqual(pickNext(g.state, items, { today: TODAY }).item.packet.questionId, r.item.packet.questionId);
});
