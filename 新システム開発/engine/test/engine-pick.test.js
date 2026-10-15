// API の出題：学習計画に分野の重みが無いときは、出題数の多い（頻出の）分野から出す
import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, pickNext } from '../src/engine.js';

const item = (year, n, fieldId) => ({ packet: { questionId: `q:${year}:${n}`, year, questionNumber: n, fieldId } });

test('重みが無いときは、出題数の多い分野を最初に出す（年度・問番号の若い順に引きずられない）', () => {
  const items = [
    item(2025, 1, 'rights'), item(2025, 2, 'rights'),
    item(2025, 15, 'law'), item(2025, 16, 'law'), item(2025, 17, 'law'), item(2024, 30, 'law'),
  ];
  const state = newState({ qualificationId: 'q041', now: 0 });
  const pick = pickNext(state, items, { today: '2026-10-16', job: null });
  assert.equal(pick.item.packet.fieldId, 'law');
});

test('学習計画に重みがあれば、それを優先する', () => {
  const items = [item(2025, 1, 'rights'), item(2025, 15, 'law'), item(2025, 16, 'law')];
  const state = newState({ qualificationId: 'q041', plan: { fieldWeights: { rights: 5 } }, now: 0 });
  assert.equal(pickNext(state, items, { today: '2026-10-16', job: null }).item.packet.fieldId, 'rights');
});
