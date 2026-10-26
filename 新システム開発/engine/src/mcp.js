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
    description: '利用者が「2026年度 問6を出して」など年度と問番号を明示した場合は、同じ資格のrequestedQuestion:{year:2026,questionNumber:6}を必ず指定し、通常の初期確認・学習計画を経由せず、検証済み公式問題の表示を開始する（新しい学習者の問題指定も可能）。既にこのチャットでsessionIdが分かるならnextQuestionのquestion指定でもよい。指定問が未登録なら他の問題を代わりに出さない。通常は資格の学習セッションを作る。自動取り込み可能な資格は取り込みを始め、利用者添付が必要な資格は試験概要・免除・学習状況・計画の順に画面を出す。土地家屋調査士2022～2025年度の公式問題・正答PDFは添付後に午前・午後を区別して検証する。qualificationId は q041＝宅建、q063＝測量士補、q097＝賃管（賃貸不動産経営管理士）、q002＝FP2級、q003＝FP3級、q006＝ITパスポート、q090＝行政書士。資格名をそのまま入れてもよい。エンジンの資格は sources を空の配列にしてよい（エンジンが公式サイトから集める）。',
    inputSchema: {
      type: 'object',
      required: ['qualificationId', 'sources'],
      properties: {
        qualificationId: { type: 'string', description: '利用者が学習する資格名だけを指定する。「@資格学習 宅建」なら「宅建」。「資格学習」はアプリ名で資格ではない。資格名が未指定ならこのツールを呼ばず確認する。' },
        learnerId: { type: 'string', description: '引継ぎデータから再開したときだけ、その引継ぎID' },
        accessCode: { type: 'string', description: '利用コードが必要と返されたときだけ、利用者が入力したコードをそのまま入れる' },
        sources: { type: 'array', maxItems: 40, items: source },
        requestedQuestion: { type: 'object', additionalProperties: false,
          description: '指定した公式過去問だけを開く場合に指定。試験概要と学習計画の確認は出さず、未登録なら別問題に進めない。',
          required: ['year', 'questionNumber'], properties: {
            year: { type: 'integer', minimum: 1990, maximum: 2100 },
            questionNumber: { type: 'integer', minimum: 1, maximum: 200 },
            section: { type: 'string', maxLength: 40, description: '同年度に区分が複数ある場合のみ、正式な区分名を指定する' },
          } },
        plan: { type: 'object', properties: { examDate: { type: 'string', description: 'YYYY-MM-DD' } } },
      },
    },
    api: (a) => ['POST', '/v1/sessions', { qualificationId: a.qualificationId, learnerId: a.learnerId, sources: a.sources, plan: a.plan, accessCode: a.accessCode, requestedQuestion: a.requestedQuestion }],
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
    description: '次の問題を受け取る。未回答の問題があれば同じ問題を返す。status は question / waiting / finished。利用者が問題や分野を指定したとき（「問13を出して」「応用測量に移りたい」など）は question にその言葉を入れる。【記述式AI参考解説の後のみ】もしshowDescriptiveActionsがモデル側で呼び出せない場合、既存のnextQuestion({sessionId:現在の実セッションID,question:「記述式解説後の操作メニュー:」+現在のquestionId})で現在問の操作画面を読取専用取得できる。解説が完了してからだけ実行する。この特殊なquestionは問題を進めない。解説完了前・別問IDでは無効。両ツールが使えない場合は解説末尾に番号選択肢を出し、未表示なのにボタンを出したと宣言しない。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId, question: { type: 'string', description: '利用者が指定した問題または分野（例：「2025年度 問13」「応用測量」）。再開のとき「新しい問題から」を選ばれたら「新しい問題」。指定が無ければ省く' } } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/next`, a.question ? { question: a.question } : undefined],
  },
  {
    name: 'openDescriptiveQuestion',
    description: '土地家屋調査士の記述式を公式原本から出題する。午前11、午後21（土地）・22（建物）、2022〜2025年度。採点せず、択一の正答率や学習計画を変更しない。',
    inputSchema: { type: 'object', required: ['sessionId', 'year', 'section', 'number'], properties: {
      sessionId, year: { type: 'integer' }, section: { type: 'string', enum: ['午前の部','午後の部'] },
      number: { type: 'integer', enum: [11,21,22] },
    } },
    api: a => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/descriptive`,
      { year: a.year, section: a.section, number: a.number }],
  },
  {
    name: 'verifyCurrentDescriptive',
    appOnly: true, uiOnly: true,
    description: '古い記述式問題の画面からの誤操作を防ぐため、今開いている同一問題IDと表示時刻を読取専用で照合する。本文・図・表は返さない。',
    inputSchema: { type: 'object', required: ['sessionId','questionId','shownAt'],
      additionalProperties: false, properties: {
        sessionId, questionId: { type: 'string' }, shownAt: { type: 'number' },
      } },
    api: a => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/descriptive/status?questionId=${encodeURIComponent(a.questionId)}&shownAt=${encodeURIComponent(a.shownAt)}`],
  },
  {
    name: 'revealDescriptiveAnswer',
    appOnly: true, uiOnly: true,
    description: '公式の記述式問題を開いた後に、採点せず参考解答を確認する操作を記録する。公式の模範解答は生成しない。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId,
      questionId: { type: 'string', description: '現在表示している記述式の問題ID（旧画面の誤操作防止）' } } },
    api: a => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/descriptive/reveal`,
      a.questionId ? { questionId: a.questionId } : {}],
  },
  {
    name: 'getDescriptiveContext',
    description: '記述式の参考解答を作成する場合だけ、現在の同一セッションに登録した公式問題文・年度・部・出典・ページ番号を読み取る。公式模範解答は未確認。自動採点しない。土地家屋調査士の土地（午前問11・午後問21）の座標計算と面積計算を要する小問は、原本で数値・方位・見取図・丸め規則を検証し、通常の座標法と関数電卓の複素数計算を両方解説する。面積も省略せずConjg/ConjとImagを使う。例：外周A→B→G→Eの面積=Abs(Imag(A*Conjg(B)+B*Conjg(G)+G*Conjg(E)+E*Conjg(A)))/2、対角線AGとBEの場合=Abs(Imag((A-G)*Conjg(B-E)))/2。点名を保存した変数を使い未丸め値から計算、最後に原本指定どおりに丸め、結果を照合する。Canon F-789SGとCASIO fx-JPシリーズを想定するが、機種別の固定キー順や非対応メモリー動作は発明しない。建物（午後問22）には不要な座標計算を追加しない。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: a => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/descriptive/context`],
  },
  {
    name: 'showDescriptiveActions',
    description: '【完成した全文のみ登録・省略不可】getDescriptiveContextで資料を確認し、通常と複素数による詳しい解説を内部で完成させたら、その全文をexplanationMarkdownに渡す。AI解説と「次の記述式へ／年度・問題を選び直す／択一式に戻る／学習終了」のボタンを同じ学習画面に連続表示する。解説本文を先にチャットへ出さない。sessionIdとquestionIdは直前のgetDescriptiveContextが返した現在の同一セッション・同一問題の値を使う。古い画面や過去の会話にあったIDを流用しない。409 DESCRIPTIVE_ACTIONS_STALEの場合、推測で再送せず現在のセッションのgetDescriptiveContextを再取得し、利用者が指定した年度・部・問と一致するか照合する。一致しなければopenDescriptiveQuestionで指定問題を開き直し、解答表示を行ってから登録する。採点しない。成功後はチャットに解説を重複出力しない。一部の計算法だけで登録するとサーバーが422で拒否する。全小問を『## 問1』『## 問2』のように見出し分けし、目的・根拠・通常解法・必要な計算・検算を解説した後、面積がある場合にConjg/Imagを使う電卓の別解を加える。未確認はその小問に明示し、全文を省略しない。422なら不足分を補って全文を再送し、ボタンのみの旧経路へ逃げない。ツールが使えない場合だけ本文解説と番号選択肢をチャットに表示し、ボタンを表示済みと決して言わない。',
    inputSchema: { type: 'object', required: ['sessionId', 'questionId', 'explanationMarkdown'],
      additionalProperties: false, properties: { sessionId, questionId: { type: 'string' },
        explanationMarkdown: { type: 'string', minLength: 160, maxLength: 40000,
          description: '原本と照合して完成したAI参考解説の全文。Markdownの見出し・リスト・表が使用できる。表示ボタンの直前に描画される。モデルからの呼び出しでは必ず指定する。' } } },
    api: a => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/descriptive/actions`,
      { questionId: a.questionId, explanationMarkdown: a.explanationMarkdown }],
  },
  {
    name: 'getDescriptiveActions',
    appOnly: true, uiOnly: true,
    description: '旧画面の復元専用。現在の記述式の解説・操作ボタンを読取専用で表示する。AIからの参考解説登録には使用しない。',
    inputSchema: { type: 'object', required: ['sessionId','questionId'],
      additionalProperties: false, properties: { sessionId, questionId: { type: 'string' } } },
    api: a => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/descriptive/actions?questionId=${encodeURIComponent(a.questionId)}`],
  },
  {
    name: 'saveStudyPlan',
    appOnly: true,
    uiOnly: true,
    description: '学習者が変更内容を再確認し、学習開始を明示承認した場合のみ、計画の分野順・方法・復習間隔を保存する。',
    inputSchema: { type: 'object', required: ['sessionId', 'orderedFields', 'methodChoice', 'reviewPreset'],
      properties: {
        sessionId,
        orderedFields: { type: 'array', items: { type: 'string' } },
        methodChoice: { type: 'string', enum: ['explain','check','practice','balanced'] },
        reviewPreset: { type: 'string', enum: ['focus','standard','slow','ai','custom'] },
        reviewIntervalsMinutes: { type: 'array', items: { type: 'integer', minimum: 1 } },
        methodDistribution: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 100 } },
        otherNote: { type: 'string', maxLength: 300 },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/plan`,
      { orderedFields: a.orderedFields, methodChoice: a.methodChoice,
        reviewPreset: a.reviewPreset, reviewIntervalsMinutes: a.reviewIntervalsMinutes, methodDistribution: a.methodDistribution, otherNote: a.otherNote }],
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
    name: 'restoreStudyView',
    appOnly: true,
    uiOnly: true,
    description: '画面復帰時に保存済みの現在の学習状態を表示し直す（読取専用）。出題・採点・学習記録に触れない。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: (a) => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/restore`],
  },
  {
    name: 'getStudySnapshot',
    appOnly: true,
    uiOnly: true,
    description: '既存の学習枠の内部更新専用。現在の保存済み表示を読取専用で取得する。新しい学習枠を生成しない。モデルからの明示的な引継ぎ復元はrestoreStudyViewを使う。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: (a) => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/restore`],
  },
  {
    name: 'registerConfirmationQuestion',
    appOnly: true,
    description: '解説あり／確認問題からを選んだ通常の同一分野3問に使う。AIが作った各問の本文・全選択肢・正答・簡易解説explanationを出題前に登録する。旧版の互換性のためexplanationはAPI上は省略可能だが、新規問題では必ず付ける。エンジンが1/3から問数と進捗バーを表示し、採点・3問完了時の実践問題への移動を画面で行う。チャットに問題や選択肢を直接書かない。3連続誤答による強制補強にはregisterRemediationQuestionを使う。',
    inputSchema: { type: 'object', required: ['sessionId', 'question', 'choices', 'correctAnswer'], properties: {
      sessionId, question: { type: 'string', minLength: 10, maxLength: 2000 },
      choices: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } },
      correctAnswer: { type: 'integer', description: '出題前に確定した正答の選択肢番号（1から）' },
       explanation: { type: 'string', minLength: 12, maxLength: 2500, description: '回答直後に表示する簡易解説。正答の根拠と紛らわしい選択肢の違いを2〜5文で説明し、出題前に正答と整合を確認する。' },
    } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/confirmation/register`,
      { question: a.question, choices: a.choices, correctAnswer: a.correctAnswer, explanation: a.explanation }],
  },
  {
    name: 'answerConfirmationQuestion',
    appOnly: true, uiOnly: true,
    description: '通常のAI作成確認問題の画面で押された番号を、保存済みの正答と採点する。',
    inputSchema: { type: 'object', required: ['sessionId', 'challengeId', 'selected'], properties: {
      sessionId, challengeId: { type: 'string' }, selected: { type: 'string' },
    } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/confirmation/answer`,
      { challengeId: a.challengeId, selected: a.selected }],
  },
  {
    name: 'registerRemediationQuestion',
    appOnly: true,
    description: '【同じ分野で公式過去問3連続不正解の後だけ】AI作成の完全な確認問題を出題する前に、その本文・選択肢・正答番号をエンジンへ1回登録し、正答を固定する。AI作成と表示し、返ったremediation_questionの画面で回答してもらう。既に出題中ならその同じ問題が返る。出題の前に必ず呼び、確認問題本文をチャットに直接生成しない。',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'question', 'choices', 'correctAnswer'],
      properties: {
        sessionId,
        question: { type: 'string', minLength: 10, maxLength: 2000 },
        choices: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } },
        correctAnswer: { type: 'integer', description: '出題時に固定する正答の選択肢番号（1から）' },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/remediation/register`,
      { question: a.question, choices: a.choices, correctAnswer: a.correctAnswer }],
  },
  {
    name: 'completeRemediation',
    appOnly: true,
    uiOnly: true,
    description: '登録済みのAI作成確認問題への利用者回答をエンジンが採点する。正答番号を引数に含めず、保存済みの正答で検証する。正解時だけ公式実践問題の停止を解除する。',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'challengeId', 'selected'],
      properties: {
        sessionId,
        challengeId: { type: 'string' },
        selected: { type: 'string', description: '実際に利用者が選んだ番号' },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/remediation/complete`,
      { challengeId: a.challengeId, selected: a.selected }],
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
    name: 'getOfficialLibrary',
    appOnly: true,
    uiOnly: true,
    description: '学習画面で確認済み公式過去問の共有保存状況を読む。利用者ごとの学習記録は含めない。取り込み・ファイル検索・チャットへの依頼文送信を行わない。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: (a) => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/official-library`],
  },
  {
    name: 'confirmUploadRights',
    appOnly: true,
    uiOnly: true,
    description: '権利者の許諾が必要な資格だけ。ユーザーが学習画面で指定年度の保存・解析許諾を取得したとチェックした場合に限り記録する。PDFはこの操作では取得も保存もしない。',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'year', 'confirmed'],
      properties: {
        sessionId,
        year: { type: 'integer', description: 'ユーザーが許諾確認した年度' },
        confirmed: { type: 'boolean', const: true },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/upload-permission`, { year: a.year, confirmed: a.confirmed }],
  },
  {
    name: 'attachPdf',
    appOnly: true,
    description: '利用者が現在のチャットで実際に新規添付した公式の問題PDFと正答PDFだけをエンジンに渡し、同一年度・同一区分の検証済み問題だけ出題に加える。既に共通保存されている部は再添付しない。賃貸不動産経営管理士と行政書士は権利者の利用許諾を要し、サイトからの自動取得と共通保存は禁止。行政書士は問題PDFのみを受け付け、正答は同年度の公式HTMLを用いる。利用者本人が年度別の権利確認を済ませた場合のみ添付を受け付け、その本人に限って保存する。PDFが添付されていない段階で以前のチャットやファイル保管庫を検索して取り込んだと報告しない。内部確認の途中経過・ファイル検索・照合手順を会話へ出さない（正答同梱の資格は正答PDF省略可）。土地家屋調査士は2022～2025年度が原本検証済みで、午前・午後の区分をsectionに必ず指定し、正答PDFも必須。過去問がそろわないときや、利用者が手元の過去問を使いたいときに、利用者がPDFを添付したら呼ぶ。year は添付PDFの表紙にある実施年度（西暦。令和7年度なら2025）。PDFの中身をAIが書き写して問題を作らない（出題・採点はエンジンが行う）。返ってきた notice をそのまま伝え、次の問題は nextQuestion で受け取る。',
    meta: { 'openai/fileParams': ['questionPdf', 'answerPdf'] },
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'year', 'questionPdf'],
      properties: {
        sessionId,
        year: { type: 'integer', description: '添付PDFの実施年度（西暦）' },
        section: { type: 'string', maxLength: 50, description: '試験区分。例：午前の部、午後の部、main、年度共通。共通解析では必須。' },
        genericMcq: { type: 'boolean', description: 'true の場合は資格別解析器を使わず、公式問題画像・明記された正答番号による共通択一解析を試す。検証できない問は出題しない。' },
        questionPdf: { type: 'object', description: '添付された問題PDF', properties: { download_url: { type: 'string' }, file_id: { type: 'string' }, file_name: { type: 'string' }, mime_type: { type: 'string' } }, required: ['download_url', 'file_id'] },
        answerPdf: { type: 'object', description: '添付された正答PDF（問題PDFに正答が入っていれば省く）', properties: { download_url: { type: 'string' }, file_id: { type: 'string' }, file_name: { type: 'string' }, mime_type: { type: 'string' } }, required: ['download_url', 'file_id'] },
      },
    },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/attach`, { year: a.year, section: a.section, genericMcq: a.genericMcq, question: a.questionPdf, answer: a.answerPdf }],
  },
  {
    name: 'getHandoff',
    description: '次のチャットへ引き継ぐデータ（問題本文は含まない）を受け取る。',
    inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId } },
    api: (a) => ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/handoff`],
  },
  {
    name: 'importHandoff',
    description: '引継ぎIDまたは引継ぎデータを受けたら先に呼ぶ。成功したら返されたsessionIdでrestoreStudyViewを1回呼び、既存の学習画面に「学習を再開する」ボタンを表示する。初回の試験概要・免除・学習状況・学習計画をやり直さない。startSessionは呼ばない。',
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
    description: '【画面専用】解説とボタンを同じ学習枠に表示する。新規学習時の免除・学習状況・学習計画・進め方の選択はstartSessionが返す学習枠が直接処理するため、showMenu(kind=exempt/status/plan/item)を呼んではならない。ChatGPT標準のラジオ・選択フォーム・独自の学習計画ボタンも作らない。旧版の互換性のためexempt/status/plan/itemは残してあるが新規開始には使わない。showMenuは主にkind=lesson（分野の基礎解説）、review（採点後の短い理由）、next（詳しい解説後の操作）、resume（旧画面の再開）で使用する。呼んだら、画面のボタンが押されるまで返事を待つ（選択肢をチャットに書かない）。【解説・答え合わせの文章は body に入れる】チャットに書いてからこのツールを呼ぶと、ChatGPTの画面ではボタンが文章の上に出てしまい、利用者が見つけられない。解説・答え合わせ・理由の文章（Markdown。表・箇条書き可）は、チャットには書かず、このツールの body に入れる。body にはMarkdownの文章・表だけを渡す。生のSVG・HTML・XMLタグやコードで作った図を絶対に入れない（学習画面ではタグが文字で表示される）。body は、ボタンと同じ枠のボタンの上に表示される。body を入れたら、チャットには何も書かない。学習中のメニュー（next/review/check/lesson）には startStudy で返された studyId と learnerId、および startSession の sessionId を引数に含め、終了ボタンが直接エンジンから引継ぎデータを取得できるようにする。',
    inputSchema: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['exempt', 'status', 'plan', 'item', 'resume', 'next', 'review', 'check', 'lesson'] }, body: { type: 'string', maxLength: 16000, description: 'ボタンの上に出す解説・答え合わせの全文（Markdown）。kind=lessonでは必須。' }, fieldName: { type: 'string', maxLength: 120, description: 'kind=lessonで必須。利用者が選んだ正確な学習分野名（確認問題を同じ分野に登録するため）' }, explanationRef: { type:'string', description:'公式過去問の解説は照合番号E-...を指定。本文と操作ボタンの同時表示・保存に使う。' }, sessionId: { type: 'string', description: '学習中のセッションID。終了操作のため必ず渡す' }, studyId: { type: 'string', description: 'startStudyで受け取った学習ID。終了操作のため必ず渡す' }, learnerId: { type: 'string', description: 'startStudyで受け取った引継ぎID' } } },
    local: (a) => {
      const menu = APP_MENUS[a.kind];
      const NEXT = { exempt: ' 初期設定はエンジンの同じ画面で進みます。AIは次の質問を作りません。', status: ' 学習計画もエンジンの画面内に表示します。AIは新たな計画やラジオ式の質問を作りません。', plan: ' 学習開始はエンジンの学習計画画面のボタンから行います。' };
      // 旧指示でAIが生のSVGを返しても、図形コードを利用者の画面に表示しない。
      const body = typeof a.body === 'string' && a.body.trim()
        ? a.body.replace(/<svg\b[\s\S]*?(?:<\/svg\s*>|$)/gi, '\n※図解はこの画面では表示できません。説明と表を参照してください。\n').slice(0, 16000)
        : null;
      if (a.kind === 'lesson' && (!body || typeof a.fieldName !== 'string' || !a.fieldName.trim())) return null;
      const readyMenu = menu && a.kind === 'next' && body
        ? { ...menu, choices: ['次の問題へ', '今日はここまで（学習を終了）'], actions: ['next', 'end'] }
        : menu;
      return readyMenu ? { status: 'menu', menu: { ...readyMenu, ...(body ? { body } : {}), ...(a.fieldName ? { fieldName: a.fieldName } : {}), ...(a.sessionId ? { sessionId: a.sessionId } : {}), ...(a.studyId ? { studyId: a.studyId } : {}), ...(a.learnerId ? { learnerId: a.learnerId } : {}) }, howToProceed: `選択肢は画面のボタンに出ている。チャットには書かず、ボタンが押されるまで返事を待つ。${NEXT[a.kind] ?? ''}` } : null;
    },
  },
  {
    name: 'explainSpec',
    // ChatGPT /app接続ではモデルとアプリの両方に公開。通常MCPのAPI定義は変更しない。
    appOnly: true,
    uiOnly: false,
    meta: { ui: { visibility: ['model', 'app'] } },
    description: '【公式過去問の照合用・読取専用】E-照合番号付きの解説依頼では、既に利用可能なnextQuestion({sessionId:E-照合番号})の読取専用経路をまず使用する。初回失敗・ツール利用不可なら、利用者へ再操作を求める前にexplainSpec({explanationRef:E-照合番号})で同じ保存済み公式問題と正答を自動再照合する。どちらも出題・採点は変更しない。戻り値のquestion・全choices・grade.correctAnswer・explainHow・学習状況から各選択肢の判断根拠・必要な計算を理解度に応じて詳しく解説する。公式正答・正誤・選択肢原文の一覧は採点ボタンで既に表示済みなので、AI本文には再掲せず、理由・計算過程・学習のコツのみを含める。**解説本文・生JSON・MCP app contextをチャットに表示せず**、完成したMarkdown全文をshowMenu({kind=next,body:解説全文,explanationRef:照合番号,sessionId:このツールで取得した値,studyId:取得した値,learnerId:取得した値})に渡す。解説と『次の問題へ／終了』ボタンを同じ学習画面に縦に表示し、画面の復元でも保持する。showMenu成功後は文章を繰り返さない。再採点や次問への自動遷移は禁止。参照番号がない旧会話では確実に分かるsessionIdで取得する。値を推測してはいけない。初回失敗時は別の読取専用経路でも同じE-照合番号を照合する。両方で失敗した場合だけ未検証の解説をせず元の学習画面から再試行するよう案内する。図表の画像が読み取れない場合は読めない部分を推測しない。',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        explanationRef: { type: 'string', description: '画面に表示された照合番号をそのまま渡す' },
        sessionId: { type: 'string', description: '旧会話で正確に分かる場合だけ利用する' },
        questionId: { type: 'string', description: '旧会話で正確に分かる場合だけ利用する' },
      },
    },
    api: (a) => {
      // ChatGPT側が旧版ツール定義を保持していても、参照番号を既存sessionId欄へ渡して復旧可能。
      const ref = a.explanationRef || (/^E-[A-Za-z0-9_-]{16}$/.test(String(a.sessionId || '')) ? a.sessionId : null);
      return ref ? ['GET', `/v1/explanation-ref/${encodeURIComponent(ref)}`]
        : ['GET', `/v1/sessions/${encodeURIComponent(a.sessionId)}/explanation${a.questionId ? `?questionId=${encodeURIComponent(a.questionId)}` : ''}`];
    },

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
    description: '初期診断。previewは出題せず問題数表示、startは明示承認後の開始、answerは採点、resultは集計表示、applyは結果で計画を組み直す。画面だけが呼ぶ。',
    inputSchema: { type: 'object', required: ['sessionId', 'action'], properties: { sessionId, action: { type: 'string', enum: ['preview', 'start', 'answer', 'result', 'apply'] }, value: { type: 'string' }, questionId: { type: 'string' }, confidence: { type: 'string', enum: ['sure', 'unsure', 'guess'] } } },
    api: (a) => ['POST', `/v1/sessions/${encodeURIComponent(a.sessionId)}/diag`, { action: a.action, questionId: a.questionId, value: a.value, confidence: a.confidence }],
  },
];

const REVIEW_ORDER = '【順番】①なぜその答えになるのかの簡単な理由を2〜3文でまとめる（正解でも不正解でも。図は新しく出さない・探さない）。②その文章はチャットに書かず、showMenu（kind=review）の body に入れて呼ぶ。チャットには何も書かず、ボタンが押されるまで待つ（選択肢をチャットに書かない）。③「詳しい解説」が押されたら、法的根拠（条文・判例など）を示した詳しい解説を、explainHow の書き方でまとめ、チャットには書かず showMenu（kind=next）の body に入れて呼ぶ。④「次の問題へ」が押されたら nextQuestion を呼ぶ。';

const APP_MENUS = {
  exempt: { kind: 'exempt', prompt: FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.prompt, choices: [...FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.choices] },
  status: { kind: 'status', prompt: '現在の学習状況を選んでください。', choices: ['未着手', '基礎学習中', '応用学習中', '過去問演習中'] },
  plan: { kind: 'plan', prompt: '学習計画をこのまま始めますか？', choices: ['この学習計画で始める', '学習計画を見直す'] },
  item: { kind: 'item', prompt: 'この項目はどう進めますか？', choices: ['解説あり（解説→確認問題→実践問題）', '確認問題から（解説なし）', '実践問題から（解説も確認問題もなし）'], notice: '以後も同じにするときは「2 以後も」のように入力してください。' },
  resume: { kind: 'resume', prompt: '続きから始めますか？', choices: ['始めます'] },
  review: { kind: 'review', prompt: 'この問題はどうしますか？', choices: ['詳しい解説（法的根拠つき）', '次の問題へ'] },
  check: { kind: 'check', prompt: '同じ分野で3問続けて間違えました。弱点を確かめる確認問題を出しますか？', choices: ['確認問題で基本を確かめる', '次の問題へ'] },
  lesson: { kind: 'lesson', prompt: '解説の次は、この分野の確認問題（全3問）へ進みます。', choices: ['確認問題へ進む', '今日はここまで（学習を終了）'], actions: ['check', 'end'] },
  next: { kind: 'next', prompt: '次はどうしますか？', choices: ['次の問題へ', '解説を見る', '今日はここまで（学習を終了）'], actions: ['next', 'explain', 'end'] },
};

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** ChatGPT アプリ（/app/<トークン>）で、問題をエンジンの画面に出すツール */
const LEGACY_WIDGET_URIS = ['ui://qlp/question-v1.html', 'ui://qlp/question-v2.html', 'ui://qlp/question-v3.html', 'ui://qlp/question-v4.html', 'ui://qlp/question-v5.html', 'ui://qlp/question-v6.html', 'ui://qlp/question-v7.html', 'ui://qlp/question-v8.html', 'ui://qlp/question-v9.html', 'ui://qlp/question-v10.html', 'ui://qlp/question-v11.html', 'ui://qlp/question-v12.html', 'ui://qlp/question-v13.html', 'ui://qlp/question-v14.html', 'ui://qlp/question-v15.html', 'ui://qlp/question-v16.html', 'ui://qlp/question-v17.html', 'ui://qlp/question-v18.html', 'ui://qlp/question-v19.html', 'ui://qlp/question-v20.html', 'ui://qlp/question-v21.html', 'ui://qlp/question-v22.html', 'ui://qlp/question-v23.html', 'ui://qlp/question-v24.html', 'ui://qlp/question-v25.html', 'ui://qlp/question-v26.html', 'ui://qlp/question-v27.html', 'ui://qlp/question-v28.html', 'ui://qlp/question-v29.html', 'ui://qlp/question-v30.html', 'ui://qlp/question-v31.html', 'ui://qlp/question-v32.html', 'ui://qlp/question-v33.html', 'ui://qlp/question-v34.html', 'ui://qlp/question-v35.html', 'ui://qlp/question-v36.html', 'ui://qlp/question-v37.html', 'ui://qlp/question-v38.html', 'ui://qlp/question-v39.html', 'ui://qlp/question-v40.html', 'ui://qlp/question-v41.html', 'ui://qlp/question-v42.html'];
LEGACY_WIDGET_URIS.push('ui://qlp/question-v43.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v44.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v45.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v46.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v47.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v48.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v49.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v50.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v51.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v52.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v53.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v54.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v55.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v56.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v57.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v58.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v59.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v60.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v61.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v62.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v63.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v64.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v65.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v66.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v67.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v68.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v69.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v70.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v71.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v72.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v73.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v74.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v75.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v76.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v77.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v78.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v79.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v80.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v81.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v82.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v83.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v84.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v85.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v86.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v94.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v97.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v98.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v99.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v100.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v101.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v102.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v103.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v104.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v105.html');
LEGACY_WIDGET_URIS.push('ui://qlp/question-v106.html');
const LEGACY_WIDGET_URI = LEGACY_WIDGET_URIS[0];
const WIDGET_TOOLS = new Set(['showDescriptiveActions', 'getDescriptiveActions', 'openDescriptiveQuestion', 'revealDescriptiveAnswer', 'startSession', 'nextQuestion', 'submitAnswer', 'showMenu', 'endStudy', 'startStudy', 'registerRemediationQuestion', 'registerConfirmationQuestion', 'restoreStudyView', 'getOfficialLibrary']);
const WIDGET_HOW = '問題文・図・選択肢は、この下の問題の画面にエンジンが表示している。チャットに問題文・図・選択肢を書き直したり、別の図を探したり描いたりしない。画面のあとのチャットの文は1行まで（「画面の選択肢を押して答えてください」だけ）。長く書くと画面が上に押し出されて見えなくなる。利用者が番号をチャットに書いたら submitAnswer を呼ぶ。question の stem と choices は解説を頼まれたときのためのもの。';

/** AIに渡す結果からは、画面に出した図・表示文を外す（AIが問題を書き直さないように）。全文は _meta.qlp で画面だけに渡す。 */
export function forModel(body) {
  if (!body || typeof body !== 'object') return body;
  // 学習の終了：終了ログと引継ぎデータの全文は画面に出す（AIに要約・省略させない）
  if (typeof body.handoff === 'string' && typeof body.display === 'string') {
    const id = body.handoff.match(/引[継き]ぎ\s*ID\**\s*[：:]\s*\**\s*([A-Za-z0-9]+)/)?.[1];
    return { minutes: body.minutes, totalMinutes: body.totalMinutes, ...(id ? { handoffId: id } : {}), howToShow: '終了ログと引継ぎデータの全文は、この下の画面に表示している。チャットに書き直したり、要約したり、省いたりしない。「引継ぎデータは画面のコピーボタンでコピーできます。次のチャットで貼り付けるか、引継ぎIDを伝えてください」とだけ伝える。' };
  }
  // 強制補強はAIが出題前にエンジンに正答を固定する。問題文・選択肢の再掲はせず画面へ渡す。
  if (body.status === 'confirmation_question') {
    return { status: 'confirmation_question', sessionId: body.sessionId, position: body.position, total: body.total,
      howToProceed: 'AI作成確認問題は下の学習画面に表示済み。チャットに書き直さず画面の回答を待つ。画面が採点し、次の確認問題または同じ分野の実践問題への選択肢を表示する。' };
  }
  if (body.status === 'remediation_question') {
    return { status: 'remediation_question', sessionId: body.sessionId,
      challengeId: body.challengeId, repeated: !!body.repeated,
      howToProceed: 'AI作成確認問題はこの下の学習画面にすべて表示済み。チャットで問題文や選択肢を書き直さず、画面での解答を待つ。採点・再試行は画面とエンジンが行う。' };
  }
  if (body.status === 'menu' && body.menu?.body)
    return { status:'menu', sessionId:body.sessionId, howToProceed:body.menu.kind === 'lesson'
      ? '分野の基礎解説全文と「確認問題へ進む／学習終了」ボタンは同一の学習枠内に表示済み。チャットに解説を再掲せず、確認問題の第1問は利用者がボタンを押すまで作成・登録しない。'
      : 'AIの詳しい解説と次問・終了ボタンは元の学習枠へ更新するために保存済み。チャットに解説や内部JSONを重複表示せず、操作を待つ。' };
  if (body.status === 'descriptiveActions') {
    return { status: 'descriptiveActions', sessionId: body.sessionId,
      questionId: body.question?.questionId, gradingMode: 'none',
      howToProceed: body.explanationMarkdown
        ? 'AI参考解説の全文と操作ボタンを同じ学習画面に表示しました。解説をチャットに繰り返さず、ボタンの操作を待つ。次の問題へ移るとこの画面は置き換わる。'
        : '旧UI用の操作パネルのみを表示しました。解説がこの画面に無い場合、解説まで表示したとは言わない。' };
  }
  if (body.status === 'descriptiveQuestion' || body.status === 'descriptiveReveal') {
    return { status: body.status, sessionId: body.sessionId,
      year: body.question?.year, section: body.question?.section,
      number: body.question?.number, gradingMode: 'none',
      howToProceed: body.status === 'descriptiveReveal'
        ? '利用者が「解答・解説を表示」を押した。AIが参考解答を提示する場合、先にgetDescriptiveContextで当該原本問題を読み、公式模範解答と呼ばず、図表・数値を確認できない場合は推測で補わない。土地（午前問11・午後問21）の座標計算・面積計算が必要な小問では三角関数と複素数（通常の座標法も含み、方位・座標・頂点順序を原本照合）の両方を解説する。面積は省略せずConjgとImagを使い、A→B→G→EならAbs(Imag(A*Conjg(B)+B*Conjg(G)+G*Conjg(E)+E*Conjg(A)))/2、対角線AGとBEならAbs(Imag((A-G)*Conjg(B-E)))/2で計算する。複素数は関数電卓で再現できるようArg/Abs/Conjg/Real/Imag・r∠θ・a+bi・STO/RCL/M等から必要な機能名と実際の入力式・途中結果を示し、最後に計算を照合する。DEG設定と角度象限・丸めを明示し、機種ごとの固定キー操作は発明しない。建物（午後問22）には不要な座標計算を追加しない。問題文・表・図を再掲せず、AI参考解説の全文をMarkdownで内部作成し、チャット本文に先出しせずshowDescriptiveActions({sessionId,questionId,explanationMarkdown:解説全文})を呼ぶ。これにより解説と操作ボタンが同一画面内で縦に連続表示され、次の問題を開くとボタンも消える。成功後は解説をチャットに二重表示しない。土地の全年度の午前11・午後21では、問1から最後の小問まで各設問を省略せず、目的→原本数値・条件→根拠→通常解法（座標法・三角関数など）→該当する場合だけ複素数・関数電卓による別解→検算・丸めの順に解説する。複素数だけの解説は禁止。見出しは『## 問1』など、数式は本文から独立した行、座標はMarkdown表、途中計算は適度に改行し、長文一段落にしない。『公式模範解答ではない』の注意は冒頭1回のみ。回答できない小問は推測せず未確認と明記する。公式模範解答と称さず採点しない。ツールが呼べない・失敗した場合は解説本文と番号選択肢をチャットの最後に表示するが、押せるボタンを出したとは言わない。'
        : '公式原本の記述式問題は学習画面に表示済み。択一式の番号回答や採点は行わず、解答・解説を表示ボタンの押下を待つ。',
    };
  }
  if (body.status === 'sourceUnavailable') {
    return { status: 'sourceUnavailable', sessionId: body.sessionId,
      howToProceed: '公式過去問の利用状況と、必要な場合のPDF登録・AI確認問題ボタンは学習枠内に表示済み。保存方式や内部件数・共有方式は利用者に見せない。添付された実際のPDFが届くまで勝手に取り込みを進めない。' };
  }
  if (body.status === 'officialLibrary') {
    return { status: 'officialLibrary', sessionId: body.sessionId,
      howToProceed: '利用可能な年度と試験区分は学習画面に表示済み。内部の保存方式は説明せず、操作ボタンの選択を待つ。' };
  }
  // 学習の始め：免除・学習状況は問題の画面のボタンで聞いている（AIは聞かない）
  if (body.status === 'resumeReady') {
    return {
      status: 'resumeReady', sessionId: body.sessionId, learnerId: body.learnerId,
      qualificationId: body.qualificationId, qualificationName: body.qualificationName, answeredCount: body.answeredCount,
      wrongCount: body.wrongCount, pendingQuestion: body.pendingQuestion,
      howToProceed: '引継ぎ済みの記録と、再開用の操作ボタンを画面に表示しました。初回の試験概要や学習条件は聞かず、利用者の操作を待ってください。',
    };
  }
  if (Array.isArray(body.onboarding)) {
    // iOSアプリが _meta をウィジェットへ転送しない場合でも、必須の初期質問を表示できる。
    // 公式概要と質問項目は秘匿情報ではない。AIはツールの案内に従い自分で質問を作らない。
    const { planMenu, howToProceed, screen, ...rest } = body; // eslint-disable-line no-unused-vars
    return { ...rest, howToProceed: '免除（ある資格だけ）と学習状況は、この下の画面のボタンでエンジンが聞いている。AIは聞かず、画面のあとのチャットの文は「画面のボタンで選んでください」の1行だけにする（長く書くと画面が上に押し出されて見えなくなる）。利用者が画面の番号ボタンを押すまで待つ。ラジオ式のChatGPT標準フォームや文章の選択肢を作らない。そのあとの学習計画・初期診断・学習の開始・進め方の選択も同じエンジン学習枠だけで進む（AIは計画を書かず、showMenu も nextQuestion も呼ばない）。画面から解説などを頼まれたら、そのとき答える。' };
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
  const noInvent = '\n**強制補強：同一分野の公式実践3問連続誤答後は、短い補強説明のあとAI作成確認問題を1問作る。必ず登録前に本文・全選択肢・正答番号を固定し、registerRemediationQuestion を呼ぶ。返った画面が出題するので、AIは問題をチャットへ書き直さない。採点・誤答時の再出題・正解時の公式問題再開は画面とエンジンが制御する。未登録の確認問題で実践問題へ進まない。**\n**仕様に書かれていない選択肢（資格の一覧、独自の「1〜4」の選択肢など）を作らない。** 初回の試験概要→免除・学習状況→学習計画→学習開始→項目の進め方は、startSessionが返すエンジン学習枠内でだけ番号ボタンを表示して直接制御する。ChatGPT側で学習状況のラジオ式フォームや独自の学習計画の承認ボタンを作成してはいけない。showMenu(kind=status/plan/item/exempt)も呼ばない。解説・詳しい説明などAI本文と操作を同枠に入れる必要がある場面だけshowMenu(kind=lesson/next/review)を使う。**前の会話で聞いた免除・学習状況を覚えていても、「前回と同じ条件で進めますか」などと聞いたり、答えを決めたりしない。免除・学習状況は、startSession のあとに nextQuestion を呼べば、エンジンが試験概要の直下にボタンで聞く（AIは聞かない）。ChatGPT標準の質問・選択肢の画面は使わない。**\n**質問の範囲：利用者の質問は、選んだ資格の試験範囲の学習に関することだけ受け付ける。** 試験に関係のない話（このアプリ・システムの開発や運用、他の資格、雑談など）には「学習に関係のないご質問にはお答えできません。試験の学習に関することをご質問ください。」とだけ答え、続きは出題・学習に戻す。言葉の意味があいまいなとき（例：「開発許可」）は、必ず選んだ資格の試験科目での意味（宅建なら都市計画法の開発許可）として答え、聞き返さない。\n**利用者が過去問のPDF（公式の問題PDF・正答PDF）を添付したら、`attachPdf` を呼んでエンジンに渡す。** PDFの中身をAIが書き写して出題・採点しない。';
  // U01：資格名の質問はマスタープロンプトの文言（GPTの指示文は運営者が貼り直すまで変えない）
  const confirmationFlow = '\n【通常の確認問題】「確認問題から」の場合は直ちに第1問を登録。「解説あり」の場合は解説をshowMenu(kind=lesson)へ表示し、利用者が「確認問題へ進む」を押した後にだけ第1問を登録する。同じ分野のAI作成問題を必ず1問ずつ、正答の理由と誤答との違いを説明する簡易解説explanationを付けてregisterConfirmationQuestionに登録する。採点直後は正誤・正答・保存済み簡易解説を同時表示する。画面が第1問から全体の学習位置と確認問題1/3を別々のプログレスバーで表示し、正答を保存して採点する。答えをAIが採点したり、問題を会話に直接書いたりしない。第3問の後は画面で同じ分野の実践問題を選べる。学習結果の選択肢をAIが独自に作らない。解説の開始時には分野の学習画面に全体の進捗を表示する。\n';
  const lessonFlow = '\n【基礎解説は必ず学習枠内｜解説生成後の唯一の完了条件：showMenu登録の成功】利用者が「○○を解説から始めます。」と送ったら、学習段階に合うその分野の基礎解説全文を内部でまとめ、必ずshowMenu({kind:lesson,fieldName:○○,body:解説全文,sessionId:現在のID,studyId,learnerId})で学習画面に表示する。ChatGPTのチャット本文には解説を一切書かない。確認問題はここでは作らず、「確認問題へ進む」ボタンが押されて「○○の確認問題・第1問へ進む」が届いたときだけregisterConfirmationQuestionを呼び、全3問の第1問を出す。元の学習枠を優先し、通信が切れた場合もその枠の再取得・再依頼ボタンを維持する。解説を登録できない状態で解説が表示されたと宣言しない。生成した文章をユーザーに直接回答して完了扱いにしない。解説を生成した直後の次の動作は必ずshowMenu(kind=lesson,body=全文,fieldName=選択分野,sessionId=現在のセッション)の呼出しとし、ツールの戻り値がstatus=menuかつmenu.kind=lessonであることを確認する。登録エラー時はエラーに応じて同じ解説を最大1回だけ再登録し、失敗した場合は『解説を学習枠に登録できませんでした。学習枠の再依頼を押してください。』と正直に伝える。成功前に確認問題・次問・学習終了へ勝手に進めない。基礎解説の後にkind=nextを呼ばない。解説を先にチャットへ出してしまう経路は使用しない。\n';
  const explanationFlow = '\n【採点後のAI解説：必ず参照照合】画面から「照合番号：E-...」を含む解説依頼が届いたら、モデルに既に公開されているnextQuestion({sessionId: 照合番号})で採点済み問題の解説資料を読み取る。この番号を渡すときに限り読取専用であり、通常の次問処理を実行しない。両経路とも同じ公式問題・正答と学習履歴を取得する。問題文・全選択肢・公式正答・理解度・苦手履歴を同一セッションから取得し、戻り値のquestion.questionId === grade.questionIdを確認する。正答番号・年度・問番号を推測しない。取得した根拠に基づき、法律問題では法的根拠、計算問題では式・代入・途中値・検算を学習状況に合わせてMarkdownにまとめる。採点時に表示済みの正誤・公式正答番号・選択肢原文一覧は繰り返さず、AIの詳しい解説部分だけをshowMenu(kind=next,body=全文,explanationRef=照合番号,sessionId=取得した値,studyId,learnerId)へ渡す。チャットに解説やJSONを貼らない。最初の取得が失敗した場合、利用者に再操作を求める前に必ず同じE-照合番号をexplainSpec({explanationRef:E-照合番号})で再照合する。両経路とも失敗なら直前会話や隠し文脈だけで解説せず、画面の「解説を再表示」を案内する。E-照合番号を渡す読取専用nextQuestionだけは解説資料の取得時に使用する。実セッションIDで次問へ進むnextQuestion・submitAnswer・startSessionは解説中に呼ばない。完成時にshowMenu(kind=next,body=全文,explanationRef=照合番号)を1回呼ぶ。次問・終了操作は元の学習画面のボタンが管理する。公式図表が必要で画像を確認できない場合は推測で内容を補わない。\n';
  const descriptiveFlow = '\n【土地家屋調査士の記述式参考解答】解答依頼を受けたらgetDescriptiveContextで現在の同一問題の原本資料を取得する。長い問題文・表・図は画面で閲覧済みなのでチャットへ再掲せず、解答と途中計算・根拠のみ表示する。土地（午前問11・午後問21）の座標計算・面積計算を必要とする小問では原本の図表・頂点順・丸めを確認し、通常の計算と複素数計算の両方で解く。面積だけ座標法で終わらず、ConjgとImagを用いてA→B→G→EならAbs(Imag(A*Conjg(B)+B*Conjg(G)+G*Conjg(E)+E*Conjg(A)))/2、対角線AGとBEならAbs(Imag((A-G)*Conjg(B-E)))/2の関数電卓入力式と計算過程・検算を必ず示す。点名の座標を変数に登録し未丸め値で計算後、指定どおりに面積を処理する。複素数では、関数電卓の機能名（Arg/Abs/Conjg/Real/Imag・極形式r∠θ・直交形式a+bi・STO/RCL/M等）を用いた入力式、途中値、結果と照合を示す。原本の点T1、T2、Aなどは各点の複素数座標を最初に電卓の変数へ登録し、以降はarg(T2-T1)、arg(A-T1)、Abs(A-T1)のように点名変数を使う。直接arg(-12.99-7.50i)のような差分数値だけの式を主形式にしない。電卓の変数名が点名と違う場合は対応表を示す。複素数全体を保存できない機種では実部と虚部を別々に保存する。機種別のキー順は不要。建物（午後問22）に座標計算を追加しない。図や表の読めない値を推測して正答と称さない.公式模範解答ではないと明示し、採点はしない。土地の全年度の午前11・午後21では、各小問の目的・根拠・途中計算・検算・丸めを丁寧に示し、複素数で解ける小問は関数電卓の入力式と通常解法をともに示す。AI参考解説全文をMarkdown形式で内部作成したら、解説をチャットに先出しせずshowDescriptiveActions({sessionId:原本のセッションID,questionId:原本の問題ID,explanationMarkdown:全文})を呼ぶ。学習画面が解説の直下にボタンを描画し、次の問題へ移る際は画面全体を置き換える。成功後は本文をチャットに繰り返さない。これが使えないときは、解説本文と『1：次の記述式へ／2：年度・問題を選び直す／3：択一式へ戻る／4：学習終了』を通常チャットで提示するが、ボタン表示成功とは言わない。\n';
  const sharingFlow = '\n【公式過去問の共有保存】共有キャッシュで確認できた実際の年度と資格ごとの試験区分（宅建は本試験、2020・2021年度は10月／12月等）だけを学習画面で表示する。資格と関係のない午前／午後などの区分を追加しない。対応年度であっても未保存なら保存済みと言わない。ほかの利用者が保存済みの部は、その共通データを再利用し、PDF再添付を求めない。未保存の部だけ案内する。以前の会話に添付されたPDFを、現在の学習画面のPDFとして自動取り込んだと推測しない。本人からこの会話へ実際に新しいPDFファイルが添付されたときだけ、表紙の年度・部と正答の同一性を照合しattachPdfを使う。PDF添付の選択ボタンだけではファイル検索・取り込み・会話メッセージの作成を始めない。利用者向け画面では共有・キャッシュ・URL台帳件数・未登録保存キーなどの内部情報を表示しない。年度と利用可能問題数、公式PDF登録の案内だけ出す。\n【内部処理の非表示】PDFの検索履歴・照合手順・取り込みツール名・保存キー・内部ログ・解析器の事情・AIへの命令文を利用者の会話に書かない。必要な利用者向け案内は学習画面内で簡潔に出す。添付がないときに以前のファイルを探したり、見つかったと報告して処理を続けたりしない。\n';
  const redisplayFlow = '\n【問題の初回表示失敗】利用者が「出てません」「問題が表示されない」「1回で出ない」と報告した場合は、同一セッションのrestoreStudyViewまたはnextQuestionで同じ問題を再表示する。問題IDを維持し、勝手に次問へ進めない。成功応答を確認するまでは表示成功と言わない。\n';
  const handoffFlow = '\n【引継ぎからの再開】引継ぎIDや引継ぎデータを受け取ったら、startSessionを呼ばずimportHandoffを呼ぶ。成功後に返されたsessionIdをそのままrestoreStudyView({sessionId})へ渡し、登録済みの表示画面に「学習を再開する」ボタンを出す。旧版の接続環境ではimportHandoffだけでは画面が出ないので、restoreStudyViewの呼出しを絶対に省略しない。免除・試験概要・学習状況・計画を聞き直さず、本人が再開ボタンを押すまで待つ。\n';
  return (INSTRUCTIONS.slice(0, a) + display + INSTRUCTIONS.slice(b) + noInvent + confirmationFlow + lessonFlow + explanationFlow + descriptiveFlow + sharingFlow + redisplayFlow + handoffFlow).replace('「学習したい資格名を入力してください。（例：宅建、測量士補）」', '「受験する資格名を教えてください。」');
}

// アプリでは、資格の一覧をツールの説明に書かない（ChatGPTが資格の選択肢を勝手に作ったため）。資格名は利用者が自由に入力する
const APP_START_DESC = '利用者から「2026年度 問6」のような指定があれば、資格名とrequestedQuestionを指定して公式問題を直接開く。指定問が未登録なら別の問を出さない。通常は資格の学習準備を始める。資格台帳には103資格を統合済み（「看護師」「愛玩動物看護師」「医師」「獣医師」なども登録済み）。ただし追加した公式URLの記録は出題・採点可能な問題原本ではなく、原本と公式正答が未検証ならPDF添付やAI作成確認問題を案内する。公式PDFは自動取得できる資格だけ裏で取り込む。qualificationId には、利用者が入力した資格名をそのまま入れる（例：「測量士補」「宅建」「看護師」）。sources は空の配列 [] にする（取得可能ならエンジンが公式サイトから集め、必要な資格は後から本人添付を案内する）。ユーザー入力が「@資格学習 看護師」の場合は qualificationId に必ず「看護師」のみを指定する。「資格学習」はアプリ名であり資格名ではない。資格名が読み取れないときは、このツールを呼ばず、「受験する資格名を教えてください。」とだけ聞く（資格の選択肢を自分で作らない）。';

const APP_FLOW = {
  importHandoff: '引継ぎデータやIDから再開するときはimportHandoffを使用し、戻り値のsessionIdでrestoreStudyViewを必ず1回呼ぶ。復元した画面の「学習を再開する」を待つ。初回の試験概要・免除・学習状況は出さず、startSessionも呼ばない。',
  nextQuestion: '【公式過去問の直接指定】既存sessionIdがあり、利用者が「2026年度 問6」のように問を指定したらquestionにそのまま指定内容を渡す。学習計画の途中でも明示指定だけは直接出題する。未登録・別区分なら別の問にすり替えない。sessionIdが不明ならstartSessionのrequestedQuestionを使用する。【記述式AI参考解説の後のみ】もしshowDescriptiveActionsがモデル側で呼び出せない場合、既存のnextQuestion({sessionId:現在の実セッションID,question:「記述式解説後の操作メニュー:」+現在のquestionId})で現在問の操作画面を読取専用取得できる。解説が完了してからだけ実行する。この特殊なquestionは問題を進めない。解説完了前・別問IDでは無効。両ツールが使えない場合は解説末尾に番号選択肢を出し、未表示なのにボタンを出したと宣言しない。【公式解説資料の安全な取得】学習画面から「照合番号：E-英数字16文字」が届いた場合、説明する前に、モデルから既に利用可能なnextQuestion({sessionId:照合番号})をまず呼ぶ。E-番号のときは読取専用で次問へ進まない。初回に失敗してもそこで諦めず、同じ番号をexplainSpec({explanationRef:照合番号})へ渡して自動再照合する。戻り値のstatusがexplanationContextでquestion.questionIdとgrade.questionIdが一致したら、各選択肢の根拠と計算をMarkdownの全文にまとめ、showMenu(kind=next,body=全文,explanationRef=照合番号,sessionId=取得した値,studyId,learnerId)で解説とその下のボタンを表示する。チャットへ直接解説を書かない。データが読めなければ推測しない。解説資料の再取得にexplainSpecがモデル側で利用可能なら、その読取専用ツールを使ってもよい。照合番号で資料を読むときは、実セッションIDの入力やユーザーへの問題文の再添付を要求しない。【通常の出題】【順番：通常のAI作成確認問題はregisterConfirmationQuestionへ登録して画面で採点する。3問終了後の「同じ分野の実践問題へ」は画面が直接処理する。公式問題は解説を見せる前に次の問題へ進めない】公式過去問の解説依頼にはE-照合番号で読取専用nextQuestion({sessionId:E-照合番号})を先に呼び、失敗したらexplainSpec({explanationRef:E-照合番号})を試し、サーバーの採点済み問題に基づいてMarkdown全文を作り、showMenu(kind=next,body=全文,explanationRef=照合番号)に送ってボタンと一緒に表示する。内部JSONや解説をチャットに書かない。非表示文脈だけで採点や解説をしない。次問・終了ボタンは画面で管理する。利用者が「次の問題へ」と答えたときに、このツールを呼ぶ。【画面から送られる短い文】利用者が「○○を解説から始めます。」と送ってきたら、その分野の学習段階に合った基礎解説全文をMarkdownで内部作成し、本文は一文字もチャットに書かず、必ず showMenu({kind:lesson,fieldName:その分野名,body:解説全文,sessionId:現在のセッションID,studyId,learnerId}) を呼ぶ。学習画面には解説と「確認問題へ進む／学習終了」を同じ枠の中に表示する。AIは次の確認問題を自動作成しない。利用者が画面の「確認問題へ進む」を押すと「○○の確認問題・第1問へ進む」が送られるので、そのときだけ registerConfirmationQuestion に本文・全選択肢・固定正答を登録し、3問中第1問の画面を出す。解説のチャット表示、解説のないボタン表示、解説と別枠の確認問題の自動連続生成を禁止する。「○○を確認問題から始めます。」または「○○の確認問題・第1問へ進む」と送ってきたら、解説を再表示せず、registerConfirmationQuestion で同分野の第1問を出す。以後は画面の「次の確認問題へ」が押されたときだけ同じ分野の第2問、第3問を同ツールへ登録する。問数・全体の位置はエンジンの画面が第1問から表示する。3問の採点後は画面に「同じ分野の実践問題へ」などの選択肢が出る。AIは独自の結果メニューやプログレスバーを作らず、次の分野へ自動で進めない。「○○を実践問題から始めます。」「次の問題へ」と送ってきたら、このツールを呼んで過去問を出す（画面が新しい枠でチャットの一番下に出る。AIはその前後に長い文を書かない）。「今日はここまで。学習を終了します。」と送ってきたら、すぐ endStudy を呼ぶ（studyId は startStudy の結果の値、sessionId は今の学習の sessionId）。終了ログと引継ぎデータは画面に出るので、チャットに書き直さない。通常の3問の確認問題は画面が採点するため、AIはshowMenu(kind=next)を呼ばない。公式過去問の詳しい解説は検証済みexplainSpecの全データに基づき作成し、showMenu({kind=next,body:解説全文,explanationRef:照合番号,sessionId:取得したID,studyId,learnerId})を呼んで解説本文の直下に次問・終了ボタンを新しく表示する。生JSONや内部指示、解説本文をチャットに表示しない。',
  startSession: '【指定問の直接出題が優先】利用者が「2026年度 問6を出して」のように過去問番号を指定した場合は、startSession({qualificationId:会話で既知の資格名,sources:[],requestedQuestion:{year:2026,questionNumber:6}})を直接呼んで問題を出す。引継ぎIDを伴う場合はlearnerIdも渡し、学習記録を維持する。セッションIDが不明でも「出題できません」と答えず、この呼び出しを行う。結果がquestionUnavailableなら指定した問の未登録・取得待ちだけを案内し、他の問題を推測して出さない。通常の初期学習だけは次の順序を守る。【引継ぎIDがある場合はimportHandoffを優先する。startSessionは初回用】初回学習の【利用コード】エンジンが ACCESS_CODE_REQUIRED を返したら、「noteの記事に書かれた利用コードを入力してください」とだけ伝えて入力を待ち、入力されたコードをそのまま accessCode に入れて、もう一度呼ぶ。コードを推測・補完・提案しない。DAILY_LIMIT なら hint をそのまま伝えて終える。【学習の始め方：この順で進め、飛ばさない。資格名が入力されていたら、まずこのツールを呼ぶ】①このツールは必ず試験概要と学習条件の画面を先に出す。公式サイトから自動取り込みできる資格だけ裏で取得する。PDFの利用者添付が必要な資格は、承認後の問題画面で添付方法を案内する。「セッション」など内部用語は利用者に見せない。②試験概要はエンジンが画面に出すので、AIは概要を書かず、学習の案内と過去問の取得状況だけ短く伝える。③このツールの結果として、エンジンが画面に試験概要を出し、その直下に免除（制度がある資格だけ）と学習状況のボタンを出す（nextQuestion は呼ばない）。AIは showMenu（kind=exempt / status）を呼ばず、ChatGPT標準の質問・選択肢の画面も使わず、押されるまで待つ。④学習状況を選んだらエンジンが保存し、同じ枠に学習計画と固定の4ボタン「この学習計画で始める／学習計画を見直す／初期診断で苦手分野を調べる／今は学習しない」を表示する。AIは別の学習計画を書かず、showMenu(kind=status/plan/item/exempt)を呼ばず、ChatGPT標準のラジオ選択や独自の承認メニューを作らない。⑤学習計画の見直し・承認・分野開始も枠内のエンジンが処理する。画面が切れた場合は同じセッションのrestoreStudyViewで復元し、過去の段階を繰り返さない。',
  startStudy: '通常は学習計画の「この学習計画で始める」ボタンがエンジンから呼び出す。新規学習の承認や分野の進め方は枠内で完結するため、AIはshowMenu(kind=item)や別の質問フォームを追加しない。明示された再開時でも既存の学習状態を尊重する。',
};

function widgetResource(baseUrl, uri = WIDGET_URI) {
  const origin = (() => { try { return new URL(baseUrl).origin; } catch { return null; } })();
  const csp = { connectDomains: origin ? [origin] : [], resourceDomains: origin ? [origin] : [] };
  return {
    uri,
    mimeType: WIDGET_MIME,
    text: widgetHtml(),
    _meta: {
      ui: { prefersBorder: true, ...(origin ? { domain: origin } : {}), csp },
      'openai/widgetPrefersBorder': true,
      ...(origin ? { 'openai/widgetDomain': origin } : {}),
      'openai/widgetCSP': { connect_domains: csp.connectDomains, resource_domains: csp.resourceDomains },
      'openai/widgetDescription': '過去問の問題文・公式PDFの図・選択肢を表示し、選択肢を押すと採点する画面。',
    },
  };
}
const WIDGET_TOOL_META = { ui: { resourceUri: WIDGET_URI }, 'openai/outputTemplate': WIDGET_URI, 'openai/widgetAccessible': true };
// showMenuはAIが作成した本文の受け渡し先。モデル非公開だと学習方法保存後に解説が永遠に届かない。
// 初回起動と明示的な引継ぎ復元だけが学習枠を生成する。
// 確認問題の登録・次問・採点・解説登録はデータ専用。テンプレートを付けると毎回新しい学習枠が生成される。
// 最初のstartSession枠が保存済み解説をrestoreStudyViewで受け取る。
const LESSON_PUBLISH_META = { ui: { visibility: ['model', 'app'] }, 'openai/widgetAccessible': true };
/**
 * 読取専用の公式解説参照は、KV反映直後やCloud Run初回接続の一時的失敗を
 * 利用者へ返す前に最大3回まで自動再照合する。
 * 同じ照合番号でのみGETし、出題・採点・セッション状態には触らない。
 */
async function readExplanationRef(callApi, ref) {
  const path = '/v1/explanation-ref/' + encodeURIComponent(ref);
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await callApi('GET', path);
      last = result;
      if (result?.status < 400) {
        if (attempt > 0) console.info(JSON.stringify({ event:'explanation_ref_recovered', attempts:attempt + 1 }));
        return result;
      }
      const code = result?.body?.error;
      const transient = [404, 408, 409, 425, 429, 500, 502, 503, 504].includes(result?.status) &&
        (result?.status !== 409 || code === 'NO_GRADED_EXPLANATION' || code === 'EXPLANATION_SOURCE_MISMATCH') &&
        (result?.status !== 404 || code === 'EXPLANATION_REF_EXPIRED' || code === 'EXPLANATION_QUESTION_NOT_FOUND');
      if (!transient) break;
    } catch (error) {
      last = { status:503, body:{ error:'EXPLANATION_LOOKUP_TEMPORARY' } };
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, attempt ? 240 : 90));
  }
  // 照合番号や個人情報はログに残さない。
  console.warn(JSON.stringify({event:'explanation_ref_read_failed',
    status:last?.status ?? 503, code:String(last?.body?.error ?? 'UNKNOWN').slice(0,80)}));
  return last ?? { status:503, body:{error:'EXPLANATION_LOOKUP_TEMPORARY'} };
}

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
        tools: TOOLS.filter((t) => widget || !t.appOnly).map(({ name, description, inputSchema, uiOnly, meta }) => ({ name, description: widget && name === 'startSession' ? `【この学習アプリの仕様（必ず守る）】\n${appInstructions()}\n\n${APP_FLOW[name]}\n${APP_START_DESC}` : widget && APP_FLOW[name] ? `${APP_FLOW[name]}\n${description}` : description, inputSchema, ...((widget && WIDGET_TOOLS.has(name) || name === 'showDescriptiveActions') ? { _meta: (name === 'startSession' || name === 'restoreStudyView') ? WIDGET_TOOL_META : LESSON_PUBLISH_META } : meta ? { _meta: meta } : uiOnly ? { _meta: { ui: { visibility: ['app'] }, 'openai/widgetAccessible': true, 'openai/visibility': 'private' }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } } : {}) })),
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
      // 既存のモデル公開ツールからも一時照合番号を利用できるようにする。
      // 新規ツールがChatGPTの登録済み一覧にまだ反映されない場合の読取専用経路。
      if (tool.name === 'nextQuestion' && /^E-[A-Za-z0-9_-]{16}$/.test(String(args.sessionId || ''))) {
        const result = await readExplanationRef(callApi, args.sessionId);
        if (result.status >= 400) return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify(result.body) }], structuredContent: result.body });
        const { question, grade } = result.body ?? {};
        if (!question?.questionId || question.questionId !== grade?.questionId) {
          const error = { error: 'EXPLANATION_BINDING_MISMATCH' };
          return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify(error) }], structuredContent: error });
        }
        return ok(id, { isError: false, content: [{ type: 'text', text: JSON.stringify(result.body) }], structuredContent: result.body });
      }
      if (tool.name === 'explainSpec' && !args.explanationRef && !args.sessionId) {
        return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'EXPLANATION_REFERENCE_REQUIRED' }) }], structuredContent: { error: 'EXPLANATION_REFERENCE_REQUIRED' } });
      }
      // 「解説あり」の基礎解説を保存してから表示。画面復帰時に確認問題が割り込まない。
      if (widget && tool.name === 'showMenu' && args.kind === 'lesson' && !args.sessionId) {
        const error = { error: 'LESSON_SESSION_REQUIRED' };
        return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify(error) }], structuredContent: error });
      }
      if (widget && tool.name === 'showMenu' && args.kind === 'lesson' && args.sessionId) {
        const prepared = tool.local(args);
        if (!prepared?.menu?.body) {
          const error = { error: 'LESSON_BODY_REQUIRED' };
          return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify(error) }], structuredContent: error });
        }
        const posted = await callApi('POST',
          '/v1/sessions/' + encodeURIComponent(args.sessionId) + '/lesson',
          { fieldName: args.fieldName, body: prepared.menu.body });
        // 個人情報・解説本文を出さず、画面登録の成否だけを残す。
        console.info(JSON.stringify({event:'lesson_publish_outcome',status:posted.status,
          code:posted.status>=400?String(posted.body?.error||'UNKNOWN').slice(0,80):'OK'}));
        if (posted.status >= 400) return ok(id, { isError: true,
          content: [{ type: 'text', text: JSON.stringify(posted.body) }], structuredContent: posted.body });
        const visible = forModel(posted.body);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(visible) }],
          structuredContent: visible, _meta: { qlp: { ...posted.body, at: Date.now() } } });
      }
      if (widget && tool.name === 'showMenu' && args.kind === 'next' && args.explanationRef) {
        const posted = await callApi('POST',
          `/v1/explanation-ref/${encodeURIComponent(args.explanationRef)}/publish`, { body:args.body });
        if (posted.status >= 400) return ok(id, {isError:true,content:[{type:'text',text:JSON.stringify(posted.body)}],structuredContent:posted.body});
        const visible = forModel(posted.body);
        return ok(id, { content:[{type:'text',text:JSON.stringify(visible)}], structuredContent:visible,
          _meta:{qlp:{...posted.body,at:Date.now()}} });
      }
      if (tool.local && !(tool.name === 'explainSpec' && (args.sessionId || args.explanationRef))) {
        let out = tool.local(args);
        if (tool.name === 'showMenu' && args.kind === 'next' && args.sessionId && out) {
          // 分野の切替はサーバーに保存された採点済みの問と先取りした次問だけから確定する。
          const context = await callApi('GET', `/v1/sessions/${encodeURIComponent(args.sessionId)}/explanation`);
          if (context.status < 400 && context.body?.nextChoice) {
            const change = context.body.nextChoice.fieldChange;
            const alreadyExplained = !!out.menu.body;
            const menu = { ...out.menu,
              choices: [change ? '次の分野の問題へ' : '次の問題へ',
                ...(!alreadyExplained ? ['解説を見る'] : []),
                ...(change ? ['この分野の実践問題を続ける', '総復習（間違えた問題）'] : []), '今日はここまで（学習を終了）'],
              actions: ['next', ...(!alreadyExplained ? ['explain'] : []),
                ...(change ? ['continueField', 'review'] : []), 'end'],
              ...(context.body.journey ? { journey: context.body.journey } : {}),
              ...(change && context.body.nextChoice.nextFieldName ? { nextFieldName: context.body.nextChoice.nextFieldName } : {}) };
            out = { ...out, menu };
          }
        }
        if (!out) return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'ARGUMENT_INVALID', argument: tool.uiOnly ? 'stage/version' : 'kind' }) }] });
        if (tool.uiOnly) return ok(id, { content: [], structuredContent: out });
        // 解説方針はAIが使用する。showMenuと同じUI専用メタデータに隠してはいけない。
        if (tool.name === 'explainSpec') return ok(id, { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out });
        return ok(id, { content: [{ type: 'text', text: JSON.stringify({ status: out.status, howToProceed: out.howToProceed }) }], structuredContent: { status: out.status, howToProceed: out.howToProceed }, _meta: { qlp: { ...out, at: Date.now() } } });
      }
      const [m, path, body] = tool.api(args);
      const res = m === 'GET' && /^\/v1\/explanation-ref\/E-[A-Za-z0-9_-]{16}$/.test(path)
        ? await readExplanationRef(callApi, decodeURIComponent(path.split('/').at(-1)))
        : await callApi(m, path, body);
      // 明示指定の公式問は初期画面を経由しない。出題成功・対象問未登録の双方を同じ問題画面へ返す。
      if (widget && tool.name === 'startSession' && args.requestedQuestion &&
          res.status < 400 && res.body?.sessionId) {
        const view = forModel(res.body);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(view) }],
          structuredContent: view, _meta: { qlp: { ...res.body, at: Date.now() } } });
      }
      // アプリでは、資格名を受けたらすぐ試験概要と免除・学習状況のボタンを画面に出す（AIが次に nextQuestion を呼ぶのに頼らない）
      if (widget && tool.name === 'startSession' && res.status < 400 && res.body?.sessionId && res.body.status !== 'resumeReady') {
        // 現行エンジンは最初の応答へ導入画面を含める。余分な nextQuestion を呼ばず1回で表示する。
        let merged = res.body;
        if (!Array.isArray(merged.onboarding) || !merged.onboarding.length) {
          // 旧サーバーとの互換。ただし取得失敗時は空の学習終了画面へ進めない。
          const nx = await callApi('POST', `/v1/sessions/${encodeURIComponent(res.body.sessionId)}/next`, undefined);
          if (nx.status >= 400 || !Array.isArray(nx.body?.onboarding) || !nx.body.onboarding.length) {
            return ok(id, { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'ONBOARDING_UNAVAILABLE' }) }],
              structuredContent: { status: 'toolError', error: 'ONBOARDING_UNAVAILABLE', sessionId: res.body.sessionId, learnerId: res.body.learnerId } });
          }
          merged = { ...nx.body, sessionId: res.body.sessionId, learnerId: res.body.learnerId ?? nx.body.learnerId, job: res.body.job };
        }
        const view = forModel(merged);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(view) }], structuredContent: view, _meta: { qlp: { ...merged, at: Date.now() } } });
      }
      if ((widget && WIDGET_TOOLS.has(tool.name) || tool.name === 'showDescriptiveActions') && res.status < 400) {
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
