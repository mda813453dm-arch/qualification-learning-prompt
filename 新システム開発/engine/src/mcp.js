/**
 * MCP の入口（Claude・Perplexity・Gemini などの「カスタムコネクタ」から呼ばれる）。
 * Streamable HTTP の最小構成：POST /mcp に JSON-RPC を受け、JSON で返す（セッションは持たない）。
 * ツール名は ChatGPT の GPT 用 API 定義（openapi.yaml）の operationId と同じにして、同じプロンプトで動くようにしている。
 */
import { INSTRUCTIONS } from './instructions.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'qlp-engine', title: '資格学習エンジン', version: '0.1.0' };

const source = {
  type: 'object',
  required: ['adapter', 'year', 'section', 'questionUrl'],
  properties: {
    adapter: { type: 'string', enum: ['takken', 'surveyor'], description: 'takken＝宅建、surveyor＝測量士補' },
    year: { type: 'integer', description: '西暦の試験年度' },
    section: { type: 'string', description: '区分。分からなければ main' },
    questionUrl: { type: 'string', description: '公式の問題PDFのURL（https）' },
    answerUrl: { type: ['string', 'null'], description: '同じ年度の公式の正答PDFのURL。問題PDFに正答が入っていれば null' },
  },
};
const sessionId = { type: 'string', description: 'startSession / importHandoff で受け取った sessionId' };

/** name, description, inputSchema, そのツールが呼ぶ API（method, path, body） */
export const TOOLS = [
  {
    name: 'startSession',
    description: '資格の過去問の取り込みを始め、学習セッションを作る。qualificationId は q041＝宅建、q063＝測量士補。',
    inputSchema: {
      type: 'object',
      required: ['qualificationId', 'sources'],
      properties: {
        qualificationId: { type: 'string' },
        sources: { type: 'array', maxItems: 40, items: source },
        plan: { type: 'object', properties: { examDate: { type: 'string', description: 'YYYY-MM-DD' } } },
      },
    },
    api: (a) => ['POST', '/v1/sessions', { qualificationId: a.qualificationId, sources: a.sources, plan: a.plan }],
  },
  {
    name: 'nextQuestion',
    description: '次の問題を受け取る。未回答の問題があれば同じ問題を返す。status は question / waiting / finished。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/next`],
  },
  {
    name: 'submitAnswer',
    description: '回答を採点する。questionId は出題時に受け取ったものをそのまま渡す。',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'questionId', 'value'],
      properties: {
        sessionId,
        questionId: { type: 'string' },
        value: { type: 'string', description: '利用者が選んだ選択肢の番号' },
        confidence: { type: 'string', enum: ['sure', 'guess'], description: '勘で選んだと言われたら guess' },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/answer`, { questionId: a.questionId, value: a.value, confidence: a.confidence }],
  },
  {
    name: 'getHandoff',
    description: '次のチャットへ引き継ぐデータ（問題本文は含まない）を受け取る。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: (a) => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/handoff`],
  },
  {
    name: 'importHandoff',
    description: '引継ぎデータから学習を再開する。問題は引継ぎIDで保存してある分解結果から読み、公式PDFは取り直さない。',
    inputSchema: {
      type: 'object',
      required: ['handoff'],
      properties: { handoff: { type: 'string' }, sources: { type: 'array', maxItems: 40, items: source } },
    },
    api: (a) => ['POST', '/v1/handoff/import', { handoff: a.handoff, sources: a.sources }],
  },
  {
    name: 'getJob',
    description: '過去問の取り込みの状況を確かめる（呼ぶたびに少しずつ進む）。',
    inputSchema: { type: 'object', required: ['qualificationId'], properties: { qualificationId: { type: 'string' } } },
    api: (a) => ['GET', `/v1/jobs/${encodeURIComponent(a.qualificationId)}`],
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/**
 * JSON-RPC の1件を処理する。callApi(method, path, body) は認証済みで API を呼び、{status, body} を返す。
 * 通知（id が無いもの）は null を返す。
 */
export async function handleRpc(msg, callApi) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined;
  if (isNotification) return null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = BY_NAME.get(params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params.name}`);
      const args = params.arguments ?? {};
      for (const k of tool.inputSchema.required ?? []) {
        if (args[k] === undefined || args[k] === null || args[k] === '') {
          return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'ARGUMENT_REQUIRED', argument: k }) }] });
        }
      }
      const [m, path, body] = tool.api(args);
      const res = await callApi(m, path, body);
      return ok(id, {
        isError: res.status >= 400,
        content: [{ type: 'text', text: JSON.stringify(res.body) }],
        structuredContent: res.body,
      });
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}
