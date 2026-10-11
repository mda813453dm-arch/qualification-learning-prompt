import test from "node:test";
import assert from "node:assert/strict";
import { adaptVerifiedExtraction } from "../src/retrieval-evidence-adapter.js";
import { gradeVerifiedAnswer } from "../src/verified-question-gate.js";
function sample() {
  const url = "https://example.org/fictional.pdf";
  return {
    verified: true,
    key: { qualification: "架空資格" },
    question: { id: "問1", year: "2025", section: "架空区分", page: 1, text: "架空の問題", choices: [{text:"甲"},{text:"乙"}], source: {url,official:true} },
    answer: {questionId:"問1",year:"2025",section:"架空区分",page:2,evidence:"架空の正答欄",number:2,source:{url,official:true}}
  };
}
test("信頼できるサーバー検証の明示がないと拒否", () => {
  assert.equal(adaptVerifiedExtraction(sample()).ok, false);
});
test("旧形式の検証済み抽出結果を採点ゲートへ渡す", () => {
  const result = adaptVerifiedExtraction(sample(), {trustedServerVerification:true});
  assert.equal(result.ok, true);
  assert.equal(gradeVerifiedAnswer(result,2).correct,true);
});
test("年度・区分・問題番号の不一致を拒否", () => {
  const data = sample(); data.answer.questionId="問2";
  assert.equal(adaptVerifiedExtraction(data,{trustedServerVerification:true}).ok,false);
});
test("公式出典でないものを拒否", () => {
  const data = sample(); data.answer.source.official=false;
  assert.equal(adaptVerifiedExtraction(data,{trustedServerVerification:true}).ok,false);
});
test("選択肢欠落を拒否", () => {
  const data = sample(); data.question.choices=[{text:"甲"},{text:""}];
  assert.equal(adaptVerifiedExtraction(data,{trustedServerVerification:true}).ok,false);
});
test("正答根拠欠落を拒否", () => {
  const data = sample(); data.answer.evidence="";
  assert.equal(adaptVerifiedExtraction(data,{trustedServerVerification:true}).ok,false);
});
