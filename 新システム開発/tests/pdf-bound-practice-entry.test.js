import test from 'node:test';
import assert from 'node:assert/strict';
import {createPdfBoundPracticeEntry} from '../src/pdf-bound-practice-entry.js';
const make=(result,extractText=async()=>'',retrieveAndVerify=async()=>result)=>createPdfBoundPracticeEntry({retrieveAndVerify,extractText,adapters:[]});
test('内部PDF解析器未設定では入口を生成できない',()=>{
 assert.throws(()=>createPdfBoundPracticeEntry({retrieveAndVerify:async()=>({}),adapters:[]}),/TRUSTED_INTERNAL_DEPENDENCIES_REQUIRED/);
});
test('PDFバイト証拠なしでは出題も採点もできない',async()=>{
 const c=make({status:'verified',key:{qualification:'土地家屋調査士'},question:{},answer:{},provenance:{}});
 assert.equal((await c.request('s',{})).reason,'PDF_BYTE_EVIDENCE_REQUIRED');
 assert.throws(()=>c.submit('s',1),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('未知のPDF台帳キーは出題拒否',async()=>{
 const c=make({status:'verified',byteEvidence:{registryKey:'unknown',questionPdfBytes:Buffer.from('%PDF-a'),answerPdfBytes:Buffer.from('%PDF-b')}});
 assert.equal((await c.request('s',{})).reason,'UNKNOWN_OFFICIAL_PDF_PAIR');
});
test('固定台帳のPDFハッシュが不一致なら出題拒否',async()=>{
 const c=make({status:'verified',byteEvidence:{registryKey:'土地家屋調査士:2025:午後',questionPdfBytes:Buffer.from('%PDF-a'),answerPdfBytes:Buffer.from('%PDF-b')}});
 assert.equal((await c.request('s',{})).reason,'PINNED_PDF_HASH_MISMATCH');
});
