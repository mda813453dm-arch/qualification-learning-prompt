// 本番の新規テスト用セッションのみを使用。実利用者の記録や択一正答は変更しない。
import assert from 'node:assert/strict';
const base = process.env.QLP_BASE_URL;
const token = process.env.QLP_TEST_TOKEN;
assert.ok(base && token);
async function api(method,path,body) {
  const res=await fetch(base+path,{method,
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(240000)});
  const value=await res.json();
  assert.ok(res.ok,method+' '+path+' '+res.status+' '+JSON.stringify(value).slice(0,250));
  return value;
}
const session=await api('POST','/v1/sessions',{qualificationId:'land_surveyor',sources:[]});
assert.ok(session.sessionId && session.learnerId);
const prefix='/v1/sessions/'+encodeURIComponent(session.sessionId);
const study=await api('POST','/v1/study/start',{qualificationName:'土地家屋調査士',learnerId:session.learnerId});
assert.ok(study.studyId);
for(const [section,n,count] of [['午前の部',11,2],['午後の部',21,10],['午後の部',22,9]]) {
  const d=await api('POST',prefix+'/descriptive',{year:2025,section,number:n});
  assert.equal(d.status,'descriptiveQuestion');
  assert.equal(d.question.kind,'descriptive');
  assert.equal(d.question.gradingMode,'none');
  assert.equal(d.question.correctAnswer,undefined);
  assert.equal(d.question.choices,undefined);
  assert.equal(d.question.pages.length,count);
  assert.ok(d.question.text.length>500);
  const ctx=await api('GET',prefix+'/descriptive/context');
  assert.equal(ctx.questionId,d.question.questionId);
  assert.equal(ctx.officialModelAnswerVerified,false);
  const shown=await api('POST',prefix+'/descriptive/reveal',{});
  assert.equal(shown.status,'descriptiveReveal');
  assert.equal(shown.grade,undefined);
  const restored=await api('GET',prefix+'/restore');
  assert.equal(restored.status,'descriptiveReveal');
  assert.equal(restored.question.questionId,d.question.questionId);
  const image=await fetch(d.question.pages[0].url,{signal:AbortSignal.timeout(30000)});
  assert.ok(image.ok,'official page image '+n);
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0,4)],[137,80,78,71]);
  console.log('PASS original descriptive',section,n,'pages',count);
}
const end=await api('POST','/v1/study/'+encodeURIComponent(study.studyId)+'/end',{sessionId:session.sessionId});
assert.match(end.log,/午後の部 問22/);
assert.match(end.handoff,/午前の部 問11/);
console.log('PASS all 2025 descriptive pages and non-graded reveal/restore/handoff');
