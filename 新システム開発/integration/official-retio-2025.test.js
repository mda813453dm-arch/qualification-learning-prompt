import test from "node:test";
import assert from "node:assert/strict";
import { extractPdfPages, parseTakkenQuestionAndAnswer, verifyQuestionEvidence } from "../src/legacy-retrieval-engine.js";
import { adaptVerifiedExtraction } from "../src/retrieval-evidence-adapter.js";
import { gradeVerifiedAnswer } from "../src/verified-question-gate.js";
const url="https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf";
test("公式RETIO PDFを実取得し50問の本文・正答を照合", {timeout:180000},async()=>{
  const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(45000)});
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")||"",/pdf/i);
  assert.equal(response.url,url);
  const bytes=new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length>100000);
  assert.equal(Buffer.from(bytes.slice(0,4)).toString(),"％PDF".replace("％","%"));
  const pages=await extractPdfPages(bytes);
  assert.equal(pages.length,30);
  const stamp=new Date().toISOString();
  const answers=[];
  for(let questionNumber=1;questionNumber<=50;questionNumber++){
    const section="2025年度";
    const extracted=parseTakkenQuestionAndAnswer(pages,{year:2025,section,questionNumber,url});
    for(const side of [extracted.question,extracted.answer])side.source={...side.source,official:true,retrievedAt:stamp};
    const candidate={key:{qualification:"宅地建物取引士",year:"2025",section},questionUrl:url,answerCandidates:[url]};
    const checked=verifyQuestionEvidence(candidate,extracted);
    assert.equal(checked.verified,true,`問${questionNumber}：${checked.reason}`);
    const gated=adaptVerifiedExtraction(checked,{trustedServerVerification:true});
    assert.equal(gated.ok,true,`問${questionNumber}：${gated.failures}`);
    const graded=gradeVerifiedAnswer(gated,extracted.answer.number);
    assert.equal(graded.correct,true);
    answers.push(graded.correctChoice);
  }
  assert.equal(answers.length,50);
  assert.equal(answers[0],3);
});
