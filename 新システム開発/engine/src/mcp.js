import { explainHow } from './explain.js';
/**
 * MCP の入口（Claude・Perplexity・Gemini などの「カスタムコネクタ」から呼ばれる）。
 * Streamable HTTP の最小構成：POST /mcp に JSON-RPC を受け、JSON で返す（セッションは持たない）。
 * ツール名は ChatGPT の GPT 用 API 定義（openapi.yaml）の operationId と同じにして、同じプロンプトで動くようにしている。
 */
import { INSTRUCTIONS } from './instructions.js';
import { WIDGET_URI, WIDGET_MIME, WIDGET_VERSION, widgetHtml } from './widget.js';
import { FIXED_UI_CHOICES } from './fixed-ui.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'qlp-engine', title: '資格学習エンジン', version: '0.1.0' };

const source = {
  type: 'object',
  required: ['adapter', 'year', 'section', 'questionUrl'],
  properties: {
    adapter: { type: 'string', enum: ['takken', 'surveyor', 'chintai', 'fp2', 'fp3', 'itpass', 'gyosei', 'shindan', 'mankan'], description: 'takken＝宅建、surveyor＝測量士補、chintai＝賃管、fp2＝FP2級学科、fp3＝FP3級学科、itpass＝ITパスポート、gyosei＝行政書士、shindan＝中小企業診断士（第1次試験。区分は科目名）、mankan＝マンション管理士' },
    year: { type: 'integer', description: '西暦の試験年度' },
    section: { type: 'string', description: '区分。分からなければ main' },
    questionUrl: { type: 'string', description: '公式の問題PDFのURL（https）' },
    answerUrl: { type: ['string', 'null'], description: '同じ年度の公式の正答PDFのURL。問題PDFに正答が入っていれば null' },
  },
};
const sessionId = { type: 'string', description: 'startSession / importHandoff で受け取った sessionId' };
const UI_STAGES = ['bridge_ready', 'legacy_ready', 'render_onboarding', 'render_question', 'render_other'];

/** name, description, inputSchema, そのツールが呼ぶ API（method, path, body） */
export const TOOLS = [
  {
    name: 'reportUiEvent',
    appOnly: true,
    uiOnly: true,
    description: '画面の通信と描画の到達点だけを記録する。学習データを送らず、画面も変更しない。',
    inputSchema: { type: 'object', required: ['stage', 'version'], additionalProperties: false, properties: { stage: { type: 'string', enum: UI_STAGES }, version: { type: 'string', enum: [WIDGET_VERSION] } } },
    local: (a) => {
      if (!UI_STAGES.includes(a.stage) || a.version !== WIDGET_VERSION || Object.keys(a).some((k) => !['stage', 'version'].includes(k))) return null;
      console.log(JSON.stringify({ event: 'widget_ui', stage: a.stage, version: a.version }));
      return { status: 'recorded' };
    },
  },
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
    name: 'redisplayQuestion',
    appOnly: true,
    uiOnly: true,
    description: '表示失敗時に、出題中の同じ公式問題だけを読み取り直す。次の問題への進行・採点・記録変更は行わない。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: (a) => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/redisplay`],
  },
  {
    name: 'completeRemediation',
    appOnly: true,
    description: '同一分野の公式実践3問連続不正解後、AI作成確認問題を出して利用者の回答を採点した後にのみ呼ぶ。checkQuestion=実際に出題したAI確認問題の本文、selected=実際の回答、correctAnswer=出題時に固定した正答。誤答・未回答時は解放しない。正解時に同じ分野の実践へ復帰する。',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'checkQuestion', 'selected', 'correctAnswer'],
      properties: {
        sessionId,
        checkQuestion: { type: 'string', minLength: 10, maxLength: 2000 },
        selected: { type: 'string' },
        correctAnswer: { type: 'string' },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/remediation/complete`, { checkQuestion: a.checkQuestion, selected: a.selected, correctAnswer: a.correctAnswer }],
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
    name: 'attachPdf',
    appOnly: true,
    description: '利用者がこのチャットに添付した過去問のPDF（公式の問題PDF、あれば正答PDF）をエンジンに渡し、出題に加える。過去問がそろわないときや、利用者が手元の過去問を使いたいときに、利用者がPDFを添付したら呼ぶ。year は添付PDFの表紙にある実施年度（西暦。令和7年度なら2025）。PDFの中身をAIが書き写して問題を作らない（出題・採点はエンジンが行う）。返ってきた notice をそのまま伝え、次の問題は nextQuestion で受け取る。',
    meta: { 'openai/fileParams': ['questionPdf', 'answerPdf'] },
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'year', 'questionPdf'],
      properties: {
        sessionId,
        year: { type: 'integer', description: '添付PDFの実施年度（西暦）' },
        questionPdf: { type: 'object', description: '添付された問題PDF', properties: { download_url: { type: 'string' }, file_id: { type: 'string' }, file_name: { type: 'string' }, mime_type: { type: 'string' } }, required: ['download_url'] },
        answerPdf: { type: 'object', description: '添付された正答PDF（問題PDFに正答が入っていれば省く）', properties: { download_url: { type: 'string' }, file_id: { type: 'string' }, file_name: { type: 'string' }, mime_type: { type: 'string' } }, required: ['download_url'] },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/attach`, { year: a.year, question: a.questionPdf, answer: a.answerPdf }],
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
    description: '番号で選んでもらう確認を、選択ボタンの画面に出す。「1：始めます」などの番号の選択肢をチャットの文字で書く代わりに、必ずこのツールを呼ぶ。kind＝exempt（免除制度を使うか）／status（学習状況）／plan（学習計画を示したあと「学習を開始しますか？」）／item（項目の進め方）／resume（続きから始めるか）／next（解説のあと「次の問題へ」）／review（採点後の簡単な理由のあと「詳しい解説／次の問題へ」）。呼んだら、画面のボタンが押されるまで返事を待つ（選択肢をチャットに書かない）。【解説・答え合わせの文章は body に入れる】チャットに書いてからこのツールを呼ぶと、ChatGPTの画面ではボタンが文章の上に出てしまい、利用者が見つけられない。解説・答え合わせ・理由の文章（Markdown。表・箇条書き可）は、チャットには書かず、このツールの body に入れる。body は、ボタンと同じ枠のボタンの上に表示される。body を入れたら、チャットには何も書かない。学習中のメニュー（next/review/check）には startStudy で返された studyId と learnerId、および startSession の sessionId を引数に含め、終了ボタンが直接エンジンから引継ぎデータを取得できるようにする。',
    inputSchema: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['exempt', 'status', 'plan', 'item', 'resume', 'next', 'review', 'check'] }, body: { type: 'string', maxLength: 8000, description: 'ボタンの上に出す解説・答え合わせの文章（Markdown）' }, sessionId: { type: 'string', description: '学習中のセッションID。終了操作のため必ず渡す' }, studyId: { type: 'string', description: 'startStudyで受け取った学習ID。終了操作のため必ず渡す' }, learnerId: { type: 'string', description: 'startStudyで受け取った引継ぎID' } } },
    local: (a) => {
      const menu = APP_MENUS[a.kind];
      const NEXT = { exempt: ' 答えが届いたら、次に showMenu（kind=status）を呼ぶ。', status: ' 答えが届いたら、学習計画を示し、最後に showMenu（kind=plan）を呼ぶ。' };
      const body = typeof a.body === 'string' && a.body.trim() ? a.body.slice(0, 8000) : null;
      return menu ? { status: 'menu', menu: { ...menu, ...(body ? { body } : {}), ...(a.sessionId ? { sessionId: a.sessionId } : {}), ...(a.studyId ? { studyId: a.studyId } : {}), ...(a.learnerId ? { learnerId: a.learnerId } : {}) }, howToProceed: `選択肢は画面のボタンに出ている。チャットには書かず、ボタンが押されるまで返事を待つ。${NEXT[a.kind] ?? ''}` } : null;
    },
  },
  {
    name: 'explainSpec',
    appOnly: true,
    description: '採点された問題の解説の書き方を、エンジンから受け取る。利用者が「○年度 問○に…と答え、正解／不正解でした。解説をお願いします」と送ってきたら（問題文と選択肢は、直前の nextQuestion の結果にある。利用者は送ってこない。チャットに問題を書き直さない）、解説を書く前に必ずこのツールを呼ぶ（correct＝正解なら true、selected＝利用者の答えの番号、correctAnswer＝正答の番号、fieldName＝分野。文に「同じ分野で3問続けて不正解」があれば checkSuggested を true）。返った explainHow と order のとおりに解説を書き、最後に showMenu（kind=review）を呼ぶ。checkPlan があれば、それにも従う。',
    inputSchema: { type: 'object', required: ['correct', 'selected', 'correctAnswer'], properties: { correct: { type: 'boolean' }, selected: { type: 'string' }, correctAnswer: { type: 'string' }, fieldName: { type: 'string' }, checkSuggested: { type: 'boolean' } } },
    local: (a) => ({
      status: 'explainSpec',
      explainHow: explainHow({ grade: { correct: !!a.correct, selected: String(a.selected ?? ''), correctAnswer: String(a.correctAnswer ?? '') }, fieldName: a.fieldName ?? null }),
      order: REVIEW_ORDER,
      // 同じ分野で3問続けて間違えたときは、解説のあとに確認問題を選べるようにする。確認問題はAIが作り、分野と問数を先に示す
      ...(a.checkSuggested ? { checkPlan: `同じ分野（${a.fieldName ?? '今の分野'}）で3問続けて間違えたので、解説は、チャットには書かず showMenu（kind=check）の body に入れて呼ぶ。「確認問題で基本を確かめる」が押されたら、まず『${a.fieldName ?? '今の分野'}の確認問題を3問出します（AIが作った問題です）』と書き、その分野の確認問題を1問ずつ出す。3問の答え合わせは、チャットには書かず showMenu（kind=next）の body に入れて呼ぶ。` } : {}),
    }),
  },
  {
    name: 'saveProfile',
    appOnly: true,
    uiOnly: true,
    description: '学習準備の確認（免除の適用状況・学習段階）の答えを控える。問題の画面だけが呼ぶ。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId, exemption: { type: 'string', enum: ['confirmed', 'no', 'pending'] }, stage: { type: 'integer', minimum: 1, maximum: 4 } } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/profile`, { exemption: a.exemption, stage: a.stage }],
  },
  {
    name: 'chooseItem',
    appOnly: true,
    uiOnly: true,
    description: '学習する分野と進め方（explain＝解説あり／check＝確認問題から／practice＝実践問題から）を控える。問題の画面だけが呼ぶ。',
    inputSchema: { type: 'object', required: ['sessionId', 'fieldName', 'mode'], properties: { sessionId, fieldName: { type: 'string' }, mode: { type: 'string', enum: ['explain', 'check', 'practice'] } } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/item`, { fieldName: a.fieldName, mode: a.mode }],
  },
  {
    name: 'diagStep',
    appOnly: true,
    uiOnly: true,
    description: '初期診断（過去問）を始める（action=start）、または画面で選ばれた答えを採点する（action=answer）。問題の画面だけが呼ぶ。',
    inputSchema: { type: 'object', required: ['sessionId', 'action'], properties: { sessionId, action: { type: 'string', enum: ['start', 'answer'] }, value: { type: 'string' } } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/diag`, { action: a.action, value: a.value }],
  },
];

const REVIEW_ORDER = '【順番】①なぜその答えになるのかの簡単な理由を2〜3文でまとめる（正解でも不正解でも。図は新しく出さない・探さない）。②その文章はチャットに書かず、showMenu（kind=review）の body に入れて呼ぶ。チャットには何も書かず、ボタンが押されるまで待つ（選択肢をチャットに書かない）。③「詳しい解説」が押されたら、法的根拠（条文・判例など）を示した詳しい解説を、explainHow の書き方でまとめ、チャットには書かず showMenu（kind=next）の body に入れて呼ぶ。④「次の問題へ」が押されたら nextQuestion を呼ぶ。';

const APP_MENUS = {
  exempt: { kind: 'exempt', prompt: FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.prompt, choices: [...FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.choices] },
  status: { kind: 'status', prompt: '現在の学習状況を選んでください。', choices: ['未着手', '基礎学習中', '応用学習中', '過去問演習中'] },
  plan: { kind: 'plan', prompt: '学習計画をこのまま始めますか？', choices: ['承認して始める', '手直しする'] },
  item: { kind: 'item', prompt: 'この項目はどう進めますか？', choices: ['解説あり（解説→確認問題→実践問題）', '確認問題から（解説なし）', '実践問題から（解説も確認問題もなし）'], notice: '以後も同じにするときは「2 以後も」のように入力してください。' },
  resume: { kind: 'resume', prompt: '続きから始めますか？', choices: ['始めます'] },
  review: { kind: 'review', prompt: 'この問題はどうしますか？', choices: ['詳しい解説（法的根拠つき）', '次の問題へ'] },
  check: { kind: 'check', prompt: '同じ分野で3問続けて間違えました。弱点を確かめる確認問題を出しますか？', choices: ['確認問題で基本を確かめる', '次の問題へ'] },
  next: { kind: 'next', prompt: '次はどうしますか？', choices: ['次の問題へ', '総復習（間違えた問題）'] },
};

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** ChatGPT アプリ（/app/<トークン>）で、問題をエンジンの画面に出すツール */
const LEGACY_WIDGET_URIS = ['ui://qlp/question-v1.html', 'ui://qlp/question-v2.html', 'ui://qlp/question-v3.html', 'ui://qlp/question-v4.html', 'ui://qlp/question-v5.html', 'ui://qlp/question-v6.html', 'ui://qlp/question-v7.html', 'ui://qlp/question-v8.html', 'ui://qlp/question-v9.html', 'ui://qlp/question-v10.html', 'ui://qlp/question-v11.html', 'ui://qlp/question-v12.html', 'ui://qlp/question-v13.html', 'ui://qlp/question-v14.html', 'ui://qlp/question-v15.html', 'ui://qlp/question-v16.html', 'ui://qlp/question-v17.html', 'ui://qlp/question-v18.html', 'ui://qlp/question-v19.html', 'ui://qlp/question-v20.html', 'ui://qlp/question-v21.html', 'ui://qlp/question-v22.html', 'ui://qlp/question-v23.html', 'ui://qlp/question-v24.html', 'ui://qlp/question-v25.html', 'ui://qlp/question-v26.html', 'ui://qlp/question-v27.html', 'ui://qlp/question-v28.html', 'ui://qlp/question-v29.html', 'ui://qlp/question-v30.html', 'ui://qlp/question-v31.html', 'ui://qlp/question-v32.html', 'ui://qlp/question-v33.html', 'ui://qlp/question-v34.html', 'ui://qlp/question-v35.html', 'ui://qlp/question-v36.html', 'ui://qlp/question-v37.html'];
const LEGACY_WIDGET_URI = LEGACY_WIDGET_URIS[0];
const WIDGET_TOOLS = new Set(['startSession', 'nextQuestion', 'submitAnswer', 'showMenu', 'endStudy', 'startStudy']);
const WIDGET_HOW = '問題文・図・選択肢は、この下の問題の画面にエンジンが表示している。チャットに問題文・図・選択肢を書き直したり、別の図を探したり描いたりしない。画面のあとのチャットの文は1行まで（「画面の選択肢を押して答えてください」だけ）。長く書くと画面が上に押し出されて見えなくなる。利用者が番号をチャットに書いたら submitAnswer を呼ぶ。question の stem と choices は解説を頼まれたときのためのもの。';

/** AIに渡す結果からは、画面に出した図・表示文を外す（AIが問題を書き直さないように）。全文は _meta.qlp で画面だけに渡す。 */
export function forModel(body) {
  if (!body || typeof body !== 'object') return body;
  // 学習の終了：終了ログと引継ぎデータの全文は画面に出す（AIに要約・省略させない）
  if (typeof body.handoff === 'string' && typeof body.display === 'string') {
    const id = body.handoff.match(/引[継き]ぎ\s*ID\**\s*[：:]\s*\**\s*([A-Za-z0-9]+)/)?.[1];
    return { minutes: body.minutes, totalMinutes: body.totalMinutes, ...(id ? { handoffId: id } : {}), howToShow: '終了ログと引継ぎデータの全文は、この下の画面に表示している。チャットに書き直したり、要約したり、省いたりしない。「引継ぎデータは画面のコピーボタンでコピーできます。次のチャットで貼り付けるか、引継ぎIDを伝えてください」とだけ伝える。' };
  }
  // 学習の始め：免除・学習状況は問題の画面のボタンで聞いている（AIは聞かない）
  if (Array.isArray(body.onboarding)) {
    const { onboarding, overview, planMenu, howToProceed, screen, ...rest } = body; // eslint-disable-line no-unused-vars
    return { ...rest, howToProceed: '免除（ある資格だけ）と学習状況は、この下の画面のボタンでエンジンが聞いている。AIは聞かず、画面のあとのチャットの文は「画面のボタンで選んでください」の1行だけにする（長く書くと画面が上に押し出されて見えなくなる）。利用者が答えるまで待つ。そのあとの学習計画・初期診断・学習の開始・進め方の選択も、この画面とエンジンだけで進む（AIは計画を書かず、showMenu も nextQuestion も呼ばない）。画面から解説などを頼まれたら、そのとき答える。' };
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
  const noInvent = '\n**仕様に書かれていない選択肢（資格の一覧、独自の「1〜4」の選択肢など）を作らない。** 番号で選んでもらう確認（学習の開始・項目の進め方・続きから・次の問題へ）は、チャットに「1：…」と書かず、必ず `showMenu` を呼んで選択ボタンで出す。学習計画は、この仕様の順（学習の進め方→最初の分野と理由→進め方）で示す。**前の会話で聞いた免除・学習状況を覚えていても、「前回と同じ条件で進めますか」などと聞いたり、答えを決めたりしない。免除・学習状況は、startSession のあとに nextQuestion を呼べば、エンジンが試験概要の直下にボタンで聞く（AIは聞かない）。ChatGPT標準の質問・選択肢の画面は使わない。**\n**質問の範囲：利用者の質問は、選んだ資格の試験範囲の学習に関することだけ受け付ける。** 試験に関係のない話（このアプリ・システムの開発や運用、他の資格、雑談など）には「学習に関係のないご質問にはお答えできません。試験の学習に関することをご質問ください。」とだけ答え、続きは出題・学習に戻す。言葉の意味があいまいなとき（例：「開発許可」）は、必ず選んだ資格の試験科目での意味（宅建なら都市計画法の開発許可）として答え、聞き返さない。\n**利用者が過去問のPDF（公式の問題PDF・正答PDF）を添付したら、`attachPdf` を呼んでエンジンに渡す。** PDFの中身をAIが書き写して出題・採点しない。';
  // U01：資格名の質問はマスタープロンプトの文言（GPTの指示文は運営者が貼り直すまで変えない）
  return (INSTRUCTIONS.slice(0, a) + display + INSTRUCTIONS.slice(b) + noInvent).replace('「学習したい資格名を入力してください。（例：宅建、測量士補）」', '「受験する資格名を教えてください。」');
}

// アプリでは、資格の一覧をツールの説明に書かない（ChatGPTが資格の選択肢を勝手に作ったため）。資格名は利用者が自由に入力する
const APP_START_DESC = '資格の過去問の取り込みを始める。qualificationId には、利用者が入力した資格名をそのまま入れる（例：「測量士補」「宅建」）。sources は空の配列 [] にする（エンジンが公式サイトから集める）。利用者が資格名をまだ言っていないときは、このツールを呼ばず、「受験する資格名を教えてください。」とだけ聞く（資格の選択肢を自分で作らない）。';

const APP_FLOW = {
  nextQuestion: '【順番：確認問題（AIが作った問題）の答えを受けたら、答え合わせと解説は、チャットには書かず showMenu（kind=next）の body に入れて呼ぶ。利用者が「次の問題へ」を押すまで、このツールを呼ばない。解説より先に呼ぶと、実践問題が解説の上に出て分からなくなる】利用者が問題の画面の「解説を聞く」から解説を頼んだときは、解説はチャットに書かず、showMenu（kind=next）の body に入れて呼び、返事を待つ（「1：次の問題へ」をチャットに書かない。チャットに書いてから呼ぶと、ボタンが解説の上に出てしまう）。利用者が「次の問題へ」と答えたときに、このツールを呼ぶ。【画面から送られる短い文】利用者が「○○を解説から始めます。」と送ってきたら、その分野の解説をチャットに書き（この場合だけ showMenu は呼ばない）、同じ返事の最後に、必ず確認問題（AIが作った問題）を1問出して番号で答えを待つ。解説だけで終わって showMenu（kind=next）や「次の問題へ」の案内に進んではいけない（確認問題を飛ばすと、実践問題の前の確認が抜ける）。「○○を確認問題から始めます。」と送ってきたら、確認問題から出す。「○○を実践問題から始めます。」「次の問題へ」と送ってきたら、このツールを呼んで過去問を出す（画面が新しい枠でチャットの一番下に出る。AIはその前後に長い文を書かない）。「今日はここまで。学習を終了します。」と送ってきたら、すぐ endStudy を呼ぶ（studyId は startStudy の結果の値、sessionId は今の学習の sessionId）。終了ログと引継ぎデータは画面に出るので、チャットに書き直さない。確認問題の答えを受けたら、答え合わせと解説は、チャットには書かず showMenu（kind=next）の body に入れて呼ぶ。解説だけで終わるときも同じ（解説の本文と続きのボタンが、同じ枠にまとまって出る。画面の上のほうには、押すボタンがない）。',
  startSession: '【利用コード】エンジンが ACCESS_CODE_REQUIRED を返したら、「noteの記事に書かれた利用コードを入力してください」とだけ伝えて入力を待ち、入力されたコードをそのまま accessCode に入れて、もう一度呼ぶ。コードを推測・補完・提案しない。DAILY_LIMIT なら hint をそのまま伝えて終える。【学習の始め方：この順で進め、飛ばさない。資格名が入力されていたら、まずこのツールを呼ぶ】①このツールを呼んだら、過去問の取り込みは裏で進む（取り込みの進み具合は nextQuestion の notice で見る。「セッション」という言葉は利用者に言わない）。②試験概要はエンジンが画面に出すので、AIは概要を書かず、学習の案内と過去問の取得状況だけ短く伝える。③このツールの結果として、エンジンが画面に試験概要を出し、その直下に免除（制度がある資格だけ）と学習状況のボタンを出す（nextQuestion は呼ばない）。AIは showMenu（kind=exempt / status）を呼ばず、ChatGPT標準の質問・選択肢の画面も使わず、押されるまで待つ。④答え（「免除：…/学習状況：…」）がチャットに届いてから学習計画（始める分野と理由、進め方）を示し、最後に showMenu（kind=plan）を呼んで返事を待つ（「1：始めます」をチャットに書かない）。利用者が計画を見る前に、勝手に学習計画を立てたり、問題を出したりしない。⑤利用者が「学習計画の希望：…」と送ってきたら、その希望と、試験概要・出題数・学習状況を踏まえて学習計画を柔軟に立て直し、始める分野・進め方・復習の間隔を示す（復習の間隔は希望に合わせ、無ければAI調整型）。承認は文章で聞かず、必ず showMenu（kind=plan）を呼び、承認のボタンが押されたら startStudy を呼ぶ。',
  startStudy: '利用者が「1」または「始めます」と答えたときにだけ呼ぶ。呼んだら display をそのまま表示し、続けて showMenu（kind=item）を呼んで進め方を選んでもらう（選択肢をチャットに書かない）。',
};

function widgetResource(baseUrl, uri = WIDGET_URI) {
  const origin = (() => { try { return new URL(baseUrl).origin; } catch { return null; } })();
  const csp = { connectDomains: [], resourceDomains: origin ? [origin] : [] };
  return {
    uri,
    mimeType: WIDGET_MIME,
    text: widgetHtml(),
    _meta: {
      ui: { prefersBorder: true, ...(origin ? { domain: origin } : {}), csp },
      'openai/widgetPrefersBorder': true,
      ...(origin ? { 'openai/widgetDomain': origin } : {}),
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
        tools: TOOLS.filter((t) => widget || !t.appOnly).map(({ name, description, inputSchema, uiOnly, meta }) => ({ name, description: widget && name === 'startSession' ? `【この学習アプリの仕様（必ず守る）】\n${appInstructions()}\n\n${APP_FLOW[name]}\n${APP_START_DESC}` : widget && APP_FLOW[name] ? `${APP_FLOW[name]}\n${description}` : description, inputSchema, ...(widget && WIDGET_TOOLS.has(name) ? { _meta: WIDGET_TOOL_META } : meta ? { _meta: meta } : uiOnly ? { _meta: { ui: { visibility: ['app'] }, 'openai/widgetAccessible': true, 'openai/visibility': 'private' }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } } : {}) })),
      });
    case 'resources/list':
      if (!widget) return fail(id, -32601, `Method not found: ${method}`);
      return ok(id, { resources: [{ uri: WIDGET_URI, name: '問題の画面', mimeType: WIDGET_MIME }, ...LEGACY_WIDGET_URIS.map((u) => ({ uri: u, name: '旧版互換の問題の画面', mimeType: WIDGET_MIME }))] });
    case 'resources/templates/list':
      if (!widget) return fail(id, -32601, `Method not found: ${method}`);
      return ok(id, { resourceTemplates: [] });
    case 'resources/read':
      if (!widget) return fail(id, -32601, `Method not found: ${method}`);
      if (params.uri !== WIDGET_URI && !LEGACY_WIDGET_URIS.includes(params.uri)) return fail(id, -32602, `Unknown resource: ${params.uri}`);
      return ok(id, { contents: [widgetResource(baseUrl, params.uri)] });
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
        if (!out) return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'ARGUMENT_INVALID', argument: tool.uiOnly ? 'stage/version' : 'kind' }) }] });
        if (tool.uiOnly) return ok(id, { content: [], structuredContent: out });
        return ok(id, { content: [{ type: 'text', text: JSON.stringify({ status: out.status, howToProceed: out.howToProceed }) }], structuredContent: { status: out.status, howToProceed: out.howToProceed }, _meta: { qlp: { ...out, at: Date.now() } } });
      }
      const [m, path, body] = tool.api(args);
      const res = await callApi(m, path, body);
      // アプリでは、資格名を受けたらすぐ試験概要と免除・学習状況のボタンを画面に出す（AIが次に nextQuestion を呼ぶのに頼らない）
      if (widget && tool.name === 'startSession' && res.status < 400 && res.body?.sessionId) {
        const nx = await callApi('POST', `/v1/sessions/${encodeURIComponent(res.body.sessionId)}/next`, undefined);
        if (nx.status < 400 && Array.isArray(nx.body?.onboarding)) {
          const merged = { ...nx.body, sessionId: res.body.sessionId, learnerId: res.body.learnerId ?? nx.body.learnerId, job: res.body.job };
          const view = forModel(merged);
          return ok(id, { content: [{ type: 'text', text: JSON.stringify(view) }], structuredContent: view, _meta: { qlp: { ...merged, at: Date.now() } } });
        }
      }
      if (widget && WIDGET_TOOLS.has(tool.name) && res.status < 400) {
        const view = forModel(res.body);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(view) }], structuredContent: view, _meta: { qlp: { ...res.body, at: Date.now() } } });
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
