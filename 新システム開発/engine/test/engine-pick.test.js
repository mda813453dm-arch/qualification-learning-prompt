// API の出題：学習計画に分野の重みが無いときは、出題数の多い（頻出の）分野から出す
import test from 'node:test';
import assert from 'node:assert/strict';
import { findWanted, newState, pickNext, pin } from '../src/engine.js';

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

test('利用者が分野を指定したら、その分野の問を出し、その分野の問が残る間は続けて出す', () => {
  const items = [
    item(2025, 1, 's1'), item(2025, 2, 's1'), item(2024, 1, 's1'),
    item(2025, 26, 's8'), item(2024, 26, 's8'), item(2023, 26, 's8'), item(2022, 26, 's8'),
  ].map((x) => ({ ...x, packet: { ...x.packet, choices: [1, 2, 3, 4, 5] } }));
  const fields = { s1: '測量に関する法規', s8: '応用測量' };
  let state = newState({ qualificationId: 'q063', now: 0 });
  const w = findWanted(state, items, '応用測量の分野に移りたい', fields);
  assert.equal(w.fieldId, 's8');
  assert.equal(w.item.packet.fieldId, 's8');
  state = { ...pin({ ...state, focusField: 's8' }, w.item, w.kind, 0) };
  for (let i = 0; i < 3; i += 1) {
    const qid = state.current.questionId;
    state = { ...state, current: null, history: { ...state.history, [qid]: { fieldId: 's8' } } };
    const p = pickNext(state, items, { today: '2026-10-17', job: null });
    assert.equal(p.item.packet.fieldId, 's8', `${i + 2}問目も応用測量`);
    state = pin(state, p.item, p.kind, 0);
  }
  assert.equal(findWanted(state, items, '問1', fields).item.packet.questionNumber, 1);
  assert.equal(findWanted(state, items, '写真測量', fields), null);
});
