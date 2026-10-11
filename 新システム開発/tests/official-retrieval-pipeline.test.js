import test from "node:test";
import assert from "node:assert/strict";
import { createOfficialRetrievalPipeline } from "../src/official-retrieval-pipeline.js";
import { gradeVerifiedAnswer } from "../src/verified-question-gate.js";
function verified() {
  const url = "https://example.org/fictional.pdf";
  return { status:"verified", key:{qualification:"架空資格",year:"2025",section:"架空区分",questionId:"2025|架空区分|問1"},
    question:{id:"2025|架空区分|問1",year:"2025",section:"架空区分",page:1,text:"架空問題",choices:[{text:"甲"},{text:"乙"}],source:{url,official:true}},
    answer:{questionId:"2025|架空区分|問1",year:"2025",section:"架空区分",page:2,number:2,evidence:"架空正答欄",source:{url,official:true}},
    attempts:[{status:"verified"}] };
}
test("取得検証→採点ゲート→採点の連結", async () => {
  let calls = 0;
  const pipeline = createOfficialRetrievalPipeline({
    retrieveAndVerify: async (candidate,adapters) => { calls++; assert.equal(candidate.questionUrl,"https://example.org/fictional.pdf"); assert.equal(adapters.length,1); return verified(); },
    adapters:[{name:"fake"}]
  });
  const result = await pipeline({questionUrl:"https://example.org/fictional.pdf"});
  assert.equal(calls,1);
  assert.equal(result.status,"ready");
  assert.equal(gradeVerifiedAnswer(result.verifiedQuestion,2).correct,true);
});
test("取得失敗時は採点不能", async () => {
  const pipeline = createOfficialRetrievalPipeline({retrieveAndVerify:async()=>({status:"exhausted",reason:"ROUTE_LIMIT_REACHED",attempts:[{status:"failed"}]}),adapters:[]});
  const result = await pipeline({});
  assert.equal(result.status,"unavailable");
  assert.equal(result.verifiedQuestion,undefined);
});
test("旧エンジンがverifiedでも正答ID不一致は拒否", async () => {
  const bad = verified(); bad.answer.questionId="別問題";
  const pipeline = createOfficialRetrievalPipeline({retrieveAndVerify:async()=>bad,adapters:[]});
  assert.equal((await pipeline({})).status,"rejected");
});
test("検証結果がない場合は採点不能", async () => {
  const pipeline = createOfficialRetrievalPipeline({retrieveAndVerify:async()=>null,adapters:[]});
  assert.equal((await pipeline({})).status,"unavailable");
});
