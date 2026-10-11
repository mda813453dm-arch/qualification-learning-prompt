import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialPracticeEntry} from '../src/official-practice-entry.js';
const urlQ='https://www.moj.go.jp/content/001450011.pdf';
const urlA='https://www.moj.go.jp/content/001450015.pdf';
const sample={
 status:'verified',key:{qualification:'土地家屋調査士'},
 provenance:{sourceType:'official_pdf_pair',registryKey:'土地家屋調査士:2025:午後',
 questionPdfUrl:urlQ,answerPdfUrl:urlA,questionSha256:'0'.repeat(64),answerSha256:'0'.repeat(64)},
 question:{id:1,year:2025,section:'午後',text:'問題文',choices:[{text:'1'},{text:'2'}],source:{official:true,url:urlQ}},
 answer:{questionId:1,year:2025,section:'午後',number:2,page:1,evidence:'正答',source:{official:true,url:urlA}}
};
test('公開入口は利用者指定ハッシュが不一致なら通信前に拒否',async()=>{
 const controller=createOfficialPracticeEntry({adapters:[],retrieveAndVerify:async()=>structuredClone(sample)});
 const result=await controller.request('session',{});
 assert.equal(result.status,'unavailable');
 assert.throws(()=>controller.submit('session',1),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('公開入口はアップロードPDFの自己申告を拒否',async()=>{
 const controller=createOfficialPracticeEntry({adapters:[],retrieveAndVerify:async()=>({...structuredClone(sample),provenance:{sourceType:'uploaded_pinned_pdf'}})});
 const result=await controller.request('session',{});
 assert.equal(result.status,'unavailable');
 assert.equal(result.reason,'OFFICIAL_PROVENANCE_UNVERIFIED');
});
test('公開入口は他年度の登録キーを拒否',async()=>{
 const controller=createOfficialPracticeEntry({adapters:[],retrieveAndVerify:async()=>({...structuredClone(sample),provenance:{...sample.provenance,registryKey:'土地家屋調査士:2024:午後'}})});
 assert.equal((await controller.request('session',{})).status,'unavailable');
});
