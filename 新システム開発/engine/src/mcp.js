/**
 * MCP の入口（Claude・Perplexity・Gemini などの「カスタムコネクタ」から呼ばれる）。
 * Streamable HTTP の最小構成：POST /mcp に JSON-RPC を受け、JSON で返す（セッションは持たない）。
 * ツール名は ChatGPT の GPT 用 API 定義（openapi.yaml）の operationId と同じにして、同じプロンプトで動くようにしている。
 */
import { INSTRUCTIONS } from './instructions.js';
import { WIDGET_URI, WIDGET_MIME, widgetHtml } from './widget.js';
import { FIXED_UI_CHOICES } from './fixed-ui.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'qlp-engine', title: '資格学習エンジン', version: '0.1.0' };

const source = {
  type: 'object',
  required: ['adapter', 'year', 'section', 'questionUrl'],
  properties: {
    adapter: { type: 'string', enum: ['takken', 'surveyor', 'chintai', 'fp2', 'fp3', 'itpass', 'gyosei'], description: 'takken＝宅建、surveyor＝測量士補、chintai＝賃管、fp2＝FP2級学科、fp3＝FP3級学科、itpass＝ITパスポート、gyosei＝行政書士' },
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
    description: '資格の過去問の取り込みを始め、学習セッションを作る。qualificationId は q041＝宅建、q063＝測量士補、q097＝賃管（賃貸不動産経営管理士）、q002＝FP2級、q003＝FP3級、q006＝ITパスポート、q090＝行政書士。資格名をそのまま入れてもよい。エンジンの資格は sources を空の配列にしてよい（エンジンが公式サイトから集める）。',
    inputSchema: {
      type: 'object',
      required: ['qualificationId', 'sources'],
      properties: {
        qualificationId: { type: 'string' },
        learnerId: { type: 'string', description: '引継ぎデータから再開したときだけ、その引継ぎID' },
        accessCode: { type: 'string', description: '利用コードが必要と返されたときだけ、利用者が入力したコードをそのまま入れる' },
        sources: { type: 'array', maxItems: 40, items: source },
        plan: { type: 'object', properties: { examDate: { type: 'string', description: 'YYYY-MM-DD' } } },
      },
    },
    api: (a) => ['POST', '/v1/sessions', { qualificationId: a.qualificationId, learnerId: a.learnerId, sources: a.sources, plan: a.plan, accessCode: a.accessCode }],
  },
  {
    name: 'startStudy',
    description: '学習の開始を記録する（開始時刻はエンジンが取る）。学習計画を利用者が承認したとき（再開なら『始めます』と答えたとき）に呼び、display をそのまま表示する。資格名を聞いた時点では呼ばない。',
    inputSchema: {
      type: 'object',
      required: ['qualificationName'],
      properties: {
        qualificationName: { type: 'string' },
        learnerId: { type: 'string', description: 'startSession の learnerId、または貼られた引継ぎデータの引継ぎID' },
      },
    },
    api: (a) => ['POST', '/v1/study/start', { qualificationName: a.qualificationName, learnerId: a.learnerId }],
  },
  {
    name: 'endStudy',
    description: '学習の終了。終了時刻・学習時間・累計をエンジンが確定し、終了ログと引継ぎデータの全文（display）を返す。display をそのまま表示する。',
    inputSchema: {
      type: 'object',
      required: ['studyId'],
      properties: {
        studyId: { type: 'string' },
        sessionId: { type: 'string' },
        area: { type: 'string' },
        item: { type: 'string' },
        purpose: { type: 'string' },
        studiedAreas: { type: 'array', items: { type: 'string' } },
        contents: { type: 'array', items: { type: 'string' } },
        results: { type: 'object' },
        weaknesses: { type: 'array', items: { type: 'string' } },
        review: { type: 'array', items: { type: 'string' } },
        progress: { type: 'object' },
        nextPriority: { type: 'array', items: { type: 'string' } },
        nextPurpose: { type: 'array', items: { type: 'string' } },
        qualification: { type: 'object' },
        plan: { type: 'array', items: { type: 'string' } },
        skippedTopics: { type: 'array', items: { type: 'string' } },
      },
    },
    api: ({ studyId, ...rest }) => ['POST', `/v1/study/${encodeURIComponent(studyId)}/end`, rest],
  },
  {
    name: 'nextQuestion',
    description: '次の問題を受け取る。未回答の問題があれば同じ問題を返す。status は question / waiting / finished。利用者が問題や分野を指定したとき（「問13を出して」「応用測量に移りたい」など）は question にその言葉を入れる。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId, question: { type: 'string', description: '利用者が指定した問題または分野（例：「2025年度 問13」「応用測量」）。再開のとき「新しい問題から」を選ばれたら「新しい問題」。指定が無ければ省く' } } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/next`, a.question ? { question: a.question } : undefined],
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
      properties: { handoff: { type: 'string' }, accessCode: { type: 'string', description: '利用コードが必要と返されたときだけ、利用者が入力したコード' }, sources: { type: 'array', maxItems: 40, items: source } },
    },
    api: (a) => ['POST', '/v1/handoff/import', { handoff: a.handoff, sources: a.sources, accessCode: a.accessCode }],
  },
  {
    name: 'getJob',
    description: '過去問の取り込みの状況を確かめる（呼ぶたびに少しずつ進む）。',
    inputSchema: { type: 'object', required: ['qualificationId'], properties: { qualificationId: { type: 'string' } } },
    api: (a) => ['GET', `/v1/jobs/${encodeURIComponent(a.qualificationId)}`],
  },
  {
    name: 'renderPdfPages',
    description: '公式PDFのページを画像にして返し、表を文字で読み取って tables（マークダウン）で返す（エンジンが対応していない資格の図や表を見せるため）。tables は問題文のあとにそのまま表示する。find に見出し（例：第11問）を渡すと、その見出しのあるページから span ページ分（既定2）を返す。find を使わないときは pages（PDFの先頭を1ページ目とした番号、最大4つ）。',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string' },
        find: { type: 'string', maxLength: 30 },
        span: { type: 'integer', minimum: 1, maximum: 4 },
        pages: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'integer', minimum: 1 } },
      },
    },
    api: (a) => ['POST', '/v1/pdf-pages', { url: a.url, find: a.find, span: a.span, pages: a.pages }],
  },
  {
    name: 'showMenu',
    appOnly: true,
    description: '番号で選んでもらう確認を、選択ボタンの画面に出す。「1：始めます」などの番号の選択肢をチャットの文字で書く代わりに、必ずこのツールを呼ぶ。kind＝exempt（免除制度を使うか）／status（学習状況）／plan（学習計画を示したあと「学習を開始しますか？」）／item（項目の進め方）／resume（続きから始めるか）／next（解説のあと「次の問題へ」）／review（採点後の簡単な理由のあと「詳しい解説／次の問題へ」）。呼んだら、画面のボタンが押されるまで返事を待つ（選択肢をチャットに書かない）。',
    inputSchema: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['exempt', 'status', 'plan', 'item', 'resume', 'next', 'review'] } } },
    local: (a) => {
      const menu = APP_MENUS[a.kind];
      return menu ? { status: 'menu', menu, howToProceed: '選択肢は画面のボタンに出ている。チャットには書かず、ボタンが押されるまで返事を待つ。' } : null;
    },
  },
];

const APP_MENUS = {
  exempt: { kind: 'exempt', prompt: FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.prompt, choices: [...FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.choices] },
  status: { kind: 'status', prompt: '現在の学習状況を選んでください。', choices: ['未着手', '基礎学習中', '応用学習中', '過去問演習中'] },
  plan: { kind: 'plan', prompt: '学習を開始しますか？', choices: ['始めます'] },
  item: { kind: 'item', prompt: 'この項目はどう進めますか？', choices: ['解説あり（解説→確認問題→実践問題）', '確認問題から（解説なし）', '実践問題から（解説も確認問題もなし）'], notice: '以後も同じにするときは「2 以後も」のように入力してください。' },
  resume: { kind: 'resume', prompt: '続きから始めますか？', choices: ['始めます'] },
  review: { kind: 'review', prompt: 'この問題はどうしますか？', choices: ['詳しい解説（法的根拠つき）', '次の問題へ'] },
  next: { kind: 'next', prompt: '次はどうしますか？', choices: ['次の問題へ'] },
};

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** ChatGPT アプリ（/app/<トークン>）で、問題をエンジンの画面に出すツール */
const WIDGET_TOOLS = new Set(['startSession', 'nextQuestion', 'submitAnswer', 'showMenu', 'endStudy']);
const WIDGET_HOW = '問題文・図・選択肢は、この下の問題の画面にエンジンが表示している。チャットに問題文・図・選択肢を書き直したり、別の図を探したり描いたりしない。「画面の選択肢を押して答えてください」とだけ伝える。利用者が番号をチャットに書いたら submitAnswer を呼ぶ。question の stem と choices は解説を頼まれたときのためのもの。';

/** AIに渡す結果からは、画面に出した図・表示文を外す（AIが問題を書き直さないように）。全文は _meta.qlp で画面だけに渡す。 */
export function forModel(body) {
  if (!body || typeof body !== 'object') return body;
  // 学習の終了：終了ログと引継ぎデータの全文は画面に出す（AIに要約・省略させない）
  if (typeof body.handoff === 'string' && typeof body.display === 'string') {
    const id = body.handoff.match(/引[継き]ぎ\s*ID\**\s*[：:]\s*\**\s*([A-Za-z0-9]+)/)?.[1];
    return { minutes: body.minutes, totalMinutes: body.totalMinutes, ...(id ? { handoffId: id } : {}), howToShow: '終了ログと引継ぎデータの全文は、この下の画面に表示している。チャットに書き直したり、要約したり、省いたりしない。「引継ぎデータは画面のコピーボタンでコピーできます。次のチャットで貼り付けるか、引継ぎIDを伝えてください」とだけ伝える。' };
  }
  // 学習の始め：免除・学習状況は画面のボタンで聞いている（AIは聞かない）
  if (Array.isArray(body.onboarding)) {
    const { onboarding, planMenu, howToProceed, ...rest } = body; // eslint-disable-line no-unused-vars
    return { ...rest, howToProceed: '試験概要を示す。免除（ある資格だけ）と学習状況は、この下の画面のボタンでエンジンが聞いている。AIは聞かず、利用者が答えるまで学習計画を作らない。答え（「免除：…／学習状況：…」）がチャットに届いたら、学習計画を示し、最後に showMenu（kind=plan）を呼ぶ。' };
  }
  const slim = (v) => {
    if (!v?.question) return v;
    const { display, screen, figures, figureUrls, howToShow, ...q } = v.question; // eslint-disable-line no-unused-vars
    return { ...v, question: { ...q, figureCount: (figureUrls ?? figures ?? []).length, howToShow: WIDGET_HOW } };
  };
  const out = slim(body);
  return out.next ? { ...out, next: slim(out.next) } : out;
}

/** ChatGPT アプリには、GPTのような指示文を置く場所がない。AIが必ず読むツールの説明に、学習の始め方の順番を入れる（2026-10-18 アプリで試験概要・学習状況の聴取が飛ばされた） */
/** アプリ用の指示文：GPTの指示文と同じ仕様。問題の表示だけ「問題の画面」に差し替える */
export function appInstructions() {
  const a = INSTRUCTIONS.indexOf('2. 表示：');
  const b = INSTRUCTIONS.indexOf('3. 利用者が番号を答えたら');
  if (a < 0 || b < 0) return INSTRUCTIONS;
  const display = '2. 表示：**問題文・図・選択肢は、エンジンが「問題の画面」に表示する。チャットには書かない（書き直さない・省かない・別の図を探したり描いたりしない）。** 画面の選択肢を押して答えてもらう（番号をチャットに書かれたら `submitAnswer` を呼ぶ）。前置きは短くし、出題の区切りの文（「📍分野」など）は画面に入っている。`status: waiting` のときだけ `screen` をそのまま出す。\n';
  const noInvent = '\n**仕様に書かれていない選択肢（資格の一覧、独自の「1〜4」の選択肢など）を作らない。** 番号で選んでもらう確認（学習の開始・項目の進め方・続きから・次の問題へ）は、チャットに「1：…」と書かず、必ず `showMenu` を呼んで選択ボタンで出す。学習計画は、この仕様の順（学習の進め方→最初の分野と理由→進め方）で示す。**前の会話で聞いた免除・学習状況を覚えていても、「前回と同じ条件で進めますか」などと聞いたり、答えを決めたりしない。毎回、仕様の順に showMenu（kind=exempt／status）を呼んで聞く。ChatGPT標準の質問・選択肢の画面は使わない。**\n**質問の範囲：利用者の質問は、選んだ資格の試験範囲の学習に関することだけ受け付ける。** 試験に関係のない話（このアプリ・システムの開発や運用、他の資格、雑談など）には「学習に関係のないご質問にはお答えできません。試験の学習に関することをご質問ください。」とだけ答え、続きは出題・学習に戻す。言葉の意味があいまいなとき（例：「開発許可」）は、必ず選んだ資格の試験科目での意味（宅建なら都市計画法の開発許可）として答え、聞き返さない。';
  return INSTRUCTIONS.slice(0, a) + display + INSTRUCTIONS.slice(b) + noInvent;
}

// アプリでは、資格の一覧をツールの説明に書かない（ChatGPTが資格の選択肢を勝手に作ったため）。資格名は利用者が自由に入力する
const APP_START_DESC = '資格の過去問の取り込みを始める。qualificationId には、利用者が入力した資格名をそのまま入れる（例：「測量士補」「宅建」）。sources は空の配列 [] にする（エンジンが公式サイトから集める）。利用者が資格名をまだ言っていないときは、このツールを呼ばず、「学習したい資格名を入力してください。（例：宅建、測量士補）」とだけ聞く（資格の選択肢を自分で作らない）。';

const APP_FLOW = {
  nextQuestion: '【順番：確認問題（AIが作った問題）の答えを受けたら、まず答え合わせと解説を書き、最後に showMenu（kind=next）を呼ぶ。利用者が「次の問題へ」を押すまで、このツールを呼ばない。解説より先に呼ぶと、実践問題が解説の上に出て分からなくなる】利用者が問題の画面の「解説を聞く」から解説を頼んだときは、解説を書いたあと、最後に showMenu（kind=next）を呼んで返事を待つ（「1：次の問題へ」をチャットに書かない）。利用者が「次の問題へ」と答えたときに、このツールを呼ぶ。',
  startSession: '【利用コード】エンジンが ACCESS_CODE_REQUIRED を返したら、「noteの記事に書かれた利用コードを入力してください」とだけ伝えて入力を待ち、入力されたコードをそのまま accessCode に入れて、もう一度呼ぶ。コードを推測・補完・提案しない。DAILY_LIMIT なら hint をそのまま伝えて終える。【学習の始め方：この順で進め、飛ばさない。資格名が入力されていたら、まずこのツールを呼ぶ】①このツールを呼んだら、過去問の取り込みは裏で進む（取り込みの進み具合は nextQuestion の notice で見る。「セッション」という言葉は利用者に言わない）。②公式サイトで確認できた試験概要（対象・出題分野・形式・時間・合格基準）を示す。確認できなかった項目は「未確認」と書く。③公式に免除制度がある資格だけ、showMenu（kind=exempt）を呼んで免除を使うかを聞き、押されるまで待つ。④続けて showMenu（kind=status）を呼んで学習状況を聞き、押されるまで待つ。ChatGPT標準の質問・選択肢の画面は使わない。⑤答えを受けてから学習計画（始める分野と理由、進め方）を示し、最後に showMenu（kind=plan）を呼んで返事を待つ（「1：始めます」をチャットに書かない）。利用者が計画を見る前に、勝手に学習計画を立てたり、問題を出したりしない。',
  startStudy: '利用者が「1」または「始めます」と答えたときにだけ呼ぶ。呼んだら display をそのまま表示し、続けて showMenu（kind=item）を呼んで進め方を選んでもらう（選択肢をチャットに書かない）。',
};

function widgetResource(baseUrl) {
  const origin = (() => { try { return new URL(baseUrl).origin; } catch { return null; } })();
  const csp = { connectDomains: [], resourceDomains: origin ? [origin] : [] };
  return {
    uri: WIDGET_URI,
    mimeType: WIDGET_MIME,
    text: widgetHtml(),
    _meta: {
      ui: { prefersBorder: true, csp },
      'openai/widgetPrefersBorder': true,
      'openai/widgetCSP': { connect_domains: [], resource_domains: csp.resourceDomains },
      'openai/widgetDescription': '過去問の問題文・公式PDFの図・選択肢を表示し、選択肢を押すと採点する画面。',
    },
  };
}
const WIDGET_TOOL_META = { ui: { resourceUri: WIDGET_URI }, 'openai/outputTemplate': WIDGET_URI, 'openai/widgetAccessible': true };
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/**
 * JSON-RPC の1件を処理する。callApi(method, path, body) は認証済みで API を呼び、{status, body} を返す。
 * 通知（id が無いもの）は null を返す。
 */
export async function handleRpc(msg, callApi, { widget = false, baseUrl = '' } = {}) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined;
  if (isNotification) return null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: widget ? { tools: { listChanged: false }, resources: { listChanged: false } } : { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: widget ? appInstructions() : INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, {
        tools: TOOLS.filter((t) => widget || !t.appOnly).map(({ name, description, inputSchema }) => ({ name, description: widget && name === 'startSession' ? `【この学習アプリの仕様（必ず守る）】\n${appInstructions()}\n\n${APP_FLOW[name]}\n${APP_START_DESC}` : widget && APP_FLOW[name] ? `${APP_FLOW[name]}\n${description}` : description, inputSchema, ...(widget && WIDGET_TOOLS.has(name) ? { _meta: WIDGET_TOOL_META } : {}) })),
      });
    case 'resources/list':
      if (!widget) return fail(id, -32601, `Method not found: ${method}`);
      return ok(id, { resources: [{ uri: WIDGET_URI, name: '問題の画面', mimeType: WIDGET_MIME }] });
    case 'resources/templates/list':
      if (!widget) return fail(id, -32601, `Method not found: ${method}`);
      return ok(id, { resourceTemplates: [] });
    case 'resources/read':
      if (!widget) return fail(id, -32601, `Method not found: ${method}`);
      if (params.uri !== WIDGET_URI) return fail(id, -32602, `Unknown resource: ${params.uri}`);
      return ok(id, { contents: [widgetResource(baseUrl)] });
    case 'tools/call': {
      const tool = BY_NAME.get(params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params.name}`);
      const args = params.arguments ?? {};
      for (const k of tool.inputSchema.required ?? []) {
        if (args[k] === undefined || args[k] === null || args[k] === '') {
          return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'ARGUMENT_REQUIRED', argument: k }) }] });
        }
      }
      if (tool.appOnly && !widget) return fail(id, -32602, `Unknown tool: ${params.name}`);
      if (tool.local) {
        const out = tool.local(args);
        if (!out) return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'ARGUMENT_INVALID', argument: 'kind' }) }] });
        return ok(id, { content: [{ type: 'text', text: JSON.stringify({ status: out.status, howToProceed: out.howToProceed }) }], structuredContent: { status: out.status, howToProceed: out.howToProceed }, _meta: { qlp: out } });
      }
      const [m, path, body] = tool.api(args);
      const res = await callApi(m, path, body);
      if (widget && WIDGET_TOOLS.has(tool.name) && res.status < 400) {
        const view = forModel(res.body);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(view) }], structuredContent: view, _meta: { qlp: res.body } });
      }
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
