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

test('分野名でも番号でもない言葉（「方向角の問題を出して」）は、問題文に含む問題を探す', () => {
  const mk = (year, n, stem) => ({ packet: { questionId: `q:${year}:${n}`, year, questionNumber: n, fieldId: 's2', stem, choices: ['1', '2'] } });
  const items = [mk(2025, 16, '写真測量の問題'), mk(2025, 9, '点Aから点Bへの方向角を求めよ'), mk(2024, 8, '方向角と距離から座標を求める')];
  const state = newState({ qualificationId: 'q063', now: 0 });
  const w = findWanted(state, items, '方向角の問題を出して', {});
  assert.equal(w.item.packet.questionNumber, 9);
  const done = { ...state, history: { 'q:2025:9': { fieldId: 's2' } } };
  assert.equal(findWanted(done, items, '方向角の問題を出して', {}).item.packet.questionNumber, 8);
  assert.equal(findWanted(state, items, '三角網の問題', {}), null);
});

test('重みの高い分野で3問のまとまりを終えたら、学習計画の次の分野へ進む（同じ分野に固定しない）', () => {
  const items = [
    item(2025, 1, 'a'), item(2024, 1, 'a'), item(2023, 1, 'a'), item(2022, 1, 'a'),
    item(2025, 20, 'b'), item(2024, 20, 'b'),
  ];
  const state = newState({ qualificationId: 'q041', plan: { fieldWeights: { a: 2, b: 1 } }, now: 0 });
  const history = Object.fromEntries(items.slice(0, 3).map((x) => [x.packet.questionId, { fieldId: 'a' }]));
  const p = pickNext({ ...state, history, set: { fieldId: 'a', count: 3, years: [2025, 2024, 2023] } }, items, { today: '2026-10-19', job: null });
  assert.equal(p.item.packet.fieldId, 'b');
});
