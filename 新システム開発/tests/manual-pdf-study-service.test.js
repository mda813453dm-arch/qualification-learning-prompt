import test from "node:test";
import assert from "node:assert/strict";
import { createMemorySessionStore } from "../src/session-store.js";
import { createManualPdfStudyService } from "../src/manual-pdf-study-service.js";
const file = role => ({role,serverReceived:true,fileId:"server-"+role,mediaType:"application/pdf"});
test("土地家屋調査士の学習履歴を保持し、PDF添付待ちから演習へ復帰",async()=>{
  const store=createMemorySessionStore();
  await store.start("learner-A","土地家屋調査士");
  const before=await store.load("learner-A");
  before.history.push({role:"user",text:"記述式の解説を聞いた"});
  await store.save("learner-A",before);
  const service=createManualPdfStudyService(store);
  const req=await service.request("learner-A",{year:2025,section:"午後の部",sourceUrl:"https://www.moj.go.jp/"});
  assert.equal(req.mode,"awaiting_user_pdf");
  await service.receipt("learner-A",file("question"));
  const waiting=await store.load("learner-A");
  assert.equal(waiting.manualPdf.verified,false);
  assert.equal(waiting.history.length,1);
  await service.receipt("learner-A",file("answer"));
  const ready=await service.verify("learner-A",{ok:true,question:{key:{qualification:"土地家屋調査士",year:"2025",section:"午後の部"}}});
  assert.equal(ready.mode,"practice_request");
  assert.equal(ready.history.length,1);
  assert.equal(ready.qualification,"土地家屋調査士");
});
test("別利用者の学習状態には影響しない",async()=>{
  const store=createMemorySessionStore();
  await store.start("learner-A","土地家屋調査士");
  await store.start("learner-B","宅地建物取引士");
  const service=createManualPdfStudyService(store);
  await service.request("learner-A",{year:2025,section:"午後の部"});
  assert.equal((await store.load("learner-B")).manualPdf,undefined);
});
test("正答がない場合は演習に進まず保存する",async()=>{
  const store=createMemorySessionStore();
  await store.start("learner-A","土地家屋調査士");
  const service=createManualPdfStudyService(store);
  await service.request("learner-A",{year:2025,section:"午後の部"});
  await service.receipt("learner-A",file("question"));
  assert.equal((await store.load("learner-A")).mode,"awaiting_user_pdf");
  await assert.rejects(()=>service.verify("learner-A",{ok:true}),/DOCUMENTS_INCOMPLETE/);
});
test("資格切替後に古い資格の添付を受け入れない",async()=>{
  const store=createMemorySessionStore();
  await store.start("learner-A","土地家屋調査士");
  const service=createManualPdfStudyService(store);
  await service.request("learner-A",{year:2025,section:"午後の部"});
  const changed=await store.load("learner-A");changed.qualification="宅地建物取引士";await store.save("learner-A",changed);
  await assert.rejects(()=>service.receipt("learner-A",file("question")),/QUALIFICATION_CHANGED/);
});
