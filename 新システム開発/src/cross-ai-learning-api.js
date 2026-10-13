import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { renderChatInlineMarkdown } from "./chat-inline-render-adapter.js";

const API_ROOT = "/v1/learning";
const HASH_RE = /^[a-f0-9]{64}$/;
const START_FIELDS = new Set(["qualificationId", "studyUnitId", "year", "section"]);

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code) => ({ status, body: { status: "blocked", error: code } });

function requireExactFields(body, allowed, required = []) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "JSON_OBJECT_REQUIRED");
  const unknown = Object.keys(body).filter(key => !allowed.has(key));
  if (unknown.length) throw new ApiError(400, "CLIENT_CONTENT_NOT_ALLOWED");
  if (required.some(key => body[key] === undefined || body[key] === null || body[key] === ""))
    throw new ApiError(400, "REQUEST_FIELD_REQUIRED");
}

function publicPayload(payload) {
  if (!payload || payload.status !== "ready" || !payload.questionId || !HASH_RE.test(payload.packetHash || "") ||
      !Array.isArray(payload.nodes) || typeof payload.markdown !== "string")
    throw new ApiError(422, "COMPLETE_DISPLAY_PACKET_REQUIRED");
  const render = renderChatInlineMarkdown(payload);
  if (render.status !== "ready" || render.markdown !== payload.markdown)
    throw new ApiError(422, "DISPLAY_PAYLOAD_INTEGRITY_FAILED");
  if (!payload.nodes.some(node => node?.role === "choices" && Array.isArray(node.value) && node.value.length > 0) ||
      payload.nodes.at(-1)?.role !== "instruction" || payload.nodes.at(-1)?.value !== "番号で答えてください。")
    throw new ApiError(422, "DISPLAY_PACKET_INCOMPLETE");

  const nodes = payload.nodes.map(node => {
    if (!node || typeof node.role !== "string") throw new ApiError(422, "DISPLAY_NODE_INVALID");
    if (["official_figure", "official_table"].includes(node.role) && node.type === "image" &&
        (typeof node.value !== "string" || !node.value.startsWith("https://")))
      throw new ApiError(422, "CROSS_AI_IMAGE_MUST_USE_HTTPS");
    return Object.fromEntries(["type", "role", "value", "assetId", "sha256"]
      .filter(key => node[key] !== undefined).map(key => [key, node[key]]));
  });
  return Object.freeze({
    status: "ready", questionId: payload.questionId, packetHash: payload.packetHash,
    signature: payload.signature, nodes, markdown: payload.markdown
  });
}

function phaseOf(flow) {
  const phase = flow?.state?.()?.phase;
  return typeof phase === "string" ? phase : "UNKNOWN";
}

function safeCode(error) {
  const code = error?.code || error?.message;
  return typeof code === "string" && /^[A-Z0-9_:-]+$/.test(code) ? code : "RUNTIME_REQUEST_FAILED";
}

/**
 * Shared, host-neutral REST controller for ChatGPT Actions, Claude tools, and
 * other clients. Authentication, session persistence, and official retrieval
 * remain required server-owned adapters; no in-memory production defaults exist.
 */
export function createCrossAiLearningApi({ authenticate, sessions, initializeSession } = {}) {
  if (typeof authenticate !== "function" || typeof initializeSession !== "function" ||
      typeof sessions?.put !== "function" || typeof sessions?.get !== "function")
    throw new Error("LEARNING_RUNTIME_CONFIGURATION_REQUIRED");

  async function handle({ method = "GET", path = "/", headers = {}, body = {} } = {}) {
    const verb = String(method).toUpperCase();
    const pathname = new URL(path, "https://runtime.invalid").pathname;
    const isStart = verb === "POST" && pathname === `${API_ROOT}/sessions`;
    const actionMatch = verb === "POST" && pathname.match(/^\/v1\/learning\/sessions\/([A-Za-z0-9_-]{20,80})\/actions$/);
    if (!isStart && !actionMatch) return fail(404, "ENDPOINT_NOT_FOUND");

    let principal;
    try { principal = await authenticate(headers); }
    catch { return fail(401, "AUTHENTICATION_REQUIRED"); }
    if (!principal || typeof principal.id !== "string" || !principal.id.trim())
      return fail(401, "AUTHENTICATION_REQUIRED");

    try {
      if (isStart) {
        requireExactFields(body, START_FIELDS, ["qualificationId", "studyUnitId"]);
        if (body.year !== undefined && (!Number.isInteger(body.year) || body.year < 1900 || body.year > 2200))
          throw new ApiError(400, "YEAR_INVALID");
        if (body.section !== undefined && !["morning", "afternoon"].includes(body.section))
          throw new ApiError(400, "SECTION_INVALID");
        const initialized = await initializeSession({
          principal,
          scope: Object.freeze({
            qualificationId: body.qualificationId, studyUnitId: body.studyUnitId,
            ...(body.year === undefined ? {} : { year: body.year }),
            ...(body.section === undefined ? {} : { section: body.section })
          })
        });
        if (!initialized || typeof initialized.flow?.prepare !== "function" ||
            typeof initialized.prefetchNext !== "function" || !initialized.questionInput)
          throw new ApiError(503, "SERVER_OWNED_STUDY_PIPELINE_REQUIRED");
        const payload = publicPayload(initialized.flow.prepare(initialized.questionInput));
        const sessionId = randomUUID();
        await sessions.put({
          principalId: principal.id, sessionId,
          record: Object.freeze({ flow: initialized.flow, prefetchNext: initialized.prefetchNext })
        });
        return { status: 200, body: { status: "ready", sessionId, phase: phaseOf(initialized.flow), question: payload } };
      }

      const sessionId = actionMatch[1];
      const record = await sessions.get({ principalId: principal.id, sessionId });
      if (!record || !record.flow) throw new ApiError(404, "SESSION_NOT_FOUND");
      if (typeof body?.action !== "string") throw new ApiError(400, "ACTION_REQUIRED");
      const flow = record.flow;
      let output;

      switch (body.action) {
        case "rendered":
          requireExactFields(body, new Set(["action", "receipt"]), ["receipt"]);
          output = flow.rendered(body.receipt);
          return { status: 200, body: { status: "ok", phase: phaseOf(flow), displayAudit: flow.displayAudit?.().at(-1) || null } };
        case "prefetch_next": {
          requireExactFields(body, new Set(["action"]));
          const requests = await record.prefetchNext({ principal, flow });
          if (!Array.isArray(requests) || requests.length === 0) throw new ApiError(503, "NEXT_PACKET_PREFETCH_UNAVAILABLE");
          output = flow.prefetchNext(requests);
          if (output?.ready !== true) throw new ApiError(422, "NEXT_PACKET_PREFETCH_FAILED");
          return { status: 200, body: { status: "ready", phase: phaseOf(flow), routes: output.routes } };
        }
        case "submit_answer":
          requireExactFields(body, new Set(["action", "answer"]), ["answer"]);
          if (!["string", "number"].includes(typeof body.answer)) throw new ApiError(400, "ANSWER_VALUE_INVALID");
          output = flow.answer(body.answer);
          return { status: 200, body: { status: "graded", grade: {
            selected: output.selected, correctAnswer: output.correctAnswer, correct: output.correct,
            packetHash: output.packetHash, learning: output.learning,
            explanationChoiceRequired: output.explanationChoiceRequired,
            explanationChoices: output.explanationChoices
          } } };
        case "choose_explanation":
          requireExactFields(body, new Set(["action", "choice"]), ["choice"]);
          output = flow.decideExplanation(body.choice);
          return { status: 200, body: { status: "ok", choice: output.choice, packetHash: output.packetHash, phase: phaseOf(flow) } };
        case "submit_explanation": {
          requireExactFields(body, new Set(["action", "text"]), ["text"]);
          output = await flow.explain(body.text);
          const state = flow.state();
          if (typeof state?.explanation !== "string" || !state.explanation.trim()) throw new ApiError(422, "VERIFIED_EXPLANATION_REQUIRED");
          return { status: 200, body: { status: "explained", phase: phaseOf(flow),
            questionId: state.question?.id, packetHash: state.packet?.packetHash, displayText: state.explanation } };
        }
        case "skip_explanation":
          requireExactFields(body, new Set(["action"]));
          flow.skipExplanation();
          return { status: 200, body: { status: "ok", phase: phaseOf(flow) } };
        case "ask_explanation_question":
          requireExactFields(body, new Set(["action", "question"]), ["question"]);
          output = flow.clarifyDuringExplanation(body.question);
          return { status: 200, body: { status: "clarification_pending", question: output.question, phase: phaseOf(flow) } };
        case "resolve_explanation_question":
          requireExactFields(body, new Set(["action", "answer"]), ["answer"]);
          output = flow.resolveExplanationQuestion(body.answer);
          return { status: 200, body: { status: "clarification_resolved", question: output.question,
            answer: output.answer, phase: phaseOf(flow), continueAfterExplanation: output.continueAfterExplanation } };
        case "commit_next":
        case "choose_learning_path":
        case "choose_confirmation_path":
        case "complete_confirmation_brief_explanation": {
          const allowed = body.action === "choose_learning_path" || body.action === "choose_confirmation_path"
            ? new Set(["action", "choice"])
            : body.action === "complete_confirmation_brief_explanation" ? new Set(["action", "text"]) : new Set(["action"]);
          requireExactFields(body, allowed, allowed.size === 2 ? [body.action === "complete_confirmation_brief_explanation" ? "text" : "choice"] : []);
          if (body.action === "commit_next") output = flow.commitPrefetchedNext();
          else if (body.action === "choose_learning_path") output = flow.chooseLearningPath(body.choice);
          else if (body.action === "choose_confirmation_path") output = flow.chooseConfirmationPath(body.choice);
          else output = flow.completeConfirmationBriefExplanation(body.text);
          if (output?.payload?.status === "ready") return { status: 200, body: { status: "ready", phase: phaseOf(flow), question: publicPayload(output.payload) } };
          if (output?.choiceRequired || output?.confirmationChoiceRequired)
            return { status: 200, body: { status: "choice_required", phase: phaseOf(flow), choices: output.choices, learning: output.learning } };
          return { status: 200, body: { status: output?.ready === false ? "not_ready" : "ok", phase: phaseOf(flow) } };
        }
        case "status":
          requireExactFields(body, new Set(["action"]));
          return { status: 200, body: { status: "ok", phase: phaseOf(flow), learning: flow.learningState?.() || null } };
        default:
          throw new ApiError(400, "ACTION_NOT_ALLOWED");
      }
    } catch (error) {
      return fail(error instanceof ApiError ? error.status : 409, safeCode(error));
    }
  }

  return Object.freeze({ handle });
}

/** Node's built-in HTTP adapter. Host binding and deployment remain caller-owned. */
export function createCrossAiLearningHttpServer(options) {
  const api = createCrossAiLearningApi(options);
  const maxBytes = options.maxRequestBytes ?? 1024 * 1024;
  return createServer(async (req, res) => {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) throw new ApiError(413, "REQUEST_TOO_LARGE");
        chunks.push(chunk);
      }
      let body = {};
      if (size) {
        if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json"))
          throw new ApiError(415, "JSON_CONTENT_TYPE_REQUIRED");
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { throw new ApiError(400, "JSON_INVALID"); }
      }
      const result = await api.handle({ method: req.method, path: req.url, headers: req.headers, body });
      res.writeHead(result.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(result.body));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ status: "blocked", error: safeCode(error) }));
    }
  });
}
