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


import { fetchQualificationIndex } from "../src/retrieval-engine.js";
test("index fetch parses only successful HTTPS CSV response", async () => {
  const result = await fetchQualificationIndex("https://index.example/official.csv", { fetchImpl: async url => ({
    ok: true, status: 200, url, headers: { get: () => "text/csv" }, text: async () => csv
  }) });
  assert.equal(result.records[0].資格名, "宅地建物取引士");
  assert.ok(result.retrievedAt);
});
test("index fetch distinguishes HTTP failure from empty/not attempted", async () => {
  await assert.rejects(() => fetchQualificationIndex("https://index.example/official.csv", { fetchImpl: async url => ({
    ok: false, status: 403, url, headers: { get: () => "text/html" }
  }) }), error => error.code === "INDEX_HTTP_403");
});

import { parseTakkenQuestionAndAnswer } from "../src/retrieval-engine.js";
test("extracts a Takken question and maps its answer by explicit question header", () => {
  const pages = [
    "令和7年度 問題\n【問 1 】 次の記述のうち正しいものはどれか。\n1 選択肢A\n2 選択肢B\n3 選択肢C\n4 選択肢D\n【問 2 】 次の問題",
    "中間ページ",
    "試験問題の正解番号\n問 1 問 2\n2 1"
  ];
  const result = parseTakkenQuestionAndAnswer(pages, { year: 2025, section: "2025年度", questionNumber: 1, url: "https://www.retio.or.jp/test.pdf" });
  assert.equal(result.question.page, 1);
  assert.equal(result.question.choices.length, 4);
  assert.equal(result.question.text, "次の記述のうち正しいものはどれか。");
  assert.equal(result.answer.number, 2);
  assert.equal(result.answer.page, 3);
  assert.equal(result.answer.questionId, result.question.id);
});
test("refuses missing Takken choices and answer row", () => {
  assert.throws(() => parseTakkenQuestionAndAnswer(["【問 1 】 stem\n1 A\n2 B\n3 C\n【問 2 】"], { year: 2025, section: "x", questionNumber: 1, url: "https://www.retio.or.jp/test.pdf" }), /QUESTION_OR_CHOICES_INCOMPLETE/);
  assert.throws(() => parseTakkenQuestionAndAnswer(["【問 1 】 stem\n1 A\n2 B\n3 C\n4 D\n試験問題の正解番号\n問 2\n1"], { year: 2025, section: "x", questionNumber: 1, url: "https://www.retio.or.jp/test.pdf" }), /ANSWER_MAPPING_NOT_VERIFIED/);
});

import { extractPdfPages } from "../src/retrieval-engine.js";
test("live official RETIO 2025 PDF extracts all 50 questions and maps each answer", async () => {
  const response = await fetch("https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf");
  assert.equal(response.status, 200, "official PDF must be reachable from this Actions runner");
  const type = response.headers.get("content-type") || "";
  assert.match(type, /pdf/i, "response must be a PDF, not an HTML denial page");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 100_000, "PDF must contain a non-trivial document");
  assert.deepEqual([...bytes.slice(0, 4)], [0x25,0x50,0x44,0x46], "PDF signature must be present");
  const pages = await extractPdfPages(bytes);
  assert.equal(pages.length, 30, "expected all official PDF pages to be readable");
  const answers = [];
  for (let questionNumber = 1; questionNumber <= 50; questionNumber++) {
    const result = parseTakkenQuestionAndAnswer(pages, { year: 2025, section: "2025年度", questionNumber, url: response.url });
    assert.equal(result.question.choices.length, 4, `Question ${questionNumber} must have all four choices`);
    assert.ok(result.question.text.length > 10, `Question ${questionNumber} must have a non-empty stem`);
    assert.ok(result.question.page >= 2 && result.question.page <= 28, `Question ${questionNumber} must have a source page`);
    assert.equal(result.answer.page, 30, `Question ${questionNumber} must map to the official answer-table page`);
    assert.equal(result.answer.questionId, result.question.id);
    assert.ok(result.answer.number >= 1 && result.answer.number <= 4);
    answers.push(result.answer.number);
  }
  assert.equal(answers[0], 3, "Question 1 official answer is 3");
  assert.equal(answers.length, 50);
  assert.equal(response.url, "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf");
});
