import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

function database() {
  const rows = [];
  const attempts = [];
  return {
    rows,
    attempts,
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() {
          if (sql.startsWith("INSERT INTO study_sessions")) {
            const [id, user_id, qualification, state_json, created_at, updated_at] = this.values;
            rows.push({ id, user_id, qualification, state_json, created_at, updated_at });
          } else if (sql.startsWith("INSERT INTO retrieval_attempts")) {
            const [id, session_id, user_id, route, source_url, status, details_json, created_at] = this.values;
            attempts.push({ id, session_id, user_id, route, source_url, status, details_json, created_at });
          } else if (sql.startsWith("UPDATE study_sessions")) {
            const [state_json, updated_at, id, user_id] = this.values;
            const row = rows.find(item => item.id === id && item.user_id === user_id);
            if (row) Object.assign(row, { state_json, updated_at });
          }
          return { success: true };
        },
        async first() {
          const [userId] = this.values;
          return rows.filter(row => row.user_id === userId).sort((a,b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
        }
      };
    }
  };
}

async function call(env, name, args = {}, userId = "test-user") {
  const response = await worker.fetch(new Request("https://site.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "oai-authenticated-user-id": userId },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })
  }), env);
  const rpc = await response.json();
  const block = rpc.result.content[0].text;
  return rpc.result.isError ? { error: block } : JSON.parse(block);
}

test("MCP discovery and tool definitions are available", async () => {
  const response = await worker.fetch(new Request("https://site.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), {});
  const data = await response.json();
  assert.deepEqual(data.result.tools.map(tool => tool.name), ["start_study_session", "get_study_state", "find_question_sources", "advance_study_state"]);
});

test("sessions are saved per authenticated user and can be restored", async () => {
  const env = { DB: database() };
  const started = await call(env, "start_study_session", { qualification: "土地家屋調査士" });
  assert.equal(started.ok, true);
  assert.equal(started.state.state, "OVERVIEW");
  const restored = await call(env, "get_study_state");
  assert.equal(restored.qualification, "土地家屋調査士");
  assert.equal(restored.state.state, "OVERVIEW");
});

test("AI-supplied claims cannot bypass the server verification adapter", async () => {
  const env = { DB: database() };
  await call(env, "start_study_session", { qualification: "測量士補" });
  const result = await call(env, "advance_study_state", { event: { type: "CONFIRM_OVERVIEW", overview: { officialSourceVerified: true, requiredFieldsDisplayed: true } } });
  assert.equal(result.error, "EVENT_REQUIRES_VERIFIED_SERVER_ADAPTER");
  const state = await call(env, "get_study_state");
  assert.equal(state.state.state, "OVERVIEW");
});

test("source lookup returns index candidates without claiming PDF or answer verification", async () => {
  const env = { DB: database() };
  await call(env, "start_study_session", { qualification: "資格A" });
  const originalFetch = globalThis.fetch;
  const csv = '資格名,過去問一覧URL,種別,年度,区分・状況,URL\n資格A,https://exam.example/list,問題,2025,午前,"https://exam.example/q.pdf"\n資格A,https://exam.example/list,正解,2025,午前,"https://exam.example/a.pdf"\n';
  globalThis.fetch = async () => new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
  try {
    const result = await call(env, "find_question_sources", { year: "2025", section: "午前" });
    assert.equal(result.status, "candidates_found");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].questionUrl, "https://exam.example/q.pdf");
    assert.deepEqual(result.candidates[0].answerCandidates, ["https://exam.example/a.pdf"]);
    assert.equal(result.candidates[0].status, "candidate_only_pdf_not_read_answer_not_verified");
    assert.equal(env.DB.attempts.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("unauthenticated calls and illegal step order are rejected", async () => {
  const request = new Request("https://site.test/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "start_study_session", arguments: { qualification: "宅建" } } }) });
  const response = await worker.fetch(request, { DB: database() });
  assert.equal((await response.json()).result.isError, true);
  const env = { DB: database() };
  await call(env, "start_study_session", { qualification: "通関士" });
  const result = await call(env, "advance_study_state", { event: { type: "SET_STAGE", value: 4 } });
  assert.equal(result.error, "STAGE_OUT_OF_ORDER");
});
