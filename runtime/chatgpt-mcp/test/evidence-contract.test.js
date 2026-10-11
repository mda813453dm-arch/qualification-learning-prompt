import test from "node:test";
import assert from "node:assert/strict";
import { verifyParsedEvidence } from "../worker/evidence-contract.js";

const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
const candidate = { key: { qualification: "資格A", year: "2025", section: "午前" }, questionUrl: "https://exam.example/q.pdf", answerCandidates: ["https://exam.example/a.pdf"] };
const question = { qualification: "資格A", year: "2025", section: "午前", questionId: "Q-01", stem: "設問本文", choices: [{ id: "A", text: "選択肢A" }, { id: "B", text: "選択肢B" }] };
const answer = { qualification: "資格A", year: "2025", section: "午前", questionId: "Q-01", correctChoiceId: "B", answerLocation: "p.12 row 4", answerEvidence: "Q-01 B" };
const input = () => ({ candidate, questionPdf: { url: candidate.questionUrl, bytes: pdf }, answerPdf: { url: candidate.answerCandidates[0], bytes: pdf }, parsedQuestion: structuredClone(question), parsedAnswer: structuredClone(answer) });

test("accepts only a complete, same-key, indexed PDF question and answer record", async () => {
  const result = await verifyParsedEvidence(input());
  assert.equal(result.status, "verified");
  assert.equal(result.questionKey.questionId, "Q-01");
  assert.match(result.sourceDigests.question, /^[a-f0-9]{64}$/);
  assert.equal("correctChoiceId" in result, false);
});

test("rejects an HTML/error body even when its URL ends in .pdf", async () => {
  const data = input();
  data.questionPdf.bytes = new TextEncoder().encode("403 forbidden");
  const result = await verifyParsedEvidence(data);
  assert.equal(result.status, "rejected");
  assert.ok(result.failures.includes("PDF_SIGNATURE_INVALID"));
});

test("rejects missing choices, mismatched question IDs, and an unindexed answer URL", async () => {
  const data = input();
  data.parsedQuestion.choices = [{ id: "A", text: "A" }];
  data.parsedAnswer.questionId = "Q-02";
  data.answerPdf.url = "https://other.example/a.pdf";
  const result = await verifyParsedEvidence(data);
  assert.ok(result.failures.includes("QUESTION_OR_CHOICES_INCOMPLETE"));
  assert.ok(result.failures.includes("QUESTION_ANSWER_ID_MISMATCH"));
  assert.ok(result.failures.includes("ANSWER_SOURCE_MISMATCH"));
  assert.equal(result.questionKey, null);
});

test("rejects duplicate options and answers without an inspected answer location", async () => {
  const data = input();
  data.parsedQuestion.choices[1].id = "A";
  data.parsedAnswer.answerLocation = "";
  const result = await verifyParsedEvidence(data);
  assert.ok(result.failures.includes("CHOICE_SET_INVALID"));
  assert.ok(result.failures.includes("ANSWER_CELL_NOT_EVIDENCED"));
});

test("rejects qualification, year, section, and answer-choice mismatches", async () => {
  const data = input();
  data.parsedQuestion.year = "2024";
  data.parsedAnswer.section = "午後";
  data.parsedAnswer.correctChoiceId = "C";
  const result = await verifyParsedEvidence(data);
  assert.ok(result.failures.includes("QUESTION_IDENTITY_MISMATCH"));
  assert.ok(result.failures.includes("ANSWER_IDENTITY_MISMATCH"));
  assert.ok(result.failures.includes("ANSWER_NOT_IN_CHOICE_SET"));
});
