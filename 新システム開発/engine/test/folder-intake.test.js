import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,publicEncrypt,constants,createCipheriv} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {MemoryStore} from '../src/store.js';
import {decryptFolderEnvelope,importFolderBundle,readFolderReferenceDocuments,
  folderSourceKey,folderPdfKey,folderReferenceKey} from '../src/folder-intake.js';

const bytes=Buffer.from('%PDF-1.7\n'+ 'a source document\n'.repeat(12));
const sha=createHash('sha256').update(bytes).digest('hex');
const target={year:2012,section:'午後の部',number:21,sha:'b'.repeat(64)};
const doc=()=>({sha256:sha,bytes:bytes.length,pages:1,fileName:'h24gogo_q21.pdf',
  role:'reference_solution',year:2012,section:'午後の部',
  downloadUrl:'https://files.oaiusercontent.com/file.pdf?private-signed-parameter',
  sourceUrl:'https://drive.google.com/file/d/source/view',
  extractedText:'利用者の参考解答。原本と独立検算が必要。',referenceTargets:[target]});
const request={requestId:'test-intake',expectedDocuments:1};
const bundle=(documents=[doc()])=>({schemaVersion:1,qualificationId:'land_surveyor',requestId:request.requestId,documents});
const fetchPdf=async()=>bytes;

test('authenticated encryption binds both request identity and ciphertext',()=>{
  const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  const key=randomBytes(32),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(request.requestId));
  const ciphertext=Buffer.concat([cipher.update(gzipSync(JSON.stringify(bundle()))),cipher.final()]);
  const envelope={version:1,requestId:request.requestId,algorithm:'RSA-OAEP-SHA256+A256GCM',
    wrappedKey:publicEncrypt({key:pair.publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key).toString('base64'),
    iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
  assert.deepEqual(decryptFolderEnvelope(envelope,pair.privateKey,request.requestId),bundle());
  assert.throws(()=>decryptFolderEnvelope(envelope,pair.privateKey,'wrong-request'));
  const corrupt=Buffer.from(ciphertext);corrupt[0]^=1;
  assert.throws(()=>decryptFolderEnvelope({...envelope,ciphertext:corrupt.toString('base64')},pair.privateKey,request.requestId));
});

test('hash mismatch in any original stops all writes, including earlier valid documents',async()=>{
  const store=new MemoryStore();let writes=0;
  store.put=async()=>{writes++;};
  const other={...doc(),sha256:'c'.repeat(64),fileName:'other.pdf'};
  await assert.rejects(importFolderBundle(bundle([doc(),other]),{...request,expectedDocuments:2},{store,fetchPdf}),/SOURCE_PDF_MISMATCH/);
  assert.equal(writes,0);
});

test('reject arbitrary downloads, duplicates, and cross-year reference targets before fetch',async()=>{
  for(const invalid of [
    [{...doc(),downloadUrl:'https://example.com/a.pdf'}],
    [doc(),doc()],
    [{...doc(),referenceTargets:[{...target,year:2013}]}],
    [{...doc(),role:'official_answer'}],
  ]) {
    let fetched=false;
    await assert.rejects(importFolderBundle(bundle(invalid),{...request,expectedDocuments:invalid.length},
      {store:new MemoryStore(),fetchPdf:async()=>{fetched=true;return bytes;}}));
    assert.equal(fetched,false);
  }
});

test('register originals and reference text with readback, never graded packets or learner data',async()=>{
  const store=new MemoryStore(),keys=[];
  const put=store.put.bind(store);store.put=async(k,v,o)=>{keys.push(k);return put(k,v,o);};
  await store.put('ses/current',JSON.stringify({unanswered:true}));keys.length=0;
  const first=await importFolderBundle(bundle(),request,{store,fetchPdf,now:123});
  assert.equal(first.newDocuments,1);assert.equal(first.gradedQuestionsAdded,0);
  assert(keys.every(k=>/^(?:att\/folder-intake|folder-source|folder-reference|folder-intake)\//.test(k)));
  assert.deepEqual(await store.get('ses/current','json'),{unanswered:true});
  const saved=await store.get(folderSourceKey(sha),'json');
  assert.equal(saved.downloadUrl,undefined);assert.equal(saved.gradingApproved,false);
  assert.equal(saved.answerAuthority,'user_provided_nonofficial_solution');
  assert.equal(saved.extractedText,doc().extractedText);
  const second=await importFolderBundle(bundle(),request,{store,fetchPdf});
  assert.equal(second.newDocuments,0);assert.equal(second.reused,1);
  assert.deepEqual((await store.get(folderReferenceKey(target),'json')).documents,[sha]);
});

test('no references before reveal, for another year/section or another original hash',async()=>{
  const store=new MemoryStore();await importFolderBundle(bundle(),request,{store,fetchPdf});
  assert.deepEqual(await readFolderReferenceDocuments(store,target),[]);
  for(const mismatch of [{...target,year:2013},{...target,section:'午前の部',number:11},
    {...target,sha:'d'.repeat(64)},{...target,number:22}])
    assert.deepEqual(await readFolderReferenceDocuments(store,{...mismatch,revealedAt:1}),[]);
  const docs=await readFolderReferenceDocuments(store,{...target,revealedAt:1});
  assert.equal(docs.length,1);assert.equal(docs[0].gradingMode,'none');
  assert.equal(docs[0].text,doc().extractedText);
  assert(!JSON.stringify(docs).includes('private-signed-parameter'));
});

test('do not reuse a corrupted stored PDF',async()=>{
  const store=new MemoryStore();await importFolderBundle(bundle(),request,{store,fetchPdf});
  await store.put(folderPdfKey(sha),Buffer.from('corrupted'));
  await assert.rejects(importFolderBundle(bundle(),request,{store,fetchPdf}),/EXISTING_PDF_CORRUPTED/);
});

test('context API exposes matching reference documents only after reveal without changing state',async()=>{
  const {handle}=await import('../src/app.js');
  const store=new MemoryStore();await importFolderBundle(bundle(),request,{store,fetchPdf});
  const id='11111111-2222-4333-8444-555555555555',now=Date.parse('2026-11-04T05:00:00Z');
  const current={...target,questionId:'land_surveyor:2012:午後の部:21',
    text:'現在の問題原本',pageNumbers:[1],pages:[{page:1,url:'https://example.com/image.png'}]};
  const env={STORE:store,API_TOKEN:'test-token',clock:()=>now};
  const send=()=>handle(new Request(`https://engine.example/v1/sessions/${id}/descriptive/context`,
    {headers:{authorization:'Bearer test-token'}}),env);
  await store.put('ses/'+id,JSON.stringify({savedAt:now,state:{qualificationId:'land_surveyor',descriptiveCurrent:current}}));
  let response=await send();assert.equal(response.status,200);
  assert.equal((await response.json()).providedReferenceDocuments,undefined);
  await store.put('ses/'+id,JSON.stringify({savedAt:now,state:{qualificationId:'land_surveyor',
    descriptiveCurrent:{...current,revealedAt:now}}}));
  const before=await store.get('ses/'+id);
  response=await send();assert.equal(response.status,200);
  assert.equal((await response.json()).providedReferenceDocuments[0].text,doc().extractedText);
  assert.equal(await store.get('ses/'+id),before);
});
