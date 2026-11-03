import test from 'node:test';
import assert from 'node:assert/strict';
import { findVerifiedTopic } from '../src/engine.js';

const item = (questionId, fieldId, stem, choices = []) =>
  ({ packet: { questionId, fieldId, stem, choices } });
const state = (extra = {}) => ({ history: {}, skipped: [], ...extra });
const fields = { t7: '宅地建物取引業法と関係法令', t3: '法令上の制限' };

test('8種制限 searches relevant verified takken statutory text, not only the label', () => {
  const otherField = item('wrong-field', 't3', 'クーリング・オフについて');
  const unrelated = item('other-topic', 't7', '宅地建物取引業法第37条の書面の交付について');
  const restriction = item('eight-restrictions', 't7', '宅地建物取引業者が自ら売主となる場合の手付金等の保全措置');
  const result = findVerifiedTopic(state(), [otherField, unrelated, restriction], '8種制限', 'q041', fields);
  assert.equal(result?.item.packet.questionId, 'eight-restrictions');
  assert.equal(result?.fieldId, 't7');
  assert.equal(result?.kind, 'new');
});

test('8種制限 recognizes alternate notation and uses choice text', () => {
  const restriction = item('cooling', 't7', '次の記述のうち正しいものはどれか', ['クーリング・オフを行うことができる。']);
  for (const topic of ['８種制限', '八種制限', '8 種 制 限']) {
    const result = findVerifiedTopic(state(), [restriction], topic, 'q041', fields);
    assert.equal(result?.item.packet.questionId, 'cooling');
  }
});

test('8種制限 does not expand to general takken law or other qualifications', () => {
  const unrelated = item('37', 't7', '媒介契約の書面の交付と報酬について');
  const wrongField = item('3', 't3', '手付金等の保全について');
  const results = [unrelated, wrongField];
  assert.equal(findVerifiedTopic(state(), results, '8種制限', 'q041', fields), null);
  assert.equal(findVerifiedTopic(state(), results, '8種制限', 'q063', fields), null);
});

test('8種制限 respects skipped status and prefers unseen packet', () => {
  const old = item('already', 't7', '割賦販売の制限について');
  const unseen = item('fresh', 't7', '契約不適合責任の特約について');
  const result = findVerifiedTopic(state({ history: { already: { result: 'correct' } } }), [old, unseen], '8種制限', 'q041', fields);
  assert.equal(result?.item.packet.questionId, 'fresh');
  const skipped = findVerifiedTopic(state({ skipped: [{ questionId: 'already' }] }), [old], '8種制限', 'q041', fields);
  assert.equal(skipped, null);
});

test('ordinary free-text topics retain existing exact field matching', () => {
  const basic = item('field', 't7', '法37条の書面交付義務');
  const result = findVerifiedTopic(state(), [basic], '宅地建物取引業法と関係法令', 'q041', fields);
  assert.equal(result?.item.packet.questionId, 'field');
  assert.equal(result?.fieldId, 't7');
});
