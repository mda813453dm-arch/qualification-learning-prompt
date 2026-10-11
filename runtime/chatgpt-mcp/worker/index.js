const PROTOCOL = "2026-07-28";
const INDEX_URL = "https://mda813453dm-arch.github.io/shikaku-kakomon-urls/shikaku_kakomon_urls.csv";

const TOOL_DEFS = [
  {
    name: "start_study_session",
    description: "Start a persistent study session for any qualification. This initializes a new session; it does not claim that official questions have been retrieved.",
    inputSchema: { type: "object", properties: { qualification: { type: "string", minLength: 1 } }, required: ["qualification"], additionalProperties: false }
  },
  {
    name: "get_study_state",
    description: "Read the latest saved study state for the authenticated user.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "find_question_sources",
    description: "Search the maintained qualification CSV index and return candidate question and answer URLs. A returned URL is only an index candidate; the PDF has not been downloaded, read, or answer-verified.",
    inputSchema: { type: "object", properties: { year: { type: "string" }, section: { type: "string" } }, additionalProperties: false }
  },
  {
    name: "advance_study_state",
    description: "Apply one user-input transition. Out-of-order steps are rejected. Overview, plan, retrieval, question, and answer transitions that need independent verification are blocked until their server-side adapters are implemented.",
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "object", properties: { type: { type: "string" }, value: {}, overview: { type: "object" }, exemptionRequired: { type: "boolean" }, plan: { type: "object" }, confirmed: { type: "boolean" }, choice: { type: "string" } }, required: ["type"], additionalProperties: true }
      }, required: ["event"], additionalProperties: false
    }
  }
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Qualification Learning Runtime MCP endpoint", { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (url.pathname !== "/mcp" || request.method !== "POST") return new Response("Not found", { status: 404 });
    let rpc;
    try { rpc = await request.json(); } catch { return jsonRpc(null, -32700, "Invalid JSON"); }
    const respond = result => jsonRpc(rpc.id ?? null, null, null, result);
    try {
      if (rpc.method === "server/discover") return respond({ supportedVersions: [PROTOCOL], capabilities: { tools: {} } });
      if (rpc.method === "initialize") return respond({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "qualification-learning-runtime", version: "0.1.0" } });
      if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (rpc.method === "tools/list") return respond({ tools: TOOL_DEFS });
      if (rpc.method === "tools/call") {
        const result = await callTool(rpc.params?.name, rpc.params?.arguments ?? {}, request, env);
        return respond({ content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
      }
      if (rpc.id === undefined) return new Response(null, { status: 202 });
      return jsonRpc(rpc.id, -32601, "Method not found");
    } catch (error) {
      if (rpc.method === "tools/call") return respond({ content: [{ type: "text", text: error.code || "TOOL_FAILED" }], isError: true });
      return jsonRpc(rpc.id ?? null, -32603, "Internal error");
    }
  }
};

async function callTool(name, args, request, env) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) throw coded("AUTHENTICATED_USER_REQUIRED");
  if (!env.DB) throw coded("PERSISTENT_STORE_UNAVAILABLE");
  if (name === "start_study_session") {
    const qualification = normalizeText(args.qualification, 100);
    if (!qualification) throw coded("QUALIFICATION_REQUIRED");
    const id = crypto.randomUUID();
    const state = { state: "ASK_QUALIFICATION", qualification: null, overview: null, exemption: null, stage: null, plan: null, sessionStarted: false, currentQuestion: null, answer: null, retrieval: { cycleId: 0, attempts: [], exhausted: false } };
    const first = transition(state, { type: "SET_QUALIFICATION", qualification });
    if (!first.ok) throw coded(first.code);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO study_sessions (id, user_id, qualification, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, qualification, JSON.stringify(first.state), now, now).run();
    return { ok: true, sessionId: id, state: first.state, saved: true };
  }
  const row = await env.DB.prepare("SELECT id, qualification, state_json, updated_at FROM study_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").bind(userId).first();
  if (!row) throw coded("NO_STUDY_SESSION");
  const state = JSON.parse(row.state_json);
  if (name === "get_study_state") return { ok: true, sessionId: row.id, qualification: row.qualification, state, savedAt: row.updated_at };
  if (name === "find_question_sources") return findQuestionSources(row, userId, args, env);
  if (name !== "advance_study_state") throw coded("UNKNOWN_TOOL");
  const event = args.event;
  if (!["SET_EXEMPTION", "SET_STAGE", "START_SESSION", "CHOOSE_EXPLANATION", "FINISH"].includes(event.type)) {
    throw coded("EVENT_REQUIRES_VERIFIED_SERVER_ADAPTER");
  }
  const next = transition(state, event);
  if (!next.ok) throw coded(next.code);
  const savedAt = new Date().toISOString();
  await env.DB.prepare("UPDATE study_sessions SET state_json = ?, updated_at = ? WHERE id = ? AND user_id = ?").bind(JSON.stringify(next.state), savedAt, row.id, userId).run();
  return { ok: true, sessionId: row.id, state: next.state, savedAt };
}

async function findQuestionSources(session, userId, args, env) {
  const attempt = { route: "maintained-index-csv", url: INDEX_URL, startedAt: new Date().toISOString(), status: "started" };
  try {
    const response = await fetch(INDEX_URL, { redirect: "manual" });
    attempt.httpStatus = response.status;
    const final = new URL(response.url || INDEX_URL);
    if (!response.ok) throw coded("INDEX_HTTP_" + response.status);
    if (final.protocol !== "https:" || final.hostname !== "mda813453dm-arch.github.io") throw coded("INDEX_REDIRECT_NOT_ALLOWED");
    const contentType = response.headers.get("content-type") || "";
    if (!/(csv|text|octet-stream)/i.test(contentType)) throw coded("INDEX_CONTENT_TYPE_INVALID");
    const records = parseCsv(await response.text());
    if (!records.length) throw coded("INDEX_EMPTY");
    const headers = records[0].map(value => value.replace(/^\uFEFF/, "").trim());
    const required = ["資格名", "過去問一覧URL", "種別", "年度", "区分・状況", "URL"];
    const positions = Object.fromEntries(required.map(key => [key, headers.indexOf(key)]));
    for (const key of required) if (positions[key] < 0) throw coded("INDEX_COLUMN_MISSING:" + key);
    const rows = records.slice(1).map(cells => Object.fromEntries(required.map(key => [key, (cells[positions[key]] ?? "").trim()])));
    const normalize = value => String(value ?? "").normalize("NFKC").replace(/[\s　()（）・:：]/g, "").toLowerCase();
    const isHttps = value => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
    const relevant = rows.filter(record => normalize(record["資格名"]) === normalize(session.qualification));
    const questions = relevant.filter(record => record["種別"] === "問題" && isHttps(record.URL) && (!args.year || record["年度"] === String(args.year)) && (!args.section || normalize(record["区分・状況"]).includes(normalize(args.section))));
    const candidates = questions.map(question => {
      const linked = relevant.filter(answer => answer["種別"] === "正解" &&
        ((answer.URL && answer["年度"] === question["年度"] && normalize(answer["区分・状況"]) === normalize(question["区分・状況"])) ||
         (!answer.URL && answer["年度"] === question["年度"] && answer["区分・状況"].includes("同一PDF") && answer["過去問一覧URL"] === question["過去問一覧URL"])));
      return { key: { qualification: session.qualification, year: question["年度"], section: question["区分・状況"] }, indexUrl: question["過去問一覧URL"], questionUrl: question.URL, answerCandidates: linked.map(answer => answer.URL || question.URL), answerIndexNotes: linked.filter(answer => !answer.URL).map(answer => answer["区分・状況"]), status: "candidate_only_pdf_not_read_answer_not_verified" };
    });
    attempt.status = "completed";
    attempt.candidateCount = candidates.length;
    attempt.finishedAt = new Date().toISOString();
    await logAttempt(env.DB, session.id, userId, attempt);
    return { status: candidates.length ? "candidates_found" : "no_candidates_in_index", qualification: session.qualification, candidates, attempt, nextRequirement: "取得経路から本文・全選択肢・正答箇所を同一問題キーで照合するまで出題不可" };
  } catch (error) {
    attempt.status = "failed";
    attempt.error = error.code || "INDEX_FETCH_FAILED";
    attempt.finishedAt = new Date().toISOString();
    await logAttempt(env.DB, session.id, userId, attempt);
    return { status: "failed", qualification: session.qualification, candidates: [], attempt, notAttempted: ["official question PDF download", "PDF text extraction", "answer mapping verification"] };
  }
}

async function logAttempt(db, sessionId, userId, attempt) {
  await db.prepare("INSERT INTO retrieval_attempts (id, session_id, user_id, route, source_url, status, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), sessionId, userId, attempt.route, attempt.url, attempt.status, JSON.stringify(attempt), attempt.finishedAt || new Date().toISOString()).run();
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

const STATES = {
  ASK_QUALIFICATION: "ASK_QUALIFICATION", OVERVIEW: "OVERVIEW", EXEMPTION: "EXEMPTION", STAGE: "STAGE", PLAN: "PLAN", START_CONFIRMATION: "START_CONFIRMATION", ACTIVE: "ACTIVE", QUESTION_AWAITING_ANSWER: "QUESTION_AWAITING_ANSWER", ANSWER_AWAITING_EXPLANATION_CHOICE: "ANSWER_AWAITING_EXPLANATION_CHOICE", RECOVERY: "RECOVERY", FINISHED: "FINISHED"
};

function transition(s, event) {
  const fail = code => ({ ok: false, code });
  switch (event.type) {
    case "SET_QUALIFICATION":
      if (s.state !== STATES.ASK_QUALIFICATION || !event.qualification?.trim()) return fail("INVALID_QUALIFICATION_STEP");
      return { ok: true, state: { ...s, qualification: event.qualification.trim(), state: STATES.OVERVIEW } };
    case "CONFIRM_OVERVIEW":
      if (s.state !== STATES.OVERVIEW) return fail("OVERVIEW_OUT_OF_ORDER");
      if (!event.overview?.officialSourceVerified || !event.overview?.requiredFieldsDisplayed) return fail("OVERVIEW_NOT_VERIFIED");
      return { ok: true, state: { ...s, overview: event.overview, state: event.exemptionRequired ? STATES.EXEMPTION : STATES.STAGE } };
    case "SET_EXEMPTION":
      if (s.state !== STATES.EXEMPTION || !["applies", "not_used", "unknown"].includes(event.value)) return fail("EXEMPTION_OUT_OF_ORDER");
      return { ok: true, state: { ...s, exemption: event.value, state: STATES.STAGE } };
    case "SET_STAGE":
      if (s.state !== STATES.STAGE || ![1, 2, 3, 4].includes(event.value)) return fail("STAGE_OUT_OF_ORDER");
      return { ok: true, state: { ...s, stage: event.value, state: STATES.PLAN } };
    case "SET_PLAN":
      if (s.state !== STATES.PLAN || !event.plan?.firstItem || !event.plan?.reason || !event.plan?.scopeVerified) return fail("PLAN_NOT_VERIFIED");
      return { ok: true, state: { ...s, plan: event.plan, state: STATES.START_CONFIRMATION } };
    case "START_SESSION":
      if (s.state !== STATES.START_CONFIRMATION || event.confirmed !== true) return fail("START_NOT_CONFIRMED");
      return { ok: true, state: { ...s, sessionStarted: true, state: STATES.ACTIVE } };
    case "RECORD_RETRIEVAL_ATTEMPT": {
      if (![STATES.ACTIVE, STATES.RECOVERY].includes(s.state)) return fail("RETRIEVAL_OUT_OF_ORDER");
      if (!event.attempt?.route || !event.attempt?.result) return fail("ATTEMPT_NOT_RECORDED");
      const attempts = [...s.retrieval.attempts, event.attempt];
      const exhausted = event.exhausted === true && event.policyLimitReached === true;
      return { ok: true, state: { ...s, retrieval: { ...s.retrieval, attempts, exhausted }, state: exhausted ? STATES.RECOVERY : s.state } };
    }
    case "CHOOSE_EXPLANATION":
      if (s.state !== STATES.ANSWER_AWAITING_EXPLANATION_CHOICE || !["show", "skip"].includes(event.choice)) return fail("EXPLANATION_CHOICE_REQUIRED");
      return { ok: true, state: { ...s, state: STATES.ACTIVE } };
    case "FINISH": return { ok: true, state: { ...s, state: STATES.FINISHED } };
    default: return fail("UNKNOWN_EVENT");
  }
}

function normalizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function coded(code) { return Object.assign(new Error(code), { code }); }
function jsonRpc(id, code, message, result) {
  const body = code ? { jsonrpc: "2.0", id, error: { code, message } } : { jsonrpc: "2.0", id, result };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json; charset=utf-8" } });
}
