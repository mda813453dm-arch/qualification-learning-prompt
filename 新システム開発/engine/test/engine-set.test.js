// 仕様：分野内の検証済み公式問題の半数（端数切上げ）を一区切りにする。確認問題と3連続誤答は別仕様。
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldPracticeTarget, grade, newState, pickNext, pin } from '../src/engine.js';

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
  state = pin(state, r.item, r.kind, NOW, { setTarget: r.setTarget });
  const g = grade(state, { questionId: r.item.packet.questionId, value: answer }, { today: TODAY, now: NOW });
  return { state: g.state, item: r.item };
}

test('分野の登録数に応じて50%ずつ交互に解き、全問を先に一巡する', () => {
  // 問番号順では分野が交互に並ぶ
  const items = [item(1, 'a'), item(2, 'b'), item(3, 'a'), item(4, 'b'), item(5, 'a'), item(6, 'b'), item(7, 'a')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const seen = [];
  for (let i = 0; i < 6; i += 1) {
    const r = solve(state, items, 1);
    state = r.state;
    seen.push(r.item.packet.fieldId);
  }
  assert.equal(fieldPracticeTarget(items, 'a'), 2);
  assert.equal(fieldPracticeTarget(items, 'b'), 2);
  assert.deepEqual(seen, ['a', 'a', 'b', 'b', 'a', 'a']);
});

test('1問しかない分野は1問で移り、端数は切り上げる', () => {
  const items = [item(1, 'a'), item(2, 'b'), item(3, 'b'), item(4, 'b'), item(5, 'b')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    const r = solve(state, items, 1);
    state = r.state;
    seen.push(r.item.packet.fieldId);
  }
  // bは4問の50%＝2問、aは1問の50%＝1問
  assert.deepEqual(seen, ['b', 'b', 'a', 'b', 'b']);
});

test('分類できていない問は新しい問として出さない', () => {
  const items = [item(1, null), item(2, 'a')];
  const state = newState({ qualificationId: 'q1', now: NOW });
  assert.equal(pickNext(state, items, { today: TODAY }).item.packet.questionId, 'q2');
});

test('同じ分野で3問連続不正解なら、第4実践問題は出さず確認問題を必須にする', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'a')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const kinds = [];
  for (const answer of [2, 2, 2]) {
    const r = pickNext(state, items, { today: TODAY });
    assert.equal(r.status, 'question');
    state = pin(state, r.item, r.kind, NOW, { setTarget: r.setTarget });
    const g = grade(state, { questionId: r.item.packet.questionId, value: answer }, { today: TODAY, now: NOW });
    kinds.push([r.kind, !!g.grade.checkSuggested]);
    state = g.state;
  }
  assert.deepEqual(kinds, [['new', false], ['new', false], ['new', true]]);
  assert.equal(state.wrongStreak.count, 3);
  assert.equal(state.remediation.required, true);
  assert.equal(state.remediation.fieldId, 'a');
  assert.equal(pickNext(state, items, { today: TODAY }).status, 'remediation', '確認問題の正解前は次の公式問題を許さない');
});

test('2問連続不正解でも新しい公式実践問題を通常どおり継続する', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'a')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const kinds = [];
  for (const answer of [2, 2, 1, 1]) {
    const r = pickNext(state, items, { today: TODAY });
    state = pin(state, r.item, r.kind, NOW, { setTarget: r.setTarget });
    state = grade(state, { questionId: r.item.packet.questionId, value: answer }, { today: TODAY, now: NOW }).state;
    kinds.push(r.kind);
  }
  assert.deepEqual(kinds, ['new', 'new', 'new', 'new']);
});

test('同一分野の3連続誤答を超えて別分野へ自動移動しない', () => {
  // aの登録済み5問なら50%は3問。そこで3連続誤答し、別分野に移る前に補強を強制する。
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a'), item(4, 'a'), item(5, 'a'), item(6, 'b')];
  let state = newState({ qualificationId: 'q1', now: NOW, plan: { fieldWeights: { a: 1 } } });
  for (let i = 0; i < 3; i++) {
    const r = pickNext(state, items, { today: TODAY });
    assert.equal(r.item.packet.fieldId, 'a');
    state = pin(state, r.item, r.kind, NOW, { setTarget: r.setTarget });
    state = grade(state, { questionId: r.item.packet.questionId, value: 2 }, { today: TODAY, now: NOW }).state;
  }
  assert.equal(pickNext(state, items, { today: TODAY }).status, 'remediation');
  assert.equal(state.remediation.fieldId, 'a');
});

test('「分からない」は採点に数えず、正答を見せて復習に登録し、連続誤答にも数えない', () => {
  const items = [item(1, 'a'), item(2, 'a'), item(3, 'a')];
  let state = newState({ qualificationId: 'q1', now: NOW });
  const r = pickNext(state, items, { today: TODAY });
  state = pin(state, r.item, r.kind, NOW, { setTarget: r.setTarget });
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
