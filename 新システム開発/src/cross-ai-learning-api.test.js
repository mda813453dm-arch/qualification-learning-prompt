import test from "node:test";
import assert from "node:assert/strict";
import { createCrossAiLearningApi, createCrossAiLearningHttpServer } from "./cross-ai-learning-api.js";

const HASH = "a".repeat(64);
const IMAGE_HASH = "b".repeat(64);
const payload = {
  status: "ready", questionId: "land:2025:morning:2", packetHash: HASH,
  signature: "question_number>body>official_figure>choices>instruction",
  nodes: [
    { type: "text", role: "question_number", value: "問2" },
    { type: "text", role: "body", value: "公式問題本文" },
    { type: "image", role: "official_figure", value: "https://figures.example/figure.png", assetId: "fig-1", sha256: IMAGE_HASH },
    { type: "choices", role: "choices", value: ["選択肢A", "選択肢B"] },
    { type: "text", role: "instruction", value: "番号で答えてください。" }
  ],
  markdown: "問2\n\n公式問題本文\n\n![公式図](https://figures.example/figure.png)\n\n選択肢\n1. 選択肢A\n2. 選択肢B\n\n番号で答えてください。"
};

function makeFlow() {
  let phase = "IDLE";
  let prefetched = false;
  const calls = [];
  return {
    calls,
    state: () => ({ phase, question: { id: payload.questionId }, packet: { packetHash: HASH, answer: { value: 2 } } }),
    prepare: () => { phase = "PACKET_VALIDATED"; return { ...payload, answer: 2, secret: "must not be returned" }; },
    displayAudit: () => [],
    rendered: receipt => { calls.push(["rendered", receipt]); phase = "ANSWER_WAIT"; return { ok: true }; },
    prefetchNext: requests => { calls.push(["prefetchNext", requests]); prefetched = true; return { ready: true, routes: [{ number: 3, questionId: "land:2025:morning:3", packetHash: "c".repeat(64) }] }; },
    answer: value => {
      calls.push(["answer", value]);
      if (phase !== "ANSWER_WAIT") throw new Error("ANSWER_NOT_ALLOWED");
      if (!prefetched) throw new Error("NEXT_NOT_PREFETCHED");
      phase = "GRADED";
      return { selected: Number(value), correctAnswer: 2, correct: Number(value) === 2, packetHash: HASH,
        explanationChoiceRequired: true, explanationChoices: ["detailed", "skip"] };
    },
    learningState: () => ({ phase: "PRACTICE_READY" })
  };
}

function setup({ authenticate = async () => ({ id: "user-1" }), initializeSession } = {}) {
  const data = new Map();
  const sessions = {
    async put({ principalId, sessionId, record }) { data.set(`${principalId}:${sessionId}`, record); },
    async get({ principalId, sessionId }) { return data.get(`${principalId}:${sessionId}`) || null; }
  };
  const flow = makeFlow();
  const init = initializeSession || (async () => ({
    flow, questionInput: { qualificationId: "land", question: { id: payload.questionId } },
    prefetchNext: async () => [{ number: 3, input: { question: { id: "server-owned-question" } } }]
  }));
  return { api: createCrossAiLearningApi({ authenticate, sessions, initializeSession: init }), flow };
}

test("runtime refuses to start without auth, session, and learning-pipeline adapters", () => {
  assert.throws(() => createCrossAiLearningApi(), /LEARNING_RUNTIME_CONFIGURATION_REQUIRED/);
});

test("session creation returns a complete server packet without extra or answer fields", async () => {
  const { api } = setup();
  const result = await api.handle({ method: "POST", path: "/v1/learning/sessions", body: {
    qualificationId: "land", studyUnitId: "coordinate-system", year: 2025, section: "morning"
  } });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ready");
  assert.equal(result.body.question.markdown, payload.markdown);
  assert.equal(result.body.question.nodes.at(-1).value, "番号で答えてください。");
  assert.equal("answer" in result.body.question, false);
  assert.equal("secret" in result.body.question, false);
});

test("unauthenticated requests never start a learning session", async () => {
  let starts = 0;
  const { api } = setup({ authenticate: async () => null, initializeSession: async () => { starts++; } });
  const result = await api.handle({ method: "POST", path: "/v1/learning/sessions", body: { qualificationId: "land", studyUnitId: "unit" } });
  assert.equal(result.status, 401);
  assert.equal(starts, 0);
});

test("AI-supplied question or answer-key data is rejected at session creation", async () => {
  let starts = 0;
  const { api } = setup({ initializeSession: async () => { starts++; } });
  const result = await api.handle({ method: "POST", path: "/v1/learning/sessions", body: {
    qualificationId: "land", studyUnitId: "unit", question: { text: "invented" }, answer: 1
  } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "CLIENT_CONTENT_NOT_ALLOWED");
  assert.equal(starts, 0);
});

test("prefetch uses only the server-owned provider and answers remain gated until it succeeds", async () => {
  const { api, flow } = setup();
  const start = await api.handle({ method: "POST", path: "/v1/learning/sessions", body: { qualificationId: "land", studyUnitId: "unit" } });
  const id = start.body.sessionId;
  const before = await api.handle({ method: "POST", path: `/v1/learning/sessions/${id}/actions`, body: { action: "submit_answer", answer: 1 } });
  assert.equal(before.status, 409);
  assert.equal(before.body.error, "ANSWER_NOT_ALLOWED");

  const rendered = await api.handle({ method: "POST", path: `/v1/learning/sessions/${id}/actions`, body: {
    action: "rendered", receipt: { complete: true, questionId: payload.questionId, packetHash: HASH,
      markdown: payload.markdown, signature: payload.signature, nodeCount: payload.nodes.length }
  } });
  assert.equal(rendered.status, 200);
  const injected = await api.handle({ method: "POST", path: `/v1/learning/sessions/${id}/actions`, body: {
    action: "prefetch_next", question: { text: "AI-created" }, packet: { answer: 1 }
  } });
  assert.equal(injected.status, 400);
  const prefetch = await api.handle({ method: "POST", path: `/v1/learning/sessions/${id}/actions`, body: { action: "prefetch_next" } });
  assert.equal(prefetch.status, 200);
  assert.equal(prefetch.body.status, "ready");
  assert.equal(flow.calls.filter(call => call[0] === "prefetchNext").length, 1);

  const grade = await api.handle({ method: "POST", path: `/v1/learning/sessions/${id}/actions`, body: { action: "submit_answer", answer: 2 } });
  assert.equal(grade.status, 200);
  assert.equal(grade.body.grade.correctAnswer, 2);
  assert.equal(grade.body.grade.correct, true);
});

test("cross-AI output fails closed on local sandbox image paths", async () => {
  const bad = { ...payload, nodes: payload.nodes.map(node => node.role === "official_figure" ? { ...node, value: "sandbox:/mnt/data/figure.png" } : node) };
  bad.markdown = bad.markdown.replace("https://figures.example/figure.png", "sandbox:/mnt/data/figure.png");
  const { api } = setup({ initializeSession: async () => ({
    flow: { prepare: () => bad }, questionInput: {}, prefetchNext: async () => []
  }) });
  const result = await api.handle({ method: "POST", path: "/v1/learning/sessions", body: { qualificationId: "land", studyUnitId: "unit" } });
  assert.equal(result.status, 422);
  assert.equal(result.body.error, "CROSS_AI_IMAGE_MUST_USE_HTTPS");
});

test("Node HTTP adapter exposes the same JSON API over an HTTP request", async () => {
  const data = new Map();
  const flow = makeFlow();
  const server = createCrossAiLearningHttpServer({
    authenticate: async headers => headers.authorization === "Bearer test-only" ? { id: "user-1" } : null,
    sessions: {
      async put({ principalId, sessionId, record }) { data.set(`${principalId}:${sessionId}`, record); },
      async get({ principalId, sessionId }) { return data.get(`${principalId}:${sessionId}`) || null; }
    },
    initializeSession: async () => ({ flow, questionInput: { qualificationId: "land" }, prefetchNext: async () => [] })
  });
  const resultPromise = new Promise(resolve => {
    const req = {
      method: "POST", url: "/v1/learning/sessions",
      headers: { "content-type": "application/json", authorization: "Bearer test-only" },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ qualificationId: "land", studyUnitId: "unit" })); }
    };
    const res = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, headers: this.headers, body: JSON.parse(body) }); }
    };
    server.emit("request", req, res);
  });
  const response = await resultPromise;
  assert.equal(response.status, 200);
  const result = response.body;
  assert.equal(result.status, "ready");
  assert.equal(result.question.markdown, payload.markdown);
});
