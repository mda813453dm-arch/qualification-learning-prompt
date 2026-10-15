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
  assert.deepEqual(seen, ['a', 'b', 'b', 'b', 'b']);
});

test('分類できていない問は新しい問として出さない', () => {
  const items = [item(1, null), item(2, 'a')];
  const state = newState({ qualificationId: 'q1', now: NOW });
  assert.equal(pickNext(state, items, { today: TODAY }).item.packet.questionId, 'q2');
});
