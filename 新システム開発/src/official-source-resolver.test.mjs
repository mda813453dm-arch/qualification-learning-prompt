import assert from "node:assert/strict";
import { QUALIFICATION_CATALOG } from "./qualification-catalog.js";
import { resolveOfficialSourceEntry, rediscoverOfficialDocuments, chooseOfficialQuestionPath } from "./official-source-resolver.js";

assert.equal(QUALIFICATION_CATALOG.length,103);
for(const q of QUALIFICATION_CATALOG){
  const r=resolveOfficialSourceEntry({qualificationId:q.id});
  if(q.pastQuestionsUrl){
    assert.equal(r.status,"ready",q.name);
    assert.equal(r.qualificationId,q.id);
    assert.equal(r.officialEntryUrl,q.pastQuestionsUrl);
  }else{
    assert.equal(r.status,"unavailable",q.name);
    assert.equal(r.reason,"OFFICIAL_ENTRY_NOT_REGISTERED");
  }
}
const surveyor=resolveOfficialSourceEntry({qualificationName:"測量士補"});
assert.equal(surveyor.status,"ready");
assert.equal(surveyor.qualificationId,"q063");

const rediscovered=await rediscoverOfficialDocuments({
 entry:surveyor,expectedYear:2025,
 discoverFromEntry:async()=>({status:"ready",documents:[
  {url:"https://www.gsi.go.jp/q.pdf",kind:"question",year:2025,qualificationName:"測量士補",authorityConfirmed:true,officialHostConfirmed:true},
  {url:"https://www.gsi.go.jp/a.pdf",kind:"answer",year:2025,qualificationName:"測量士補",authorityConfirmed:true,officialHostConfirmed:true},
  {url:"https://example.com/bad.pdf",kind:"question",year:2025,qualificationName:"測量士補",authorityConfirmed:false,officialHostConfirmed:false}
 ]})
});
assert.equal(rediscovered.status,"ready");
assert.deepEqual(rediscovered.completeYears,[2025]);
assert.equal(rediscovered.documents.length,2);

assert.equal(chooseOfficialQuestionPath({preverifiedPacketCount:3,requestedSetSize:3}).path,"preverified_packet");
assert.equal(chooseOfficialQuestionPath({preverifiedPacketCount:0,officialEntryAvailable:true,runtimePdfAdapterAvailable:true}).path,"runtime_official_pdf");
assert.equal(chooseOfficialQuestionPath({preverifiedPacketCount:0,officialEntryAvailable:true,runtimePdfAdapterAvailable:false}).status,"unavailable");
console.log("official-source-resolver: PASS");
