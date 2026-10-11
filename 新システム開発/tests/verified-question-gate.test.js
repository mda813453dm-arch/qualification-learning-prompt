import test from "node:test";
import assert from "node:assert/strict";
import { gateVerifiedQuestion, gradeVerifiedAnswer } from "../src/verified-question-gate.js";
function fixture() {
  // 架空のデータ。公式資料を取得したという意味ではない。
  return {
    sourceVerified: true, questionVerified: true, answerVerified: true, identityMatched: true,
    key: { qualification: "架空資格", year: "2025", section: "架空区分", questionNumber: 1 },
    questionText: "架空の問題文", choices: ["架空選択肢A", "架空選択肢B", "架空選択肢C"],
    correctChoice: 2, answerPdfUrl: "https://example.org/answer.pdf"
  };
}
test("必要な根拠がすべて揃う場合だけ通過", () => {
  const result = gateVerifiedQuestion(fixture());
  assert.equal(result.ok, true);
  assert.equal(gradeVerifiedAnswer(result, 2).correct, true);
  assert.equal(gradeVerifiedAnswer(result, 1).correct, false);
});
test("照合未完了では採点禁止", () => {
  const data = fixture(); data.identityMatched = false;
  const result = gateVerifiedQuestion(data);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("QUESTION_ANSWER_IDENTITY_MISMATCH"));
  assert.throws(() => gradeVerifiedAnswer(result, 2), /VERIFIED_QUESTION_REQUIRED/);
});
test("正答根拠未確認では採点禁止", () => {
  const data = fixture(); data.answerVerified = false;
  assert.equal(gateVerifiedQuestion(data).ok, false);
});
test("選択肢が欠けた問題は通過しない", () => {
  const data = fixture(); data.choices = ["架空選択肢A", ""];
  assert.equal(gateVerifiedQuestion(data).ok, false);
});
test("問題キー不足では通過しない", () => {
  const data = fixture(); delete data.key.questionNumber;
  assert.equal(gateVerifiedQuestion(data).ok, false);
});
test("問題キーと正答の記録を保持して採点", () => {
  const record = fixture();
  const verified = gateVerifiedQuestion(record);
  record.correctChoice = 3;
  record.key.questionNumber = 99;
  const result = gradeVerifiedAnswer(verified, 2);
  assert.equal(result.correct, true);
  assert.equal(result.key.questionNumber, 1);
});
test("無効な選択肢は採点しない", () => {
  assert.throws(() => gradeVerifiedAnswer(gateVerifiedQuestion(fixture()), 0), /INVALID_CHOICE/);
});
