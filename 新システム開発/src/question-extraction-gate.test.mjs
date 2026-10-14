import assert from "node:assert/strict";import {evaluateExtractedQuestion,promoteExtractedQuestion} from "./question-extraction-gate.js";
const H="a".repeat(64);
const base={questionNumber:2,stem:"問題",choices:["A","B","C","D","E"],sourcePages:[3],boundaryVerified:true,pageSpanVerified:true,diagramRequired:true,diagramAssets:[{sha256:H,path:"q2-fig1.png"}],correctAnswer:3,answerEvidence:{sameYear:true,page:1},fieldId:"survey",fieldEvidence:{verified:true}};
assert.equal(evaluateExtractedQuestion(base,{expectedChoiceCount:5}).status,"verified");
assert.equal(promoteExtractedQuestion(base,{expectedChoiceCount:5}).packet.packetStatus,"verified_official");
for(const [name,patch] of [
 ["missing diagram",{diagramAssets:[]}],["bad boundary",{boundaryVerified:false}],["page span uncertain",{pageSpanVerified:false}],
 ["answer unverified",{answerEvidence:{sameYear:false,page:1}}],["field unverified",{fieldEvidence:{verified:false}}],
 ["choice missing",{choices:["A","B","C","D"]}]
]){const x={...base,...patch};const g=evaluateExtractedQuestion(x,{expectedChoiceCount:5});assert.equal(g.status,"quarantined",name);}
console.log("question-extraction-gate: PASS");
