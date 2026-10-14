import assert from "node:assert/strict";import {segmentQuestionCandidates,assessSegmentationCandidate} from "./generic-pdf-question-segmenter.js";
const pages=[{page:1,text:"【問 1】本文A\n1．肢A\n2．肢B\n3．肢C\n4．肢D\n【問 2】次の図を見て答えよ。\n1．甲\n2．乙"},
{page:2,text:"\n3．丙\n4．丁\n【問 3】本文C\n1．a\n2．b\n3．c\n4．d"}];
const x=segmentQuestionCandidates(pages);assert.equal(x.length,3);assert.equal(x[0].choices.length,4);assert.equal(x[1].diagramReferenceCandidate,true);assert.deepEqual(x[1].sourcePages,[1,2]);assert.equal(x[1].pageSpanCandidate,true);assert.equal(x[1].choices.length,4);
assert.equal(assessSegmentationCandidate(x[0],{expectedChoiceCount:4}).status,"candidate_ready");
const bad=segmentQuestionCandidates([{page:1,text:"【問 1】本文\n2．B\n3．C"}])[0];assert.equal(assessSegmentationCandidate(bad,{expectedChoiceCount:4}).status,"needs_adapter_verification");
console.log("generic-pdf-question-segmenter: PASS");
