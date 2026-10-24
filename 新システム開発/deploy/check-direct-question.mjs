// Cloud Run 公開後の問題番号直接指定テスト。利用者の学習記録・採点には触れない。
import assert from 'node:assert/strict';
const base = process.env.QLP_BASE_URL;
const token = process.env.QLP_TEST_TOKEN;
assert.ok(base && token, '公開先と認証が必要');
let id = 1;
async function rpc(name, args) {
  const r = await fetch(base + '/app', { method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:id++,method:'tools/call',
      params:{name,arguments:args}}),
    signal:AbortSignal.timeout(180000),
  });
  assert.equal(r.status,200,'MCP HTTP '+r.status);
  const result=(await r.json()).result;
  assert.ok(result && !result.isError,JSON.stringify(result?.structuredContent||result?.content).slice(0,350));
  return result._meta?.qlp ?? result.structuredContent;
}
const data=await rpc('startSession',{qualificationId:'測量士補',sources:[],
  requestedQuestion:{year:2026,questionNumber:6}});
assert.equal(data.status,'question','指定問を初期画面・ほかの問題へすり替えない');
assert.equal(data.question?.year,2026);
assert.equal(data.question?.questionNumber,6);
assert.ok(data.question?.questionId && /^q063:2026:/.test(data.question.questionId),'公式問のID');
assert.ok(data.question?.stem?.length>10,'検証済み公式問題本文が必要');
assert.ok(data.question?.choices?.length>=4,'全選択肢を返す');
assert.equal(data.question?.correctAnswer,undefined,'回答前に正答を公開しない');
assert.ok(data.sessionId && data.studyId);
const restored=await rpc('restoreStudyView',{sessionId:data.sessionId});
assert.equal(restored.question?.questionId,data.question.questionId,'同じ問の復元');
const other=await rpc('nextQuestion',{sessionId:data.sessionId,question:'2027年度 問6'});
assert.equal(other.status,'questionUnavailable','未登録年の問は別の年度にすり替えない');
assert.equal(other.question,undefined);
const rechecked=await rpc('nextQuestion',{sessionId:data.sessionId,question:'2026年度 問6'});
assert.equal(rechecked.question?.questionId,data.question.questionId,'指定した問6に戻せる');
console.log('PASS production surveyor 2026 question 6 direct launch / restore / strict year');
