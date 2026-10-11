import test from "node:test";
import assert from "node:assert/strict";
import { findCandidates, parseCsv, parseQualificationIndex, retrieveAndVerify, verifyQuestionEvidence } from "../src/retrieval-engine.js";

const csv = "\uFEFF分野グループ,資格名,過去問一覧URL,種別,年度,区分・状況,URL\n法務,宅地建物取引士,https://official.example/list,問題,2025,2025年度,https://official.example/q.pdf\n法務,宅地建物取引士,https://official.example/list,正解,2025,2025年度,https://official.example/a.pdf";
const candidate = findCandidates(parseQualificationIndex(csv), { qualification: "宅地建物取引士", year: 2025 })[0];
const time = "2026-10-11T09:00:00Z";
function evidence(overrides = {}) {
  const q = { id: "2025-main-q1", year: "2025", section: "2025年度", page: 2, text: "問題本文", choices: [{ text: "選択肢1" }, { text: "選択肢2" }], source: { url: candidate.questionUrl, official: true, retrievedAt: time } };
  const a = { questionId: q.id, year: q.year, section: q.section, page: 8, number: 2, numberOfChoices: 2, evidence: "問1 正解 2", source: { url: candidate.answerCandidates[0], official: true, retrievedAt: time } };
  return { question: { ...q, ...overrides.question }, answer: { ...a, ...overrides.answer } };
}

test("CSV parser handles quotes, commas, CRLF, and BOM", () => {
  assert.deepEqual(parseCsv("\uFEFFa,b\r\n\"x,y\",z\r\n"), [["﻿a","b"],["x,y","z"]]);
});
test("parses index using exact required headers", () => {
  assert.equal(parseQualificationIndex(csv)[0].資格名, "宅地建物取引士");
  assert.throws(() => parseQualificationIndex("name,url\na,b"), /CSV_COLUMN_MISSING/);
});
test("discovers only linked question and answer candidates", () => {
  assert.equal(candidate.questionUrl, "https://official.example/q.pdf");
  assert.deepEqual(candidate.answerCandidates, ["https://official.example/a.pdf"]);
});
test("verifies same question key and mapped official answer evidence", () => {
  assert.equal(verifyQuestionEvidence(candidate, evidence()).verified, true);
  assert.equal(verifyQuestionEvidence(candidate, evidence({ answer: { questionId: "other" } })).reason, "ANSWER_KEY_MISMATCH");
  assert.equal(verifyQuestionEvidence(candidate, evidence({ question: { choices: [{ text: "only one" }] } })).reason, "CHOICES_INCOMPLETE");
  assert.equal(verifyQuestionEvidence(candidate, evidence({ answer: { numberOfChoices: 3 } })).reason, "ANSWER_CHOICE_MAPPING_MISMATCH");
  assert.equal(verifyQuestionEvidence(candidate, evidence({ answer: { source: { url: "https://guessed.example/a.pdf", official: true, retrievedAt: time } } })).reason, "SOURCE_NOT_VERIFIED");
});
test("URL success without extracted and checked document never passes", async () => {
  const result = await retrieveAndVerify(candidate, [{ name: "pdf-direct", retrieve: async () => ({ httpStatus: 200, contentType: "application/pdf" }) }], { retriesPerRoute: 0 });
  assert.equal(result.status, "exhausted");
  assert.equal(result.attempts[0].error, "EXTRACTION_NOT_COMPLETED");
});
test("records 403 and retries route before exhaustion", async () => {
  let calls = 0;
  const result = await retrieveAndVerify(candidate, [{ name: "official-pdf", retrieve: async () => { calls++; return { httpStatus: 403, contentType: "text/html" }; } }], { retriesPerRoute: 1, now: () => time });
  assert.equal(calls, 2);
  assert.equal(result.status, "exhausted");
  assert.deepEqual(result.attempts.map(a => a.error), ["HTTP_403", "HTTP_403"]);
});
test("moves to next route after failed first route and retains attempt log", async () => {
  const result = await retrieveAndVerify(candidate, [
    { name: "direct", retrieve: async () => ({ httpStatus: 403, contentType: "text/html" }) },
    { name: "alternate-reader", retrieve: async () => ({ httpStatus: 200, contentType: "application/pdf", bytes: 123, extracted: evidence() }) }
  ], { retriesPerRoute: 0, now: () => time });
  assert.equal(result.status, "verified");
  assert.deepEqual(result.attempts.map(a => a.status), ["failed", "verified"]);
  assert.equal(result.answer.number, 2);
});
test("no routes means not attempted, not exhausted", async () => {
  assert.equal((await retrieveAndVerify(candidate, [])).status, "not_attempted");
});
