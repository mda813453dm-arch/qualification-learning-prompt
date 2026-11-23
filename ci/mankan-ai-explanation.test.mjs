import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Usage: QLP_ROOT=/path/to/patched-checkout node --test mankan-ai-explanation.test.mjs
const src = resolve(process.env.QLP_ROOT ?? process.cwd(), '新システム開発/engine/src');
const load = name => import(pathToFileURL(resolve(src, name)));
const { explainHow, OFFICIAL_GRADE_POLICY } = await load('explain.js');
const { appInstructions, handleRpc, TOOLS } = await load('mcp.js');
const { handle } = await load('app.js');

const expect = {
  noOption: /正解肢なし.*選んだ肢を内容上の正解とは説明しない/,
  multiple: /採点上正解とされた選択肢は2・3.*内容上正しいとは断定せず/,
  recheck: /要再照合.*単一番号や矛盾した正答集合を正解と断定せず/,
};

const answer = (number, selected, grade = {}) => ({
  questionId: `q018:2022:main:${number}`,
  result: 'wrong',
  correct: false,
  correctAnswer: 2,
  selected,
  ...grade,
});
const q9 = (selected, acceptedAnswers) => answer(9, selected, {
  correctAnswerLabel: '2または3', acceptedAnswers,
  ...([2, 3].includes(selected) ? { result: 'confident_correct', correct: true } : {}),
});

const cases = [
  ['問4 公式正解肢なし', answer(4, 2, { correct: true, result: 'confident_correct', correctAnswerLabel: '正解肢なし（全員正解）', acceptedAnswers: [1, 2, 3, 4] }), expect.noOption],
  ['問9 選択肢2', q9(2, [2, 3]), expect.multiple],
  ['問9 選択肢3', q9(3, [2, 3]), expect.multiple],
  ['問9 選択肢1（誤答）', q9(1, [3, 2]), /採点上正解とされた選択肢は2・3[\s\S]*選んだ1は不正解/],
  ['問9 集合未保存', q9(1, undefined), expect.recheck],
  ['問9 集合null', q9(1, null), expect.recheck],
  ['問9 集合空', q9(1, []), expect.recheck],
  ['問9 集合一部', q9(1, [2]), expect.recheck],
  ['問9 集合不一致', q9(1, [2, 4]), expect.recheck],
  ['通常問題 正答集合なし', answer(1, 1, { correctAnswer: 3 }), /今回は不正解（選んだのは1、正答は3）/],
  ['通常問題 正答集合優先', answer(1, 2, { acceptedAnswers: [3] }), /今回は不正解（選んだのは2、正答は3）/],
  ['通常問題 正答済み', answer(1, 3, { correctAnswer: 3, correct: true, result: 'confident_correct' }), /今回は自信をもって正解/],
];

const sid = '1'.repeat(8) + '-1111-1111-1111-' + '1'.repeat(12);
const ref = 'E-1234567890abcdef';
const now = Date.UTC(2026, 10, 23, 6);
function fixture(grade, referenceId = grade.questionId) {
  const question = { questionId: grade.questionId, figures: [] };
  const state = { qualificationId: 'q018', history: {}, lastExplanation: { questionId: grade.questionId, grade, question } };
  const data = new Map([
    [`ses/${sid}`, JSON.stringify({ state, savedAt: now })],
    [`eref/${ref}`, JSON.stringify({ sessionId: sid, questionId: referenceId })],
  ]);
  const puts = [];
  const env = {
    clock: () => now,
    API_TOKEN: 'local-test-token',
    STORE: {
      get: async (key, mode) => mode === 'json' ? JSON.parse(data.get(key) ?? 'null') : data.get(key),
      put: async (key, value) => { puts.push(key); data.set(key, value); },
    },
  };
  const calls = [];
  const rpc = async (name, args) => {
    const reply = await handleRpc({ jsonrpc: '2.0', method: 'tools/call', id: 1, params: { name, arguments: args } },
      async (method, path) => {
        calls.push([method, path]);
        assert.equal(method, 'GET');
        assert.equal(path, `/v1/explanation-ref/${ref}`);
        const res = await handle(new Request(`https://local.invalid${path}`, { method, headers: { authorization: 'Bearer local-test-token' } }), env);
        return { status: res.status, body: await res.json() };
      }, { widget: true });
    return reply.result;
  };
  return { data, calls, puts, rpc };
}

for (const [name, grade, expected] of cases) {
  test(name + '：詳説指示とE照合の両経路', async () => {
    const guide = explainHow({ grade });
    assert.match(guide, expected);
    if (expected === expect.recheck) assert.doesNotMatch(guide, /正答は\d|採点上正解とされた選択肢は/);
    const { data, calls, puts, rpc } = fixture(grade);
    const before = data.get(`ses/${sid}`);
    const a = await rpc('nextQuestion', { sessionId: ref });
    const b = await rpc('explainSpec', { explanationRef: ref });
    for (const result of [a, b]) {
      assert.equal(result.isError, false, JSON.stringify(result));
      const ctx = result.structuredContent;
      assert.equal(ctx.question.questionId, grade.questionId);
      assert.equal(ctx.grade.questionId, grade.questionId);
      for (const key of ['correct','result','correctAnswerLabel','acceptedAnswers']) assert.deepEqual(ctx.grade[key], grade[key]);
      assert.match(ctx.grade.explainHow, expected);
      assert.ok(ctx.howToProceed.includes(OFFICIAL_GRADE_POLICY));
    }
    assert.deepEqual(a.structuredContent, b.structuredContent);
    assert.deepEqual(calls, Array(2).fill(['GET', `/v1/explanation-ref/${ref}`]));
    assert.ok(puts.every(key => key.startsWith('eref/')), JSON.stringify(puts));
    assert.equal(data.get(`ses/${sid}`), before);
  });
}

test('E照合番号が別の問題を指す場合、両経路で拒否する', async () => {
  const { rpc, puts } = fixture(q9(1, [2, 3]), 'q018:2022:main:4');
  for (const [tool, args] of [['nextQuestion', { sessionId: ref }], ['explainSpec', { explanationRef: ref }]]) {
    const result = await rpc(tool, args);
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent, { error: 'EXPLANATION_BINDING_MISMATCH' });
  }
  assert.deepEqual(puts, []);
});

test('MCPツール説明とアプリ指示が共通方針を含み、単一正答の旧指示を含まない', () => {
  for (const guide of [TOOLS.find(tool => tool.name === 'explainSpec').description, appInstructions()]) {
    assert.ok(guide.includes(OFFICIAL_GRADE_POLICY));
    assert.doesNotMatch(guide, /正答はgrade\.correctAnswerだけ|全choices・grade\.correctAnswer/);
  }
});
