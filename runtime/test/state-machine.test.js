import test from "node:test";
import assert from "node:assert/strict";
import { initialState, STATES, transition } from "../src/state-machine.js";

test("requires official overview before exemption/stage", () => {
  let s = initialState();
  const result = transition(s, { type: "SET_QUALIFICATION", qualification: "宅建" });
  assert.equal(result.ok, true);
  s = result.state;
  assert.equal(s.state, STATES.OVERVIEW);
  assert.equal(transition(s, { type: "SET_STAGE", value: 4 }).ok, false);
});

test("rejects incomplete official question before display", () => {
  let s = initialState();
  s = transition(s, { type: "SET_QUALIFICATION", qualification: "宅建" }).state;
  s = transition(s, { type: "CONFIRM_OVERVIEW", overview: { officialSourceVerified: true, requiredFieldsDisplayed: true }, exemptionRequired: false }).state;
  s = transition(s, { type: "SET_STAGE", value: 4 }).state;
  s = transition(s, { type: "SET_PLAN", plan: { firstItem: "免許制度", reason: "出題数", scopeVerified: true } }).state;
  s = transition(s, { type: "START_SESSION", confirmed: true }).state;
  const result = transition(s, { type: "PRESENT_OFFICIAL_QUESTION", question: { id: "q1", questionTextComplete: true, choicesComplete: true, officialQuestionSourceVerified: true, answerMappingVerified: true, officialAnswerSourceVerified: false, answerKeyVerified: false } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "QUESTION_EVIDENCE_INCOMPLETE");
});

test("enforces explanation choice after an answer", () => {
  let s = initialState();
  s = transition(s, { type: "SET_QUALIFICATION", qualification: "宅建" }).state;
  s = transition(s, { type: "CONFIRM_OVERVIEW", overview: { officialSourceVerified: true, requiredFieldsDisplayed: true }, exemptionRequired: false }).state;
  s = transition(s, { type: "SET_STAGE", value: 4 }).state;
  s = transition(s, { type: "SET_PLAN", plan: { firstItem: "免許制度", reason: "出題数", scopeVerified: true } }).state;
  s = transition(s, { type: "START_SESSION", confirmed: true }).state;
  s = transition(s, { type: "PRESENT_OFFICIAL_QUESTION", question: { id: "q1", questionTextComplete: true, choicesComplete: true, officialQuestionSourceVerified: true, answerMappingVerified: true, officialAnswerSourceVerified: true, answerKeyVerified: true } }).state;
  s = transition(s, { type: "SUBMIT_ANSWER", answer: "1" }).state;
  assert.equal(s.state, STATES.ANSWER_AWAITING_EXPLANATION_CHOICE);
  assert.equal(transition(s, { type: "PRESENT_OFFICIAL_QUESTION", question: {} }).ok, false);
  assert.equal(transition(s, { type: "CHOOSE_EXPLANATION", choice: "skip" }).ok, true);
});

test("retrieval exhaustion requires explicit policy limit evidence", () => {
  let s = initialState();
  s = transition(s, { type: "SET_QUALIFICATION", qualification: "宅建" }).state;
  s = transition(s, { type: "CONFIRM_OVERVIEW", overview: { officialSourceVerified: true, requiredFieldsDisplayed: true }, exemptionRequired: false }).state;
  s = transition(s, { type: "SET_STAGE", value: 4 }).state;
  s = transition(s, { type: "SET_PLAN", plan: { firstItem: "免許制度", reason: "出題数", scopeVerified: true } }).state;
  s = transition(s, { type: "START_SESSION", confirmed: true }).state;
  const r = transition(s, { type: "RECORD_RETRIEVAL_ATTEMPT", attempt: { route: "official-index", result: "failed" }, exhausted: true, policyLimitReached: false });
  assert.equal(r.ok, true);
  assert.equal(r.state.retrieval.exhausted, false);
});
