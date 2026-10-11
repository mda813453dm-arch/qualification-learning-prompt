import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvenanceCheckedPipeline} from '../src/provenance-checked-pipeline.js';
const qurl='https://www.moj.go.jp/content/001450011.pdf',aurl='https://www.moj.go.jp/content/001450015.pdf';
const make=(qualification='土地家屋調査士')=>({
 status:'verified',
 key:{qualification},
 provenance:{sourceType:'official_pdf_pair',registryKey:'土地家屋調査士:2025:午後',questionPdfUrl:qurl,answerPdfUrl:aurl},
 question:{id:1,year:2025,section:'午後',text:'試験問題',choices:[{text:'選択肢1'},{text:'選択肢2'}],source:{official:true,url:qurl}},
 answer:{questionId:1,year:2025,section:'午後',number:2,page:1,evidence:'正答表',source:{official:true,url:aurl}}
});
test('別資格の設問を土地家屋調査士PDFとして偽装したら拒否',async()=>{
 const p=createProvenanceCheckedPipeline({adapters:[],retrieveAndVerify:async()=>make('宅建'),verifyOfficialSource:async()=>true});
 const r=await p({});
 assert.equal(r.status,'unavailable');
 assert.equal(r.reason,'REGISTRY_KEY_MISMATCH');
});
test('台帳の資格・年度・区分と設問が一致すれば次の検証へ',async()=>{
 const p=createProvenanceCheckedPipeline({adapters:[],retrieveAndVerify:async()=>make(),verifyOfficialSource:async()=>true});
 assert.equal((await p({})).status,'ready');
});
