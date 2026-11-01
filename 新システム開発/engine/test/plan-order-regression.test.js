// 2026-11-01 調査共有（AI間共有ページ）の必須回帰テスト7件。
// 学習計画の分野順（orderedFields）が出題順に反映されない不具合と、出題形式の希望の扱いを固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { grade, newState, pickNext, pin, updatePlan } from '../src/engine.js';
import { T0 } from './helpers.js';

const FIELDS = ['a', 'b', 'c'];
const TODAY = '2026-11-01';
const item = (year, n, fieldId, extra = {}) => ({ packet: {
  questionId: `q:${year}:${n}`, year, questionNumber: n, fieldId, choices: ['1', '2', '3', '4'], correctAnswer: 1,
  stem: `問${n}`, figures: [], ...extra } });
const pool = (extra = {}) => FIELDS.flatMap((f, i) => [2025, 2024, 2023, 2022].map((y) => item(y, i * 10 + (2025 - y) + 1, f, extra)));
const next = (state, items, opts = {}) => pickNext(state, items, { today: TODAY, now: Date.parse(`${TODAY}T01:00:00Z`), job: null, ...opts });

test('①記述式を希望していて記述式の問題が無いとき、択一式へ黙ってフォールバックしない', () => {
  const items = pool({ questionType: 'multiple_choice' });
  const state = updatePlan(newState({ qualificationId: 'q', now: 0 }), { questionPreference: 'descriptive' }, { fieldIds: FIELDS });
  const pick = next(state, items);
  assert.equal(pick.status, 'formatUnavailable');
  assert.equal(pick.preference, 'descriptive');
  assert.equal(pick.item, undefined, '択一式の問題を出さない');
  // 希望が「形式を問わない」なら従来どおり出題する
  assert.equal(next(updatePlan(state, { questionPreference: 'any' }, { fieldIds: FIELDS }), items).status, 'question');
});

test('②形式不明の問題は推測で分類せず、検証待ちとして出題しない', () => {
  const unknown = pool(); // questionType なし
  const mc = item(2021, 99, 'c', { questionType: 'multiple_choice' });
  const state = updatePlan(newState({ qualificationId: 'q', now: 0 }), { questionPreference: 'multiple_choice' }, { fieldIds: FIELDS });
  const only = next(state, unknown);
  assert.equal(only.status, 'formatUnavailable');
  assert.equal(only.unverifiedCount, unknown.length, '形式不明の数を検証待ちとして返す');
  const pick = next(state, [...unknown, mc]);
  assert.equal(pick.status, 'question');
  assert.equal(pick.item.packet.questionId, mc.packet.questionId, '形式が確認できた問題だけを出す');
});

test('③形式の希望や分野順を変えても、期限の来た復習は維持する（「〜のみ」と明示したときだけ復習も限定）', () => {
  const items = pool();
  const reviewQ = items.find((x) => x.packet.fieldId === 'c');
  let state = newState({ qualificationId: 'q', now: 0 });
  state = { ...state, history: { [reviewQ.packet.questionId]: { result: 'wrong', fieldId: 'c', kind: 'new' } },
    review: { [reviewQ.packet.questionId]: { unitId: reviewQ.packet.questionId, sourceQuestionId: reviewQ.packet.questionId,
      topicId: 'c', dueDate: '2026-10-31', source: 'wrong', mastered: false, qualificationId: 'q' } } };
  state = updatePlan(state, { orderedFields: ['a', 'b', 'c'], questionPreference: 'descriptive' }, { fieldIds: FIELDS });
  const pick = next(state, items);
  assert.equal(pick.status, 'question');
  assert.equal(pick.kind, 'review', '期限の来た復習を先に出す');
  assert.equal(pick.item.packet.questionId, reviewQ.packet.questionId);
  const strict = updatePlan(state, { questionPreferenceScope: 'all' }, { fieldIds: FIELDS });
  assert.notEqual(next(strict, items).kind, 'review', '「記述式のみ」と明示したときは択一式の復習も出さない');
});

test('④orderedFields と重みが食い違うときは、利用者が明示した分野順を優先する', () => {
  const items = pool();
  let state = updatePlan(newState({ qualificationId: 'q', now: 0 }), { orderedFields: ['c', 'a', 'b'] }, { fieldIds: FIELDS });
  assert.deepEqual(state.plan.fieldWeights, { c: 300, a: 200, b: 100 }, '重みは明示した順から作り直す');
  // 初期診断の「計画に反映」と同じく、重みだけが後から書き換わった状態
  state = { ...state, plan: { ...state.plan, fieldWeights: { a: 3, b: 2, c: 1 } } };
  assert.equal(next(state, items).item.packet.fieldId, 'c');
  // 3問のまとまりを終えたら、明示した順の次（a）へ進む
  for (let i = 0; i < 3; i += 1) {
    const p = next(state, items);
    assert.equal(p.item.packet.fieldId, 'c');
    state = pin(state, p.item, p.kind, 0);
    state = grade(state, { questionId: state.current.questionId, value: '1' }, { today: TODAY, now: 0 }).state;
  }
  assert.equal(next(state, items).item.packet.fieldId, 'a');
  // 不正な分野順は保存しない
  for (const [bad, code] of [[['a', 'a', 'b'], 'PLAN_FIELDS_DUPLICATE'], [['a', 'b'], 'PLAN_FIELDS_MISSING'], [['a', 'b', 'x'], 'PLAN_FIELDS_UNKNOWN']])
    assert.throws(() => updatePlan(state, { orderedFields: bad }, { fieldIds: FIELDS }), (e) => e.code === code);
  assert.throws(() => updatePlan(state, { questionPreference: 'essay' }, { fieldIds: FIELDS }), (e) => e.code === 'PLAN_QUESTION_PREFERENCE_INVALID');
});

test('⑤計画変更後に保存・復元しても、新しい分野順・版・履歴が残る（旧形式のセッションも復元できる）', () => {
  const items = pool();
  let state = updatePlan(newState({ qualificationId: 'q', now: 0 }), { orderedFields: ['a', 'b', 'c'] }, { fieldIds: FIELDS, now: 1 });
  state = updatePlan(state, { orderedFields: ['b', 'c', 'a'] }, { fieldIds: FIELDS, now: 2 });
  const restored = JSON.parse(JSON.stringify(state)); // 保存先は JSON
  assert.equal(restored.plan.revision, 2);
  assert.deepEqual(restored.planHistory.map((h) => h.orderedFields), [['a', 'b', 'c'], ['b', 'c', 'a']]);
  assert.equal(next(restored, items).item.packet.fieldId, 'b');
  // 旧形式（revision・orderedFields なし、重みだけ）
  const legacy = JSON.parse(JSON.stringify({ ...newState({ qualificationId: 'q', plan: { fieldWeights: { c: 5 } }, now: 0 }) }));
  delete legacy.planHistory;
  assert.equal(next(legacy, items).item.packet.fieldId, 'c', '旧セッションは重みで出題を続ける');
  const upgraded = updatePlan(legacy, { orderedFields: ['a', 'c', 'b'] }, { fieldIds: FIELDS });
  assert.equal(upgraded.plan.revision, 1);
  assert.equal(next(upgraded, items).item.packet.fieldId, 'a');
});

test('⑥3問セットの途中で計画を変えても、出題中の問題と採点は保たれ、次の新規出題から新しい順になる', () => {
  const items = pool();
  let state = updatePlan(newState({ qualificationId: 'q', now: 0 }), { orderedFields: ['a', 'b', 'c'] }, { fieldIds: FIELDS });
  let p = next(state, items);
  state = pin(state, p.item, p.kind, 0);
  state = grade(state, { questionId: state.current.questionId, value: '1' }, { today: TODAY, now: 0 }).state;
  p = next(state, items);
  assert.equal(p.item.packet.fieldId, 'a', 'aの2問目');
  state = pin(state, p.item, p.kind, 0);
  const pending = state.current;
  const historyBefore = state.history;
  state = updatePlan({ ...state, focusField: 'a' }, { orderedFields: ['c', 'b', 'a'] }, { fieldIds: FIELDS });
  assert.deepEqual(state.current, pending, '未回答の問題をそのまま保持');
  assert.deepEqual(state.history, historyBefore, '採点記録を変えない');
  const again = next(state, items);
  assert.equal(again.repeated, true);
  assert.equal(again.item.packet.questionId, pending.questionId, '出題中の問題を差し替えない');
  const g = grade(state, { questionId: pending.questionId, value: '2' }, { today: TODAY, now: 0 });
  assert.equal(g.ok, true);
  assert.equal(g.grade.correctAnswer, 1, '出題時に控えた正答で採点する');
  state = g.state;
  assert.equal(next(state, items).item.packet.fieldId, 'c', '次の新規出題から新しい順');
});

test('⑦学習中のセッションに別資格を指定して計画を保存すると QUALIFICATION_MISMATCH で拒否し、計画を変えない', async () => {
  const env = { STORE: new MemoryStore(), API_TOKEN: 't', clock: () => T0 };
  const call = async (method, path, body) => {
    const res = await handle(new Request(`https://engine.example${path}`, { method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
      body: body === undefined ? undefined : JSON.stringify(body) }), env);
    return { status: res.status, body: await res.json() };
  };
  const started = await call('POST', '/v1/sessions', { qualificationId: '土地家屋調査士', sources: [] });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const sid = started.body.sessionId;
  const fields = Object.values(CATALOG.land_surveyor.fields);
  const base = { methodChoice: 'balanced', reviewPreset: 'ai' };
  const first = await call('POST', `/v1/sessions/${sid}/plan`, { ...base, orderedFields: fields });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.planRevision, 1);
  const wrong = await call('POST', `/v1/sessions/${sid}/plan`, { ...base, orderedFields: [...fields].reverse(), qualificationId: '宅地建物取引士' });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.error, 'QUALIFICATION_MISMATCH');
  const same = await call('POST', `/v1/sessions/${sid}/plan`, { ...base, orderedFields: fields, qualificationId: '土地家屋調査士' });
  assert.equal(same.status, 200);
  assert.equal(same.body.planRevision, 2, '拒否した変更は版を進めず、保存済みの版から続く');
  assert.deepEqual(same.body.orderedFields, fields);
});
