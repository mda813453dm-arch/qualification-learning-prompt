import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuardedPracticeController} from '../src/guarded-practice-controller.js';
const evidence={status:'verified',key:{qualification:'宅建'},provenance:{sourceType:'official_pdf_pair'},question:{id:1,year:2025,section:'本試験',text:'問題文',choices:[{text:'1'},{text:'2'}],source:{official:true}},answer:{questionId:1,year:2025,section:'本試験',number:2,page:1,evidence:'問1=2',source:{official:true,url:'https://example.org/answer.pdf'}}};
const make=(verify,fetch=async()=>structuredClone(evidence))=>createGuardedPracticeController({retrieveAndVerify:fetch,adapters:[],verifyOfficialSource:verify});
test('独立公式性確認が否認なら出題拒否',async()=>{
 const c=make(async()=>false);
 assert.equal((await c.request('s',{})).status,'unavailable');
 assert.throws(()=>c.submit('s',1),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('アップロードPDFは公式出題経路を通さない',async()=>{
 const c=make(async()=>true,async()=>({...structuredClone(evidence),provenance:{sourceType:'uploaded_pinned_pdf'}}));
 assert.equal((await c.request('s',{})).status,'unavailable');
});
test('公式性確認と設問正答一致の両方が成功した場合のみ採点',async()=>{
 const c=make(async()=>true);
 const q=await c.request('s',{});
 assert.equal(q.status,'question');
 assert.equal(Object.hasOwn(q,'correctChoice'),false);
 assert.equal(c.submit('s',2).correct,true);
 assert.throws(()=>c.submit('s',2),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('古い非同期取得が後から完了しても最新要求を上書きしない',async()=>{
 let release;let calls=0;
 const c=make(async()=>true,async()=>{
  calls++;
  if(calls===1)await new Promise(resolve=>{release=resolve;});
  return structuredClone(evidence);
 });
 const first=c.request('s',{});
 const second=await c.request('s',{});
 assert.equal(second.status,'question');
 release();
 assert.equal((await first).status,'superseded');
 assert.equal(c.submit('s',2).correct,true);
});
test('キャンセル後に遅延した取得が完了しても出題しない',async()=>{
 let release;
 const c=make(async()=>true,async()=>{await new Promise(resolve=>{release=resolve;});return structuredClone(evidence);});
 const pending=c.request('s',{});
 c.cancel('s');release();
 assert.equal((await pending).status,'superseded');
 assert.throws(()=>c.submit('s',2),/NO_VERIFIED_ACTIVE_QUESTION/);
});
