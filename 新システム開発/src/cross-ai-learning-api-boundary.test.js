import test from "node:test";
import assert from "node:assert/strict";
import { createCrossAiLearningApi } from "./cross-ai-learning-api.js";

const HASH = "a".repeat(64);
const question = { status: "ready", questionId: "q1", packetHash: HASH,
  signature: "question_number>body>choices>instruction", nodes: [
    { type: "text", role: "question_number", value: "問1" },
    { type: "text", role: "body", value: "本文" },
    { type: "choices", role: "choices", value: ["A", "B"] },
    { type: "text", role: "instruction", value: "番号で答えてください。" }
  ], markdown: "問1\n\n本文\n\n選択肢\n1. A\n2. B\n\n番号で答えてください。" };

test("API boundary blocks grading, explanation, and next transition unless the program advances state", async () => {
  const records = new Map();
  const flow = {
    phase: "ANSWER_WAIT",
    state() { return { phase: this.phase }; },
    prepare() { return question; },
    answer() { throw new Error("ANSWER_NOT_ALLOWED"); },
    explain() { throw new Error("EXPLANATION_NOT_ALLOWED"); },
    commitPrefetchedNext() { throw new Error("NEXT_NOT_READY"); }
  };
  const api = createCrossAiLearningApi({
    authenticate: async () => ({ id: "u1" }),
    sessions: { put: async x => records.set(x.sessionId, x.record), get: async x => records.get(x.sessionId) },
    initializeSession: async () => ({ flow, questionInput: {}, prefetchNext: async () => [] })
  });
  const start = await api.handle({ method: "POST", path: "/v1/learning/sessions", body: { qualificationId: "land", studyUnitId: "unit" } });
  const sid = start.body.sessionId;
  for (const action of [
    { action: "submit_answer", answer: 1 },
    { action: "submit_explanation", text: "説明" },
    { action: "commit_next" }
  ]) {
    const result = await api.handle({ method: "POST", path: `/v1/learning/sessions/${sid}/actions`, body: action });
    assert.equal(result.status, 409, action.action);
  }
  assert.equal(flow.phase, "ANSWER_WAIT");
});
