import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvenanceCheckedPipeline} from '../src/provenance-checked-pipeline.js';
const sample={status:'verified',key:{qualification:'宅建'},question:{id:1,year:2025,section:'本試験',text:'問題文',choices:[{text:'1'},{text:'2'}],source:{official:true}},answer:{questionId:1,year:2025,section:'本試験',number:2,page:1,evidence:'問1=2',source:{official:true,url:'https://example.org/answer.pdf'}}};
test('アップロードPDFは公式問題パイプラインへ進めない',async()=>{
 const pipe=createProvenanceCheckedPipeline({adapters:[],retrieveAndVerify:async()=>({...sample,provenance:{sourceType:'uploaded_pinned_pdf'}}),verifyOfficialSource:async()=>true});
 const r=await pipe({});assert.equal(r.status,'unavailable');assert.equal(r.reason,'OFFICIAL_PROVENANCE_UNVERIFIED');
});
test('自己申告フラグを拒否する',async()=>{
 const pipe=createProvenanceCheckedPipeline({adapters:[],retrieveAndVerify:async()=>({...sample,provenance:{official:true}}),verifyOfficialSource:async()=>true});
 assert.equal((await pipe({})).status,'unavailable');
});
test('独立した公式性検証が否認したら拒否',async()=>{
 const pipe=createProvenanceCheckedPipeline({adapters:[],retrieveAndVerify:async()=>({...sample,provenance:{sourceType:'official_pdf_pair'}}),verifyOfficialSource:async()=>false});
 assert.equal((await pipe({})).status,'unavailable');
});
test('独立検証と問題・正答照合の両方が成功したときだけready',async()=>{
 const pipe=createProvenanceCheckedPipeline({adapters:[],retrieveAndVerify:async()=>({...sample,provenance:{sourceType:'official_pdf_pair'}}),verifyOfficialSource:async()=>true});
 assert.equal((await pipe({})).status,'ready');
});
