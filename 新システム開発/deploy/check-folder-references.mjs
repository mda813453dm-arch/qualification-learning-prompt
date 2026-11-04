import assert from 'node:assert/strict';
const base=process.env.QLP_BASE_URL?.replace(/\/$/,'');
const token=process.env.QLP_TEST_TOKEN;
if(!base?.startsWith('https://')||!token)throw Error('FOLDER_REFERENCE_CHECK_ENV_MISSING');
async function api(method,path,payload) {
  const response=await fetch(base+path,{method,headers:{authorization:'Bearer '+token,
    'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{}),
    signal:AbortSignal.timeout(120000)});
  const result=await response.json();
  if(!response.ok)throw Error('FOLDER_REFERENCE_CHECK_HTTP_'+response.status+'_'+(result.code||result.error||''));
  return result;
}
// A separate operator test session; never reuses a learner or current chat.
const session=await api('POST','/v1/sessions',{qualificationId:'land_surveyor',sources:[]});
assert(session.sessionId);
const prefix='/v1/sessions/'+encodeURIComponent(session.sessionId);
const before=await api('GET',prefix+'/official-library');
assert(before.sharedLibrary.totalQuestions>=330);
const current=await api('POST',prefix+'/descriptive',{year:2022,section:'午前の部',number:11});
assert.equal(current.question.year,2022);
assert.equal(current.question.number,11);
const hidden=await api('GET',prefix+'/descriptive/context');
assert.equal(hidden.providedReferenceDocuments,undefined);
await api('POST',prefix+'/descriptive/reveal',{questionId:current.question.questionId});
const shown=await api('GET',prefix+'/descriptive/context');
const docs=shown.providedReferenceDocuments;
assert(Array.isArray(docs)&&docs.length===1,'DEPLOYED_REFERENCE_DOCUMENT_MISSING');
assert.equal(docs[0].sourcePdfSha256,'46f18ddc1d6220e790c7703f39ad023902d86cffcb8165bb0d9b78eea390600b');
assert.equal(docs[0].gradingMode,'none');
assert.match(docs[0].source,/公式模範解答ではない/);
assert(docs[0].text.length>0);
const after=await api('GET',prefix+'/official-library');
assert.equal(after.sharedLibrary.totalQuestions,before.sharedLibrary.totalQuestions);
console.log('PASS deployed folder reference: matching source only after reveal; existing MCQ count preserved');
