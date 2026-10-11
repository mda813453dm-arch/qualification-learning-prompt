import test from "node:test";
import assert from "node:assert/strict";
import { createLegacyVerifiedPipeline } from "../src/legacy-pipeline-factory.js";
import { gradeVerifiedAnswer } from "../src/verified-question-gate.js";
const url = "https://example.org/fictional.pdf";
const candidate = {key:{qualification:"架空資格",year:"2025",section:"架空区分"},questionUrl:url,answerCandidates:[url]};
function extracted() {
  const id = "2025|架空区分|問1";
  return {
    question:{id,year:"2025",section:"架空区分",page:1,text:"架空の問題",choices:[{number:1,text:"甲"},{number:2,text:"乙"}],source:{url,official:true,retrievedAt:"2026-10-11T00:00:00Z"}},
    answer:{questionId:id,year:"2025",section:"架空区分",page:2,number:2,numberOfChoices:2,evidence:"架空の正答欄",source:{url,official:true,retrievedAt:"2026-10-11T00:00:00Z"}}
  };
}
test("旧エンジンの実照合関数→新採点ゲートを通過",async()=>{
  const pipeline=createLegacyVerifiedPipeline([{name:"mock-extractor",retrieve:async()=>({httpStatus:200,contentType:"application/pdf",extracted:extracted()})}]);
  const result=await pipeline(candidate);
  assert.equal(result.status,"ready");
  assert.equal(gradeVerifiedAnswer(result.verifiedQuestion,2).correct,true);
});
test("旧エンジンで正答問題ID不一致を拒否",async()=>{
  const data=extracted();data.answer.questionId="別の問";
  const pipeline=createLegacyVerifiedPipeline([{name:"mock-extractor",retrieve:async()=>({httpStatus:200,contentType:"application/pdf",extracted:data})}]);
  const result=await pipeline(candidate);
  assert.equal(result.status,"unavailable");
  assert.equal(result.attempts.length,2);
});
test("旧エンジンで公式出典未確認を拒否",async()=>{
  const data=extracted();data.answer.source.official=false;
  const pipeline=createLegacyVerifiedPipeline([{name:"mock-extractor",retrieve:async()=>({httpStatus:200,contentType:"application/pdf",extracted:data})}]);
  assert.equal((await pipeline(candidate)).status,"unavailable");
});
test("PDF取得HTTPエラーを拒否",async()=>{
  const pipeline=createLegacyVerifiedPipeline([{name:"mock-extractor",retrieve:async()=>({httpStatus:403,contentType:"text/html"})}]);
  const result=await pipeline(candidate);
  assert.equal(result.status,"unavailable");
  assert.equal(result.attempts.length,2);
});
