import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {ROOT,listAvailable,selectEntry,checkPacketSet,buildVisibleQuestion,createSession,verifyPngBytes} from './engine.mjs';

const image='https://raw.githubusercontent.com/mda813453dm-arch/qualification-learning-prompt/ai-learning-system/新システム開発/data/runtime-packets/assets/q063/2026/question-7-page-9.png';
const sha='a'.repeat(64);
const p={sourceMode:'static_verified_official_packet',packetStatus:'verified_official',fieldId:'q063-survey-calculation',year:2026,section:'測量士補',questionId:'q063-2026-07',questionNumber:7,stem:'公式問題本文・図表はdiagramAssetsの公式PDFページ画像を一体表示して出題する。',choices:['A','B','C','D','E'],correctAnswer:4,diagramRequired:true,diagramAssets:[{url:image,sha256:sha,sourcePdfPage:9,kind:'official_question_page'}],questionPdfSha256:sha,answerPdfSha256:sha,questionPdfUrl:'https://example.go.jp/problem.pdf',answerPdfUrl:'https://example.go.jp/answer.pdf',verification:{questionText:'official_pdf_checked',choices:'official_pdf_checked',visual:'question_level_pdf_graphics_checked',answer:'same_year_official_answer_checked',field:'verified'}};
const ent={qualificationId:'q063',fieldId:'q063-survey-calculation',year:2026,packetCount:1,verificationStatus:'verified_official',packetUrl:ROOT+'verified/q063-2026-visual.json'};
const set={schemaVersion:1,verificationStatus:'verified_official',qualificationId:'q063',fieldId:ent.fieldId,year:2026,packets:[p]};
const clone=x=>structuredClone(x);

test('capability and manifest both required; no unsupported self-assertion',()=>{
  const cap={schemaVersion:1,qualifications:[{qualificationId:'q063',officialPracticeRuntime:'static_verified_packets_available'},{qualificationId:'q099',officialPracticeRuntime:'static_verified_packets_available'}]};
  const manifest={schemaVersion:1,entries:[ent]};
  assert.deepEqual(listAvailable(cap,manifest),[{id:'q063',name:'測量士補'}]);
  assert.deepEqual(listAvailable(cap,{schemaVersion:1,entries:[]}),[]);
  assert.equal(selectEntry(manifest,'q063'),ent);
  assert.throws(()=>selectEntry(manifest,'q041'),/VERIFIED_PACKETS_NOT_AVAILABLE/);
});
test('verified packet accepted; missing fields fail closed',()=>{
  assert.equal(checkPacketSet(set,ent)[0].questionId,p.questionId);
  for(const mutation of [q=>{q.choices=[]},q=>{q.correctAnswer=9},q=>{q.diagramAssets=[]},q=>{q.verification.answer='invented'},q=>{q.diagramAssets[0].url='https://sokuryoshiho.kakomonn.com/image.png'},q=>{q.questionPdfSha256='broken'},q=>{q.sourceMode='AI_generated'}]){
    const changed=clone(set);mutation(changed.packets[0]);assert.throws(()=>checkPacketSet(changed,ent));
  }
});
test('placeholder never displayed as text; image required before answer',()=>{
  assert.throws(()=>buildVisibleQuestion(p,[]),/IMAGE_NOT_VERIFIED/);
  const q=buildVisibleQuestion(p,['blob:http://local/image']);
  assert.equal(q.stem,'');assert.equal(q.choices.length,5);
  assert.deepEqual(q.images,['blob:http://local/image']);
});
test('invalid transitions and unverified render never become answer waiting',()=>{
  let t=0;const s=createSession({now:()=>++t});
  assert.equal(s.dispatch('ANSWER',{value:4}).ok,false);
  assert.equal(s.dispatch('QUALIFY',{id:'q063'}).ok,true);
  assert.equal(s.dispatch('SET_STAGE',{value:4}).ok,false);
  assert.equal(s.dispatch('OVERVIEW_ACK').ok,true);
  assert.equal(s.dispatch('SET_STAGE',{value:4}).ok,true);
  assert.equal(s.dispatch('APPROVE_PLAN').ok,true);
  assert.equal(s.state().startedAt,1);
  assert.equal(s.dispatch('SET_MODE',{mode:'EXPLAIN'}).ok,false);
  assert.equal(s.dispatch('SET_MODE',{mode:'PRACTICE'}).ok,true);
  assert.equal(s.dispatch('PREPARE',{packets:[p],index:0}).ok,true);
  assert.equal(s.dispatch('ANSWER',{value:4}).ok,false);
  assert.equal(s.dispatch('DISPLAY_VERIFIED',{question:{questionId:'WRONG',choices:p.choices,instruction:'番号で答えてください。'}}).ok,false);
  const visible=buildVisibleQuestion(p,['blob:verified/png']);
  assert.equal(s.dispatch('DISPLAY_VERIFIED',{question:visible}).ok,true);
  assert.equal(s.dispatch('ANSWER',{value:6}).ok,false);
  assert.equal(s.dispatch('ANSWER',{value:4}).state.graded.correct,true);
  assert.equal(s.dispatch('ANSWER',{value:1}).ok,false);
  assert.equal(s.dispatch('NEXT').state.phase,'FINISHED');
});
test('exemption requires explicit choice and cannot skip',()=>{
  const s=createSession();s.dispatch('QUALIFY',{id:'q041'});s.dispatch('OVERVIEW_ACK');
  assert.equal(s.state().phase,'EXEMPTION');
  assert.equal(s.dispatch('SET_STAGE',{value:4}).ok,false);
  assert.equal(s.dispatch('SET_EXEMPTION',{value:2}).ok,true);
  assert.equal(s.state().exemption,false);
});
test('3 consecutive wrong answers cannot silently proceed',()=>{
  const s=createSession();s.dispatch('QUALIFY',{id:'q063'});s.dispatch('OVERVIEW_ACK');s.dispatch('SET_STAGE',{value:4});s.dispatch('APPROVE_PLAN');s.dispatch('SET_MODE',{mode:'PRACTICE'});
  const qs=[1,2,3,4].map(n=>({...p,questionNumber:n,questionId:'q-'+n}));
  for(let i=0;i<3;i++){
    assert(s.dispatch('PREPARE',{packets:qs,index:i}).ok);
    const v=buildVisibleQuestion(qs[i],['blob:a']);s.dispatch('DISPLAY_VERIFIED',{question:v});
    s.dispatch('ANSWER',{value:1});assert.equal(s.state().wrongStreak,i+1);
    s.dispatch('NEXT');
  }
  assert.equal(s.state().phase,'REVIEW_BLOCKED');assert.equal(s.dispatch('PREPARE',{packets:qs,index:3}).ok,false);
});
test('verified PNG only when bytes match SHA and signature',async()=>{
  const good=new Uint8Array([137,80,78,71,13,10,26,10,1,2]);
  const digest=await webcrypto.subtle.digest('SHA-256',good);
  const hex=Buffer.from(digest).toString('hex');
  assert.equal(await verifyPngBytes(good.buffer,hex,webcrypto.subtle),true);
  await assert.rejects(verifyPngBytes(good.buffer,sha,webcrypto.subtle),/IMAGE_SHA256_MISMATCH/);
  const invalid=new Uint8Array([0,1,2,3,4,5,6,7,8,9]);
  const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',invalid)).toString('hex');
  await assert.rejects(verifyPngBytes(invalid.buffer,hash,webcrypto.subtle),/IMAGE_NOT_PNG/);
});
test('real repository manifest and surveying packets integrate when checked out',async t=>{
  const prefix=new URL('../data/runtime-packets/',import.meta.url);
  let cap,manifest;try{cap=JSON.parse(await readFile(new URL('capabilities.json',prefix),'utf8'));manifest=JSON.parse(await readFile(new URL('manifest.json',prefix),'utf8'));}catch{t.skip('repository data files are not present in this local test copy');return;}
  const c=listAvailable(cap,manifest);assert(c.some(x=>x.id==='q063'));
  const e=selectEntry(manifest,'q063');
  const packet=JSON.parse(await readFile(new URL('verified/q063-2026-visual.json',prefix),'utf8'));
  const questions=checkPacketSet(packet,e);
  assert.equal(questions.length,2);
  assert.deepEqual(questions.map(q=>q.questionNumber),[7,27]);
});