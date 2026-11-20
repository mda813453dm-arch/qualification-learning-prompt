// Cloud Run 公開後の検査：学習画面 v204 の解答前ヒント・採点後訂正・再想起、旧v203〜v200互換性。
// 独立した検査用の学習（測量士補 2026年度 問6 を直接指定）だけを使い、利用者の学習記録には触れない。トークンは出力しない。
// 1) 現行版 v204 が配信され、旧版 v203・v202・v201・v200 は元のHTMLのままで、状態報告も可能。
// 2) 出題・採点・保存済み画面・照合の応答に、正式分野の一覧（fieldJump）が付く。
// 3) 採点後に選んだ別の分野へ nextQuestion({fieldName}) で直接進み、先取りした通常の次問を使い回さない。
// 4) 出題できる問題が無い分野を選ぶと、ほかの分野へ切り替えずに案内だけを返す（一覧にその分野がある場合）。
import assert from 'node:assert/strict';
import { WIDGET_URI, WIDGET_VERSION } from '../engine/src/widget-current.js';
const base = process.env.QLP_BASE_URL;
const token = process.env.QLP_TEST_TOKEN;
assert.ok(base && token, '公開先と認証が必要');
let id = 1;
async function rpc(method, params) {
  const r = await fetch(base + '/app', { method: 'POST', signal: AbortSignal.timeout(180000),
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  assert.equal(r.status, 200, method + ' HTTP ' + r.status);
  const m = await r.json();
  assert.equal(m.error, undefined, method + ' RPC error');
  return m.result;
}
async function tool(name, args) {
  const result = await rpc('tools/call', { name, arguments: args });
  assert.ok(result && !result.isError, name + ' ' + JSON.stringify(result?.structuredContent || result?.content).slice(0, 300));
  return result._meta?.qlp ?? result.structuredContent;
}

assert.equal(WIDGET_URI, 'ui://qlp/question-v204.html');
const publishedTools = (await rpc('tools/list', {})).tools;
const importTool = publishedTools.find(t => t.name === 'importHandoff');
const legacyOpenTool = publishedTools.find(t => t.name === 'openHandoffView');
assert.equal(importTool?._meta?.['openai/outputTemplate'], WIDGET_URI, '引継ぎ1回目の応答に再開用学習枠を添付する');
assert.equal(legacyOpenTool?._meta?.['openai/outputTemplate'], WIDGET_URI, '旧版の引継ぎ画面復元も保持');
const cur = await rpc('resources/read', { uri: WIDGET_URI });
assert.ok(cur.contents[0].text.includes(WIDGET_VERSION) && cur.contents[0].text.includes('qlp-field-jump-v200') &&
  cur.contents[0].text.includes('qlp-route-v201') && cur.contents[0].text.includes('qlp-question-layout-v199') &&
  cur.contents[0].text.includes('qlp-feedback-v202') && cur.contents[0].text.includes('qlp-ai-latency-v203') &&
  cur.contents[0].text.includes('正解理由と私が選んだ回答の誤り・混同点') &&
  cur.contents[0].text.includes('qlp-study-stages-v204') &&
  cur.contents[0].text.includes('ヒントを見る（任意・正答は非表示）') &&
  cur.contents[0].text.includes('再想起の答え合わせ：') &&
  cur.contents[0].text.includes('判断理由は、この正答表だけでは確認できません'),
  '現行版 v204（解答前の任意ヒント・解答後の訂正・再想起）を配信');
const v203 = await rpc('resources/read', { uri: 'ui://qlp/question-v203.html' });
assert.equal(v203.contents[0].uri,'ui://qlp/question-v203.html');
assert.ok(v203.contents[0].text.includes('2026-11-20.203') &&
  v203.contents[0].text.includes('qlp-ai-latency-v203') &&
  !v203.contents[0].text.includes('qlp-study-stages-v204'), '直前版v203のHTMLを変更せず維持');
const legacy203Report = await rpc('tools/call', {name:'reportUiEvent',arguments:{stage:'render_other',version:'2026-11-20.203'}});
assert.equal(legacy203Report.isError,undefined,'v203からの状態報告も維持');
const v202 = await rpc('resources/read', { uri: 'ui://qlp/question-v202.html' });
assert.equal(v202.contents[0].uri,'ui://qlp/question-v202.html');
assert.ok(v202.contents[0].text.includes('2026-11-20.202') &&
  v202.contents[0].text.includes('qlp-feedback-v202') &&
  !v202.contents[0].text.includes('qlp-ai-latency-v203'), '旧v202はその版のHTMLのまま');
const legacy202Report = await rpc('tools/call', {name:'reportUiEvent',arguments:{stage:'render_other',version:'2026-11-20.202'}});
assert.equal(legacy202Report.isError,undefined,'v202からの状態報告も維持');
const v201 = await rpc('resources/read', { uri: 'ui://qlp/question-v201.html' });
assert.equal(v201.contents[0].uri,'ui://qlp/question-v201.html');
assert.ok(v201.contents[0].text.includes('2026-11-19.201') && v201.contents[0].text.includes('qlp-route-v201') &&
  !v201.contents[0].text.includes('qlp-feedback-v202'), '直前版v201のHTMLを変更せず維持');
const legacyReport = await rpc('tools/call', { name: 'reportUiEvent', arguments: { stage: 'render_other', version:'2026-11-19.201' } });
assert.equal(legacyReport.isError, undefined, 'v201の状態報告を受け付ける');
const v200 = await rpc('resources/read', { uri: 'ui://qlp/question-v200.html' });
assert.equal(v200.contents[0].uri, 'ui://qlp/question-v200.html');
assert.ok(v200.contents[0].text.includes('2026-11-18.200') && v200.contents[0].text.includes('qlp-field-jump-v200') && !v200.contents[0].text.includes('qlp-route-v201'), '直前版 v200 をその版のまま維持');
const reported = await rpc('tools/call', { name: 'reportUiEvent', arguments: { stage: 'render_other', version: '2026-11-18.200' } });
assert.equal(reported.isError, undefined, 'v200 の画面からの状態報告を受け付ける');
console.log('PASS 画面', WIDGET_URI, 'と旧版 v203/v202/v201/v200（段階別の学習と正答非表示）');

const data = await tool('startSession', { qualificationId: '測量士補', sources: [], requestedQuestion: { year: 2026, questionNumber: 6 } });
assert.equal(data.status, 'question');
const q = data.question, sid = data.sessionId;
assert.ok(q.fieldJump && Array.isArray(q.fieldJump.choices) && q.fieldJump.choices.length >= 2, '出題の応答に分野一覧');
assert.equal(q.fieldJump.gradedQuestionId, q.questionId);
assert.ok(q.fieldJump.choices.some((c) => c.fieldName === q.fieldName), '出題中の分野を含む');
assert.deepEqual(q.progress.fieldNames, q.fieldJump.choices.map(c => c.fieldName), '実践問題の全分野ルートは保存した学習計画順');
const graded = await tool('submitAnswer', { sessionId: sid, questionId: q.questionId, value: '1' });
assert.ok(graded.grade?.fieldJump, '採点の応答に分野一覧');
assert.equal(graded.grade.fieldJump.gradedQuestionId, q.questionId);
const prefetchedId = graded.next?.question?.questionId ?? null;
const snap = await tool('getStudySnapshot', { sessionId: sid });
assert.ok(['restoredGrade', 'menu'].includes(snap.status), '採点済みの画面を保存（未回答の問として扱わない）: ' + snap.status);
if (snap.status === 'restoredGrade') assert.equal(snap.grade.fieldJump?.gradedQuestionId, q.questionId, '保存済み画面にも分野一覧');
const ctx = await tool('explainSpec', { sessionId: sid });
assert.equal(ctx.status, 'explanationContext');
assert.equal(ctx.fieldJump?.gradedQuestionId, q.questionId, '照合の応答にも分野一覧');
assert.deepEqual(ctx.journey.fieldNames, ctx.fieldJump.choices.map(c => c.fieldName), '解説後も全分野の学習順が一致する');
const empty = q.fieldJump.choices.find((c) => c.available === false);
if (empty) {
  const none = await tool('nextQuestion', { sessionId: sid, fieldName: empty.fieldName });
  assert.equal(none.status, 'fieldExhausted', '問題の無い分野は他へ切り替えない');
  assert.equal(none.question, undefined);
}
const target = q.fieldJump.choices.find((c) => c.available !== false && c.fieldName !== q.fieldName &&
  c.fieldName !== graded.next?.question?.fieldName) ?? q.fieldJump.choices.find((c) => c.available !== false && c.fieldName !== q.fieldName);
assert.ok(target, '移動先にできる別の分野がある');
const moved = await tool('nextQuestion', { sessionId: sid, fieldName: target.fieldName });
assert.equal(moved.status, 'question', JSON.stringify(moved).slice(0, 300));
assert.equal(moved.question.fieldName, target.fieldName, '選んだ分野の問題');
assert.notEqual(moved.question.questionId, q.questionId);
if (prefetchedId && graded.next?.question?.fieldName !== target.fieldName)
  assert.notEqual(moved.question.questionId, prefetchedId, '先取りした通常の次問を使い回さない');
assert.ok(moved.question.fieldJump, '移動後の問題にも分野一覧');
assert.deepEqual(moved.question.progress.fieldNames, moved.question.fieldJump.choices.map(c => c.fieldName), '分野移動後も正式なルートが一致する');
console.log('PASS production field jump', q.fieldName, '→', target.fieldName, empty ? '(問題なし分野も確認: ' + empty.fieldName + ')' : '');
