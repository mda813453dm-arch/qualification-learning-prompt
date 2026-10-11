import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvenanceGate} from '../src/provenance-policy.js';
test('固定ハッシュがあってもアップロードPDFは公式認定しない',async()=>{
 const gate=createProvenanceGate({verifyOfficialSource:async()=>true});
 assert.equal((await gate({sourceType:'uploaded_pinned_pdf',official:true,sourceVerified:true})).status,'user_supplied');
});
test('公式フラグの自己申告だけでは公式認定しない',async()=>{
 const gate=createProvenanceGate({verifyOfficialSource:async()=>true});
 assert.equal((await gate({official:true,sourceVerified:true})).status,'unverified');
});
test('独立検証の否認を優先',async()=>{
 const gate=createProvenanceGate({verifyOfficialSource:async()=>false});
 assert.equal((await gate({sourceType:'official_pdf_pair',official:true})).status,'unverified');
});
test('検証処理の例外では閉じる',async()=>{
 const gate=createProvenanceGate({verifyOfficialSource:async()=>{throw Error('network');}});
 assert.equal((await gate({sourceType:'official_pdf_pair'})).status,'unverified');
});
test('公式認定は独立検証の成功を要求',async()=>{
 let calls=0;const gate=createProvenanceGate({verifyOfficialSource:async()=>{calls++;return true;}});
 assert.equal((await gate({sourceType:'official_pdf_pair'})).status,'official_verified');
 assert.equal(calls,1);
});
test('独立検証処理の指定なしは構成エラー',()=>{
 assert.throws(()=>createProvenanceGate({}),/TRUSTED_SOURCE_VERIFIER_REQUIRED/);
});
