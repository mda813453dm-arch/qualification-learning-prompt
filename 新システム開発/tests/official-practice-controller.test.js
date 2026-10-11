import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialPracticeController} from '../src/official-practice-controller.js';
const base={status:'verified',key:{qualification:'宅建'},provenance:{sourceType:'official_pdf_pair',questionPdfUrl:'https://www.retio.or.jp/q.pdf',answerPdfUrl:'https://www.retio.or.jp/a.pdf'},question:{id:1,year:2025,section:'本試験',text:'問題文',choices:[{text:'選択肢1'},{text:'選択肢2'}],source:{official:true,url:'https://www.retio.or.jp/q.pdf'}},answer:{questionId:1,year:2025,section:'本試験',number:2,page:1,evidence:'正答表 問1=2',source:{official:true,url:'https://www.retio.or.jp/a.pdf'}}};
const make=(verify,fn=async()=>structuredClone(base))=>createOfficialPracticeController({retrieveAndVerify:fn,adapters:[],verifyOfficialSource:verify});
test('旧入口で検証器未指定は即時拒否',()=>{
 assert.throws(()=>createOfficialPracticeController({retrieveAndVerify:async()=>base,adapters:[]}),/TRUSTED_SOURCE_VERIFIER_REQUIRED/);
});
test('出典の独立検証が失敗した場合は出題も採点も拒否',async()=>{
 const c=make(async()=>false);
 assert.equal((await c.request('A',{})).status,'unavailable');
 assert.throws(()=>c.submit('A',2),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('出題時の正答非表示と採点後の再回答拒否',async()=>{
 const c=make(async()=>true);
 const q=await c.request('A',{});
 assert.equal(q.status,'question');
 assert.equal(q.choices.length,2);
 assert.equal(Object.hasOwn(q,'correctChoice'),false);
 assert.equal(c.submit('A',2).correct,true);
 assert.throws(()=>c.submit('A',2),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('問題と正答の番号不一致を拒否',async()=>{
 const c=make(async()=>true,async()=>({...structuredClone(base),answer:{...base.answer,questionId:9}}));
 assert.equal((await c.request('A',{})).status,'rejected');
 assert.throws(()=>c.submit('A',1),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('再取得失敗時に古い問題を無効化',async()=>{
 let count=0;
 const c=make(async()=>true,async()=>++count===1?structuredClone(base):{status:'unavailable'});
 await c.request('A',{});
 assert.equal((await c.request('A',{})).status,'unavailable');
 assert.throws(()=>c.submit('A',1),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('セッション間の回答拒否と無効選択肢拒否',async()=>{
 const c=make(async()=>true);
 await c.request('A',{});
 assert.throws(()=>c.submit('B',1),/NO_VERIFIED_ACTIVE_QUESTION/);
 assert.throws(()=>c.submit('A',3),/INVALID_CHOICE/);
 assert.equal(c.submit('A',1).correct,false);
});
