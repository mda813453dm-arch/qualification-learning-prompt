import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICIAL_PDF_PINS,createPinnedOfficialVerifier} from '../src/official-pdf-pins.js';
const key='土地家屋調査士:2025:午後',pin=OFFICIAL_PDF_PINS[key];
const evidence={sourceType:'official_pdf_pair',registryKey:key,...pin};
test('固定台帳に一致する資料のみ次の検証へ',async()=>{
 let calls=0;
 const gate=createPinnedOfficialVerifier({verifyOfficialSource:async()=>{calls++;return true;}});
 assert.equal(await gate(evidence),true);
 assert.equal(calls,1);
});
test('利用者指定のハッシュで固定値を上書きできない',async()=>{
 const gate=createPinnedOfficialVerifier({verifyOfficialSource:async()=>true});
 assert.equal(await gate({...evidence,questionSha256:'0'.repeat(64)}),false);
});
test('年度・区分・URLのすり替えを拒否',async()=>{
 const gate=createPinnedOfficialVerifier({verifyOfficialSource:async()=>true});
 assert.equal(await gate({...evidence,registryKey:'土地家屋調査士:2024:午後'}),false);
 assert.equal(await gate({...evidence,answerPdfUrl:'https://www.moj.go.jp/content/another.pdf'}),false);
});
test('アップロードPDFは公式認定されない',async()=>{
 const gate=createPinnedOfficialVerifier({verifyOfficialSource:async()=>true});
 assert.equal(await gate({...evidence,sourceType:'uploaded_pinned_pdf'}),false);
});
test('公式PDF実検証で失敗したら拒否',async()=>{
 const gate=createPinnedOfficialVerifier({verifyOfficialSource:async()=>false});
 assert.equal(await gate(evidence),false);
});
