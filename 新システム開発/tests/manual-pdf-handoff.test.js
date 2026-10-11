import test from "node:test";
import assert from "node:assert/strict";
import { createManualPdfRequest, registerManualPdfReceipt, resolveManualPdfEvidence } from "../src/manual-pdf-handoff.js";
const initial=()=>createManualPdfRequest({qualification:"土地家屋調査士",year:2025,section:"午後の部",sourceUrl:"https://www.moj.go.jp/"});
const receipt=role=>({role,serverReceived:true,fileId:`file-${role}`,mediaType:"application/pdf"});
test("公式PDF取得失敗後も資格・年度・区分を維持して添付待ち",()=>{
  const req=initial();
  assert.equal(req.status,"awaiting_user_pdf");
  assert.equal(req.key.qualification,"土地家屋調査士");
});
test("問題PDFだけでは正答照合へ進めない",()=>{
  const req=registerManualPdfReceipt(initial(),receipt("question"));
  assert.equal(req.status,"awaiting_user_pdf");
  assert.equal(req.verified,false);
});
test("問題と正答を受領しても検証済みにはならない",()=>{
  const req=registerManualPdfReceipt(registerManualPdfReceipt(initial(),receipt("question")),receipt("answer"));
  assert.equal(req.status,"awaiting_evidence_verification");
  assert.equal(req.verified,false);
});
test("正答が確認できない場合は拒否",()=>{
  const req=registerManualPdfReceipt(registerManualPdfReceipt(initial(),receipt("question")),receipt("answer"));
  const result=resolveManualPdfEvidence(req,{ok:false,failures:["ANSWER_NOT_FOUND"]});
  assert.equal(result.status,"verification_failed");
});
test("別資格の正答を取り違えない",()=>{
  const req=registerManualPdfReceipt(registerManualPdfReceipt(initial(),receipt("question")),receipt("answer"));
  const result=resolveManualPdfEvidence(req,{ok:true,question:{key:{qualification:"宅地建物取引士",year:"2025",section:"午後の部"}}});
  assert.equal(result.status,"verification_failed");
});
test("検証済み同一資格・年度・区分でのみ準備完了",()=>{
  const req=registerManualPdfReceipt(registerManualPdfReceipt(initial(),receipt("question")),receipt("answer"));
  const result=resolveManualPdfEvidence(req,{ok:true,question:{key:{qualification:"土地家屋調査士",year:"2025",section:"午後の部"}}});
  assert.equal(result.status,"ready");
});
test("ユーザーの申告だけでは受領扱いにしない",()=>{
  assert.throws(()=>registerManualPdfReceipt(initial(),{role:"question",fileId:"file-1",mediaType:"application/pdf"}),/SERVER_RECEIPT_REQUIRED/);
});
