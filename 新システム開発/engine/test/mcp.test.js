// MCP の入口：Claude・Perplexity・Gemini のカスタムコネクタから、同じ学習の流れを動かせるか
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CATALOG } from '../src/catalog.js';
import { MemoryStore, sha256Hex } from '../src/store.js';
import { writeResult } from '../src/cache.js';
import { officialLibrary } from '../src/official-library.js';
import { appKey, handle, onboardingSteps, overviewFor } from '../src/app.js';
import { INSTRUCTIONS } from '../src/instructions.js';
import { explainHow } from '../src/explain.js';
import { TOOLS, forModel, handleRpc, appInstructions } from '../src/mcp.js';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml, PREPARED_LESSONS } from '../src/widget.js';
import { PNG, SRC, T0, assetsB64, fakeParser, fakeResult, fakeWeb, pdf } from './helpers.js';

const TOKEN = 'mcp-token';

function makeEnv(parserOptions = {}) {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, parserOptions);
  const env = { STORE: new MemoryStore(), API_TOKEN: TOKEN, fetchPdf: web.fetchPdf, clock: () => T0, PARSER_URL: 'https://parser.example' };
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  return env;
}

let nextId = 1;
async function rpc(env, method, params, { path = '/mcp', token = TOKEN } = {}) {
  const res = await handle(new Request(`https://engine.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  }), env);
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}
const call = async (env, name, args) => (await rpc(env, 'tools/call', { name, arguments: args })).body.result;

test('initialize で接続版プロンプトを instructions として渡す（deploy/gpt-instructions.txt と同じ内容）', async () => {
  const env = makeEnv();
  const r = await rpc(env, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(r.body.result.protocolVersion, '2025-06-18');
  assert.ok(r.body.result.capabilities.tools);
  assert.equal(r.body.result.instructions, INSTRUCTIONS);
  assert.match(INSTRUCTIONS, /添付ファイルがあるターンで登録ツールを直ちに呼ぶ/);
  assert.match(INSTRUCTIONS, /「外部サービスへ送信してよいですか」.*別ターンに持ち越すのは禁止/);
  const gpt = new URL('../../deploy/gpt-instructions.txt', import.meta.url);
  if (existsSync(gpt)) assert.equal(INSTRUCTIONS, readFileSync(gpt, 'utf8'));
  // 通知には本文なしで 202
  const n = await handle(new Request('https://engine.example/mcp', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), env);
  assert.equal(n.status, 202);
});

test('ツールの名前は GPT 用 API 定義の operationId と同じ（同じプロンプトで動く）', async () => {
  const env = makeEnv();
  const r = await rpc(env, 'tools/list', {});
  const names = r.body.result.tools.map((t) => t.name);
  const yaml = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
  const ops = [...yaml.matchAll(/operationId: (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), [...ops, 'attachPdf', 'attachPdfBatch', 'getOfficialLibrary'].sort());
  for (const name of names) assert.ok(INSTRUCTIONS.includes(name), `プロンプトに ${name} が出てくる`);
  assert.equal(TOOLS.filter((t) => !t.appOnly).length, 15);
  assert.ok(names.includes('attachPdf'), '通常のチャットでもPDF登録ツールを公開する');
  assert.ok(names.includes('attachPdfBatch'), '複数年度のPDFを1回で送信するツールを公開する');
});

test('本人専用PDFライブラリ選択ツールは学習枠限定・追加枠なし', async () => {
  const env = makeEnv();
  const app = (await rpc(env,'tools/list',{}, {path:'/app'})).body.result.tools;
  const model = (await rpc(env,'tools/list',{}, {path:'/mcp'})).body.result.tools;
  const picked = app.find(t => t.name === 'attachPdfBatchFromPicker');
  assert.ok(picked, '学習枠に選択済みPDFの登録ツールがある');
  assert.deepEqual(picked._meta.ui.visibility,['app'], 'モデルに表示しない');
  assert.equal(picked._meta['openai/outputTemplate'],undefined,'新しい学習枠を生成しない');
  assert.equal(picked._meta['openai/fileParams'],undefined,'file-libraryが許可した一時URLのみ使用');
  assert.equal(model.some(t => t.name === 'attachPdfBatchFromPicker'),false,'通常のAIツールからは利用不可');
});

test('通常の会話からもPDF登録ツールを呼べる（添付がなければ安全に拒否）', async () => {
  const env = makeEnv();
  const r = await rpc(env, 'tools/call', { name: 'attachPdf', arguments: {} });
  assert.equal(r.body.result.isError, true);
  assert.match(r.body.result.content[0].text, /ARGUMENT_REQUIRED/);
  assert.doesNotMatch(r.body.result.content[0].text, /Unknown tool/);
});

test('記述式解説の末尾にモデルが最新問専用の操作画面を配置する', async () => {
  const env = makeEnv();
  const tools = (await rpc(env, 'tools/list', {})).body.result.tools;
  const nav = tools.find(x => x.name === 'showDescriptiveActions');
  assert.ok(nav, '解説後の専用ツールはモデルに公開');
  assert.equal(nav._meta['openai/outputTemplate'], undefined);
  assert.match(nav.description, /explanationMarkdown/);
  assert.match(nav.description, /解説本文を先にチャットへ出さない/);
  assert.ok(nav.inputSchema.properties.explanationMarkdown);
  assert.ok(nav.inputSchema.required.includes('explanationMarkdown'), 'モデルからのボタンのみ登録は禁止');
  const oldPanel = TOOLS.find((t) => t.name === 'getDescriptiveActions');
  assert.ok(oldPanel?.appOnly && oldPanel?.uiOnly, '復旧専用の取得経路は利用者の画面だけ');
  assert.equal(oldPanel.api({sessionId:'s',questionId:'q'})[0], 'GET');
  assert.equal(TOOLS.find((t) => t.name === 'showDescriptiveActions').api({sessionId:'s',questionId:'q',explanationMarkdown:'## 問1'})[0], 'POST');
  assert.match(INSTRUCTIONS, /showDescriptiveActions/);
  const view = forModel({ status:'descriptiveActions', sessionId:'session',
    explanationMarkdown: '解説を下の画面に表示',
    question: { questionId:'land_surveyor:2025:午前の部:11',text:'秘匿原本' } });
  assert.equal(view.status, 'descriptiveActions');
  assert.equal(view.questionId,'land_surveyor:2025:午前の部:11');
  assert.doesNotMatch(JSON.stringify(view),/秘匿原本|解説を下の画面に表示/,'表示内容は画面だけへ送る');
});

test('トークンはヘッダーか URL で受け取り、どちらも無ければ断る', async () => {
  const env = makeEnv();
  assert.equal((await rpc(env, 'ping', {}, { token: null })).status, 401);
  assert.equal((await rpc(env, 'ping', {}, { token: 'wrong' })).status, 401);
  assert.equal((await rpc(env, 'ping', {}, { token: null, path: '/mcp/wrong' })).status, 401);
  assert.deepEqual((await rpc(env, 'ping', {}, { token: null, path: `/mcp/${TOKEN}` })).body.result, {});
  const get = await handle(new Request('https://engine.example/mcp', { headers: { authorization: `Bearer ${TOKEN}` } }), env);
  assert.equal(get.status, 405);
});

test('解説取得ツールをChatGPTモデルへ公開し、照合番号なしの疑似正答で解説させない', async () => {
  const env = makeEnv();
  const tools = (await rpc(env, 'tools/list', {}, { path: '/app' })).body.result.tools;
  const t = tools.find(x => x.name === 'explainSpec');
  assert.ok(t);
  assert.deepEqual(t._meta.ui.visibility, ['model', 'app'], '解説取得は両方に明示公開');
  const fallback = tools.find(x => x.name === 'nextQuestion');
  assert.match(fallback.description, /公式解説資料の安全な取得/);
  assert.match(t.description, /初回失敗/);
  assert.match(t.description, /自動再照合/);
  assert.match(t.description, /showMenu/);
  const r = await rpc(env, 'tools/call', { name: 'explainSpec', arguments: { correct: false, selected: '1', correctAnswer: '3', fieldName: '測量に関する法規' } }, { path: '/app' });
  assert.equal(r.body.result.isError, true);
  assert.equal(r.body.result.structuredContent.error, 'EXPLANATION_REFERENCE_REQUIRED');
  assert.doesNotMatch(JSON.stringify(r.body.result), /explainHow/, '出題元を照合できなければ解説を返さない');
});

test('解説依頼は照合番号を可視メッセージに必ず含み、ChatGPTが再取得できる', () => {
  const html = widgetHtml();
  assert.match(html, /EXPLANATION_REFERENCE_MISSING/);
  assert.match(html, /ctx\.explanationRef/);
  assert.match(html, /照合番号：/);
  assert.match(html, /rpc\('ui\/message',\{role:'user',content:\[\{type:'text',text:visible\}\]\}\)/);
  assert.doesNotMatch(html, /\.concat\(blocks\)|verifiedOfficialExplanation|async function verifiedImageContext/, '内部JSONと画像をチャットへ添付しない');
  assert.doesNotMatch(html, /<button id=\\"moreAiExplanation\\">/);
  assert.doesNotMatch(html, /<button id=\\"explanationRetry\\">/);
  assert.match(html, /学習画面を復元/);
  assert.doesNotMatch(html, /AI解説をもう一度表示/);
  assert.match(WIDGET_URI, /question-v153\.html/);
  assert.equal(WIDGET_VERSION, '2026-10-31.153');
  assert.match(TOOLS.find(x => x.name === 'explainSpec').description, /公式過去問の照合用/);
});


test('分野の基礎解説はチャットではなく同じ学習枠に表示し、確認問題へのボタンで進める', async () => {
  const menuTool = TOOLS.find(x => x.name === 'showMenu');
  assert.ok(menuTool, 'showMenu must be available to ChatGPT model');
  const listedForModel = (await rpc(makeEnv(), 'tools/list', {}, { path: '/app' })).body.result.tools.find(t => t.name === 'showMenu');
  assert.deepEqual(listedForModel._meta.ui.visibility, ['model', 'app'], 'AIが解説本文を登録できるモデル公開ツール');
  assert.equal(listedForModel._meta['openai/outputTemplate'], undefined, '解説登録では別の学習枠を生成しない');

  assert.ok(menuTool.inputSchema.properties.kind.enum.includes('lesson'));
  const args = {
    kind: 'lesson', fieldName: '必修問題',
    body: '## 必修問題｜基礎解説\\n\\n**患者安全**と感染対策を説明します。\\n\\n| 項目 | 考え方 |\\n|---|---|\\n| 観察 | バイタルを確認 |',
    sessionId: 'current-session', studyId: 'current-study', learnerId: 'current-learner',
  };
  const lesson = menuTool.local(args);
  assert.equal(lesson.status, 'menu');
  assert.equal(lesson.menu.kind, 'lesson');
  assert.deepEqual(lesson.menu.actions, ['check', 'end']);
  assert.equal(lesson.menu.fieldName, '必修問題');
  assert.equal(lesson.menu.body, args.body);
  assert.equal(lesson.menu.sessionId, args.sessionId);
  assert.match(forModel(lesson).howToProceed, /基礎解説全文.*同一の学習枠内/);
  assert.equal(menuTool.local({ kind: 'lesson', fieldName: '必修問題' }), null, 'never show empty explanation');
  assert.equal(menuTool.local({ kind: 'lesson', body: args.body }), null, 'field identity is required');
  assert.match(appInstructions(), /基礎解説は必ず学習枠内/);
  assert.ok(appInstructions().includes('showMenu({kind:lesson'));
  assert.doesNotMatch(appInstructions(), /その分野の解説をチャットに書き（この場合だけ showMenu は呼ばない）/);
  const widget = widgetHtml();
  assert.ok(widget.includes("m.kind === 'lesson' && action === 'check'"));
  assert.ok(widget.includes("m.fieldName || loadIds().field"));
  assert.ok(widget.includes("lessonField + 'の確認問題・第1問へ進む'"));
  assert.ok(widget.includes('この分野の確認問題へ'));
  assert.ok(widget.includes('function scrollUp(noMark)'));
  assert.ok(widget.includes('window.scrollTo(0, 0)'));
  assert.ok(widget.includes('latest.scrollIntoView({behavior:'));
  assert.match(widget, /#app\.study-viewport\{height:auto;max-height:none;overflow:visible/);
  // This path does not use a chat text answer as the lesson display.
  assert.match(menuTool.description, /チャットには書かず/);
});

test('回答と同時に公式正答・簡易解説を表示し、AIボタンは追加の詳しい解説だけを依頼する', () => {
  const html = widgetHtml();
  assert.match(html, /・簡易解説（採点と同時に表示）/);
  assert.match(html, /answerStatusName\(g\)/, '通常の公式正答と民間サイト掲載の解答はラベルを区別する');
  assert.match(html, /confirmation-summary/);
  assert.match(html, /d\.explanation/);
  assert.match(html, /officialAnswerSummary\(q, g\)/);
  assert.ok(html.includes('id="checkExp"'));
  assert.ok(html.includes('id="dkExp"'));
  assert.ok(html.includes('id="exp"'));
  assert.match(html, /await requestAdaptiveExplanation\(ctx\);/);
  assert.match(html, /else renderVerifiedExplanation\(ctx\);/);
  assert.match(html, /同じ問題の解説を取得できませんでした|AI解説の依頼に失敗しました/);
});

test('学習枠の二重縦スクロールを廃止して自然高さにし、旧枠は縮小する', () => {
  const html = widgetHtml();
  assert.match(html, /class="latest" tabindex="-1"/);
  assert.match(html, /latest\.focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /#app\.study-viewport\{height:auto;max-height:none;overflow:visible/);
  assert.match(html, /html,body\{height:auto;min-height:0;overflow:visible\}/);
  assert.match(html, /app\.classList\.add\('study-viewport'\)/);
  assert.doesNotMatch(html, /#app\.study-viewport\{height:clamp/);
  assert.match(html, /latest\.scrollIntoView\(\{behavior:'instant',block:'start'/);
  assert.doesNotMatch(html, /document\.addEventListener\('click', function\(\)\{ goFull\(\); \}/,
    '利用者のタップを全画面への自動切替に使わない');
  assert.match(html, /if \(turn === latestFocusTurn\) \{ fit\(\); align\(\); \}/);
  assert.match(html, /Promise\.resolve\(\)\.then\(function\(\)\{ if \(!locked && thisRender === renderFocusTurn\) scrollUp\(\); \}\)/);
  assert.match(html, /#app\.is-old\{height:auto;min-height:0/);
  assert.match(html, /class="ov-r full"/, 'ラベルのない項目は列幅で押しつぶさない');
  assert.match(html, /@media \(max-width:520px\)\{\.ov-r:not\(\.full\)/, '狭い画面では項目名と値を縦に並べる');
});

test('解説の依頼文は資格共通の判断根拠とし、計算の有無は問題の内容で決める', () => {
  const html = widgetHtml();
  assert.match(html, /各選択肢の判断根拠を、公式資料に基づいて解説してください。/);
  assert.doesNotMatch(html, /各選択肢の理由と計算手順を、公式資料に基づいて解説してください。/);
  const legal = explainHow({stage:4,fieldName:'宅地建物取引業法と関係法令'});
  assert.match(legal, /計算を要しない設問では、条文・判例・定義・要件・例外・判断過程/);
  assert.match(legal, /不要な断り書きを付けない/);
  const calculation = explainHow({stage:3,fieldName:'測量の座標計算'});
  assert.match(calculation, /計算を要する設問では使用する式・数値の代入・途中過程・単位・検算/);
  assert.match(calculation, /座標・面積等の計算では、その問題に適切な関数電卓の操作方法/);
  assert.match(calculation, /計算を要する問題では、手順を1行ずつの表/);
});

test('初回の公式解説が一時的に503→404でも、同じ照合番号で自動再照合して表示可能にする', async () => {
  const ref='E-AbCdEfGhIjKlMnOp';
  let calls=0;
  const api=async(method,path) => {
    assert.equal(method,'GET','再試行は読取だけ');
    assert.equal(path, '/v1/explanation-ref/'+ref,'別の問や次問への遷移は禁止');
    calls++;
    return calls===1 ? {status:503,body:{error:'EXPLANATION_LOOKUP_TEMPORARY'}} :
      calls===2 ? {status:404,body:{error:'EXPLANATION_REF_EXPIRED'}} :
      {status:200,body:{status:'explanationContext',
        explanationRef:ref,question:{questionId:'q041:2025:main:10'},
        grade:{questionId:'q041:2025:main:10',correctAnswer:3}}};
  };
  const result=await handleRpc({jsonrpc:'2.0',id:201,method:'tools/call',
    params:{name:'nextQuestion',arguments:{sessionId:ref}}},api,{widget:true});
  assert.equal(calls,3);
  assert.equal(result.result.isError,false);
  assert.equal(result.result.structuredContent.grade.correctAnswer,3);
  assert.equal(result.result.structuredContent.question.questionId,'q041:2025:main:10');
});

test('初回のexplainSpecも一時エラーなら自動回復し、別問ID不一致は再試行でごまかさない', async () => {
  const ref='E-AbCdEfGhIjKlMnOp';
  let tries=0;
  const transient=await handleRpc({jsonrpc:'2.0',id:202,method:'tools/call',
    params:{name:'explainSpec',arguments:{explanationRef:ref}}},
    async()=> {
      tries++;
      if (tries===1) throw new Error('transient Cloud Run network error');
      return {status:200,body:{status:'explanationContext',
        question:{questionId:'q041:2025:main:10'},grade:{questionId:'q041:2025:main:10',correctAnswer:3}}};
    },{widget:true});
  assert.equal(tries,2);
  assert.equal(transient.result.isError,false);
  assert.equal(transient.result.structuredContent.status,'explanationContext');
  let mismatches=0;
  const wrong=await handleRpc({jsonrpc:'2.0',id:203,method:'tools/call',
    params:{name:'nextQuestion',arguments:{sessionId:ref}}},
    async()=> {mismatches++;return {status:409,body:{error:'EXPLANATION_BINDING_MISMATCH'}};},{widget:true});
  assert.equal(wrong.result.isError,true);
  assert.equal(wrong.result.structuredContent.error,'EXPLANATION_BINDING_MISMATCH');
  assert.equal(mismatches,1,'異なる問題の照合を自動再試行で通してはいけない');
});

test('ChatGPTから測量士補の2026年度問6をIDなしで指定しても初期確認へ戻らず公式採点まで進む', async () => {
  const env = makeEnv({ answers:[3,1,4,2,1,5], figureOn:[] });
  const app = async (name,args) => (await rpc(env,'tools/call',
    {name,arguments:args},{path:'/app'})).body.result;
  const start = await app('startSession', {
    qualificationId:SRC.qualificationId,sources:[SRC],
    requestedQuestion:{year:2026,questionNumber:6},
  });
  assert.equal(start.isError, undefined,JSON.stringify(start.structuredContent));
  assert.equal(start.structuredContent.status,'question');
  assert.equal(start._meta.qlp.question.questionNumber,6);
  assert.equal(start._meta.qlp.question.year,2026);
  assert.equal(start._meta.qlp.onboarding,undefined,'学習段階のボタンではなく問題を即表示');
  assert.equal(start._meta.qlp.question.correctAnswer,undefined,'出題時に正答は非公開');
  const sid=start._meta.qlp.sessionId;
  const qid=start._meta.qlp.question.questionId;
  assert.ok(sid && qid);
  const graded=await app('submitAnswer',{sessionId:sid,questionId:qid,value:'5'});
  assert.equal(graded._meta.qlp.grade.correct,true);
  const unavailable=await app('nextQuestion',{sessionId:sid,question:'2025年度 問6'});
  assert.equal(unavailable._meta.qlp.status,'questionUnavailable');
  assert.equal(unavailable._meta.qlp.question,undefined,'別の年度にすり替えない');
});

test('引継ぎIDから復帰した場合は試験概要に戻らず再開画面へ進み、履歴から次の問題を出す', async () => {
  const env = makeEnv();
  const callUi = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { path: '/app' })).body.result;
  const opened = (await callUi('startSession', { qualificationId: SRC.qualificationId, sources: [SRC] })).structuredContent;
  const firstStudy = (await callUi('startStudy', { qualificationName: '測量士補', learnerId: opened.learnerId })).structuredContent;
  assert.ok(firstStudy.studyId);
  const q = (await callUi('nextQuestion', { sessionId: opened.sessionId })).structuredContent.question;
  assert.equal(q.questionNumber, 1);
  const grade = (await callUi('submitAnswer', { sessionId: opened.sessionId, questionId: q.questionId, value: '3' })).structuredContent.grade;
  assert.equal(grade.correct, true);
  env.clock = () => T0 + 10000;
  const list = (await rpc(env, 'tools/list', {}, { path: '/app' })).body.result.tools;
  const importer = list.find(x => x.name === 'importHandoff');
  assert.equal(importer._meta, undefined, '引継ぎ受付自体は新しいUIを作らない');
  const restoreTool = list.find(x => x.name === 'restoreStudyView');
  assert.equal(restoreTool._meta['openai/outputTemplate'], undefined, '通常復元は学習枠を増やさない');
  const handoffTool = list.find(x => x.name === 'openHandoffView');
  assert.equal(handoffTool._meta['openai/outputTemplate'], WIDGET_URI, '引継ぎ時だけ新しい学習枠を開く');
  const resumed = await callUi('importHandoff', { handoff: '引継ぎID：' + opened.learnerId });
  assert.equal(resumed.isError, false);
  assert.equal(resumed.structuredContent.status, 'resumeReady');
  assert.equal(resumed._meta, undefined, '引継ぎの読込み自体は新しい画面ツールへの依存を追加しない');
  assert.equal(resumed.structuredContent.nextTool, 'openHandoffView');
  assert.match(resumed.structuredContent.howToProceed, /必ず続けてopenHandoffView/);
  assert.equal(resumed.structuredContent.answeredCount, 1);
  assert.equal(resumed.structuredContent.onboarding, undefined);
  assert.equal(resumed.structuredContent.overview, undefined);
  const current = await callUi('openHandoffView', { sessionId: resumed.structuredContent.sessionId });
  assert.equal(current.structuredContent.status, 'resumeReady');
  assert.equal(current._meta.qlp.status, 'resumeReady');
  assert.equal(current._meta.qlp.answeredCount, 1);
  assert.equal(current._meta.qlp.onboarding, undefined);
  assert.ok(resumed.structuredContent.sessionId);
  assert.notEqual(resumed.structuredContent.sessionId, opened.sessionId);

  const blocked = (await callUi('nextQuestion', { sessionId: resumed.structuredContent.sessionId })).structuredContent;
  assert.equal(blocked.status, 'resumeReady', '初回用の試験概要へ戻さず再開ボタンを表示する');
  assert.equal(blocked.onboarding, undefined);
  const secondStudy = (await callUi('startStudy', { qualificationName: '測量士補', learnerId: opened.learnerId })).structuredContent;
  assert.ok(secondStudy.studyId);
  const next = (await callUi('nextQuestion', { sessionId: resumed.structuredContent.sessionId })).structuredContent;
  assert.equal(next.question.questionNumber, 2, '解答済みの問1や初期案内ではなく次の問題');
  assert.equal(next.question.questionId !== q.questionId, true);

  env.clock = () => T0 + 20000;
  const fromStart = await callUi('startSession', { qualificationId: SRC.qualificationId, learnerId: opened.learnerId, sources: [SRC] });
  assert.equal(fromStart.structuredContent.status, 'resumeReady', '引継ぎID付きstartSessionも初回導入に戻らない');
  assert.equal(fromStart._meta.qlp.onboarding, undefined);
  assert.equal(fromStart.structuredContent.answeredCount, 1);
  assert.match(widgetHtml(), /resumeSavedStudy/);
  assert.match(widgetHtml(), /学習を再開する/);
});

test('画面の非表示文脈がなくても、既知のsessionIdだけで解説対象を取得して解説画面へ渡せる', async () => {
  const env = makeEnv();
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  const { sessionId } = s.structuredContent;
  const q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: '3' });
  // AI役に与える入力は「2026年度 問1の解説を見る」と最初に返ったsessionIdのみ。
  // 画面内のtools/call結果・ui/update-model-contextはAI役に渡さない。
  const spec = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: { sessionId } }, { path: '/app' })).body.result;
  assert.equal(spec.isError, false);
  const context = spec.structuredContent;
  assert.equal(context.question.questionId, q.questionId);
  assert.match(context.explanationRef, /^E-[A-Za-z0-9_-]{16}$/);
  // モデルがsessionId・questionIdを受け取っていなくても、この番号だけで正確に復元する。
  const beforeRefRead = await env.STORE.get(`ses/${sessionId}`);
  const viaRef = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: {
    explanationRef: context.explanationRef,
  } }, { path: '/app' })).body.result;
  assert.equal(viaRef.isError, false);
  assert.equal(viaRef.structuredContent.question.questionId, q.questionId);
  assert.equal(viaRef.structuredContent.grade.correctAnswer, 3);
  const legacyAlias = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: {
    sessionId: context.explanationRef,
  } }, { path: '/app' })).body.result;
  assert.equal(legacyAlias.isError, false, '旧ChatGPTツールのsessionId欄でも一時参照番号を照合する');
  assert.equal(legacyAlias.structuredContent.question.questionId, q.questionId);
  // 実ChatGPTでexplainSpecが登録済みツール一覧にない場合でも、既存のnextQuestionから読取可能。
  // 特別なsessionId=照合番号は次問進行ではなく公式解説資料のみを返す。
  const fallback = (await rpc(env, 'tools/call', { name: 'nextQuestion', arguments: { sessionId: context.explanationRef } }, { path: '/app' })).body.result;
  assert.equal(fallback.isError, false, '公式資料を正しく取得した場合は明示的に成功を返す');
  assert.equal(fallback.structuredContent.status, 'explanationContext');
  assert.equal(fallback.structuredContent.question.questionId, q.questionId);
  assert.equal(fallback.structuredContent.grade.correctAnswer, 3);
  assert.equal(JSON.parse(fallback.content[0].text).question.questionId, q.questionId, 'AIが読める通常のcontentに公式根拠がある');
  const missingAlias = (await rpc(env, 'tools/call', { name: 'nextQuestion', arguments: { sessionId: 'E-0000000000000000' } }, { path: '/app' })).body.result;
  assert.equal(missingAlias.isError, true);
  assert.equal(missingAlias.structuredContent.error, 'EXPLANATION_REF_EXPIRED');
  assert.equal(await env.STORE.get(`ses/${sessionId}`), beforeRefRead, '参照番号の復元は学習記録を変更しない');
  const malformed = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: {
    explanationRef: 'E-short',
  } }, { path: '/app' })).body.result;
  assert.equal(malformed.structuredContent.error, 'EXPLANATION_REF_INVALID');
  const missing = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: {
    explanationRef: 'E-0000000000000000',
  } }, { path: '/app' })).body.result;
  assert.equal(missing.structuredContent.error, 'EXPLANATION_REF_EXPIRED');
  // 別の問題への誤結合が起きる参照はAPIで拒否し、別問に置き換えない。
  const forged = 'E-1111111111111111';
  await env.STORE.put('eref/' + forged, JSON.stringify({ sessionId, questionId: 'surveyor:2026:main:999' }), { expirationTtl: 3600 });
  const wrongBinding = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: {
    explanationRef: forged,
  } }, { path: '/app' })).body.result;
  assert.equal(wrongBinding.structuredContent.error, 'EXPLANATION_BINDING_MISMATCH');
  assert.equal(context.question.stem, q.stem);
  assert.deepEqual(context.question.choices, q.choices);
  assert.equal(context.grade.correctAnswer, 3);
  assert.equal(context.status, 'explanationContext');
  assert.ok(JSON.parse(spec.content[0].text).question.stem, 'AIに読めるcontentにも本文がある');
  assert.equal(spec._meta, undefined, '解説資料をUI専用の非表示領域に閉じ込めない');
  const body = [
    '## 2026年度 問1のAI解説',
    '公式正答は3です。出題文・図表・選択肢を照合して根拠を説明します。',
    '1. 選択肢1は条件に合わないため誤りです。条件と結論の関係を確認します。',
    '2. 選択肢2も本文の前提を満たしていないため誤りです。',
    '3. 選択肢3は公式正答であり、元問題の与条件に一致します。',
    '4. 選択肢4は根拠となる測量の条件と異なります。',
    '5. 選択肢5は単位と計算条件を再確認する必要があります。',
    '正しい判断は本文の条件と公式正答PDFの照合に基づきます。',
  ].join('\n');
  const menu = (await rpc(env, 'tools/call', { name: 'showMenu', arguments: {
    kind: 'next', body, explanationRef: context.explanationRef,
    sessionId: context.sessionId, learnerId: context.learnerId,
  } }, { path: '/app' })).body.result;
  assert.equal(menu.isError, undefined,JSON.stringify(menu.structuredContent));
  assert.equal(menu._meta.qlp.status,'menu');
  assert.equal(menu._meta.qlp.menu.body, body);
  assert.equal(menu._meta.qlp.menu.sessionId, sessionId);
  assert.equal(menu._meta.qlp.menu.actions[0],'next');
  assert.equal(menu._meta.qlp.menu.actions.at(-1),'end');
  assert.equal(menu.structuredContent.menu,undefined,'AIへ解説全文を再配布しない');
  const restored = (await rpc(env, 'tools/call', { name: 'restoreStudyView', arguments: {
    sessionId,
  } }, { path: '/app' })).body.result;
  assert.equal(restored._meta.qlp.status,'menu');
  assert.equal(restored._meta.qlp.menu.body,body,'同じ問の解説を全文復元');
  assert.equal(restored._meta.qlp.menu.actions.at(-1),'end');
  const badPayload = (await rpc(env,'tools/call',{name:'showMenu',arguments:{
    kind:'next',explanationRef:context.explanationRef,body:'{"type":"verifiedOfficialExplanation","stem":"internal"}'.repeat(5),
  }},{path:'/app'})).body.result;
  assert.equal(badPayload.isError,true,'内部JSONは解説として保存しない');
  assert.equal(badPayload.structuredContent.error,'EXPLANATION_INTERNAL_DATA_REJECTED');
  const advanced=(await rpc(env,'tools/call',{name:'nextQuestion',arguments:{sessionId}})).body.result;
  assert.equal(advanced.structuredContent.status,'question');
  const afterNext=(await rpc(env,'tools/call',{name:'restoreStudyView',arguments:{sessionId}},{path:'/app'})).body.result;
  assert.notEqual(afterNext._meta.qlp.status,'menu','次問で古い解説・操作ボタンを消す');
  const oldRef=(await rpc(env,'tools/call',{name:'showMenu',arguments:{
    kind:'next',explanationRef:context.explanationRef,body,
  }},{path:'/app'})).body.result;
  assert.equal(oldRef.structuredContent.error,'EXPLANATION_BINDING_MISMATCH','旧問への再登録を拒否');
  const stale = (await rpc(env, 'tools/call', { name: 'explainSpec', arguments: { sessionId, questionId: 'surveyor:2026:main:2' } }, { path: '/app' })).body.result;
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.error, 'EXPLANATION_BINDING_MISMATCH');
});

test('既存モデル公開ツールは解説参照番号を採点済みデータの読み取りとして識別する', () => {
  const tool = TOOLS.find(x => x.name === 'nextQuestion');
  assert.ok(tool);
  assert.equal(tool.appOnly, undefined);
  assert.match(tool.description, /次の問題を受け取る/);
  assert.doesNotMatch(widgetHtml(), /verifiedOfficialExplanation|\.concat\(blocks\)/,
    '問題本文・公式正答を会話メッセージに自動添付しない');
  assert.doesNotMatch(widgetHtml(), /var visible = [^;]*JSON\.stringify\(data\)/);
});

test('同じ分野の3問は3択、次の分野へ移るときだけ4択。空の総復習は進行しない', async () => {
  const env = makeEnv({ answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's1', 's2'], figureOn: [] });
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const { sessionId } = s.structuredContent;
  let q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  assert.deepEqual([q.progress.position, q.progress.done, q.progress.total, q.progress.fieldQuestion], [1, 0, 24, 1]);
  for (let i = 0; i < 3; i += 1) {
    const grade = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: String([3, 1, 4][i]) })).structuredContent;
    assert.equal(grade.grade.correct, true);
    const menu = (await rpc(env, 'tools/call', { name: 'showMenu', arguments: { kind: 'next', body: '解説本文', sessionId } }, { path: '/app' })).body.result._meta.qlp.menu;
    assert.deepEqual(menu.actions, i < 2 ? ['next', 'end'] : ['next', 'continueField', 'review', 'end'],
      '解説本文がある場合は再解説の無反応ボタンを省く');
    assert.deepEqual(menu.choices, i < 2 ? ['次の問題へ', '今日はここまで（学習を終了）'] :
      ['次の分野の問題へ', 'この分野の実践問題を続ける', '総復習（間違えた問題）', '今日はここまで（学習を終了）']);
    assert.equal(menu.journey.fieldIndex, 1);
    if (i < 2) {
      q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
      assert.equal(q.progress.position, i + 2);
      assert.equal(q.progress.fieldQuestion, i + 2);
    }
  }
  const before = await env.STORE.get(`ses/${sessionId}`);
  const empty = (await call(env, 'nextQuestion', { sessionId, question: '総復習（間違えた問題）' })).structuredContent;
  assert.equal(empty.status, 'reviewEmpty');
  assert.match(empty.notice, /間違えた問題はまだありません/);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), before);
  const exhausted = (await call(env, 'nextQuestion', { sessionId, question: 'この分野の未出題の実践問題を続ける' })).structuredContent;
  assert.equal(exhausted.status, 'fieldExhausted');
  assert.equal(await env.STORE.get(`ses/${sessionId}`), before, '未出題が無いときは次の分野を進めない');
  const next = (await call(env, 'nextQuestion', { sessionId })).structuredContent;
  assert.equal(next.question.questionNumber, 4);
  assert.deepEqual([next.question.progress.position, next.question.progress.done, next.question.progress.fieldIndex], [4, 3, 2]);
});

test('画面復帰：未回答・採点後・スキップ後・AI確認問題を保存済みの位置に読取専用で復元', async () => {
  const env = makeEnv({ answers: [3, 1, 4], fieldIds: ['s1', 's1', 's1'], figureOn: [1] });
  const { sessionId } = (await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] })).structuredContent;
  const restore = async () => (await rpc(env, 'tools/call',
    { name: 'restoreStudyView', arguments: { sessionId } }, { path: '/app' })).body.result;
  const q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  const original = await env.STORE.get(`ses/${sessionId}`);
  const pending = await restore();
  assert.equal(pending.structuredContent.status, 'question');
  assert.equal(pending.structuredContent.question.questionId, q.questionId);
  assert.equal(pending._meta.qlp.question.figureUrls.length, q.figures.length, '図は画面専用の完全なデータに保持する');
  assert.equal(pending.structuredContent.question.figureCount, q.figures.length, 'モデルへ図URLを配布しない');
  assert.equal(await env.STORE.get(`ses/${sessionId}`), original, '表示復元でセッションを変更しない');
  assert.equal(pending.structuredContent.question.stem, q.stem, 'アプリ専用ツールは内部表示と別経路でも動く');

  const answered = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: '3' })).structuredContent;
  assert.equal(answered.grade.correct, true);
  const gradedSaved = await env.STORE.get(`ses/${sessionId}`);
  const graded = await restore();
  assert.equal(graded.structuredContent.status, 'restoredGrade');
  assert.equal(graded.structuredContent.question.questionId, q.questionId);
  assert.equal(graded.structuredContent.grade.correctAnswer, 3);
  assert.equal(graded.structuredContent.next.question.questionId, answered.next.question.questionId);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), gradedSaved, '採点結果復元で次問を進めない');

  const next = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  assert.equal(next.questionId, answered.next.question.questionId);
  const nextSaved = await env.STORE.get(`ses/${sessionId}`);
  const current = await restore();
  assert.equal(current.structuredContent.status, 'question');
  assert.equal(current.structuredContent.question.questionId, next.questionId);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), nextSaved);

  const skip = (await call(env, 'submitAnswer', { sessionId, questionId: next.questionId, value: 'スキップ' })).structuredContent;
  assert.equal(skip.grade.skipped, true);
  const skippedSaved = await env.STORE.get(`ses/${sessionId}`);
  const afterSkip = await restore();
  assert.equal(afterSkip.structuredContent.status, 'question', 'スキップ後に採点結果メニューを挟まない');
  assert.notEqual(afterSkip.structuredContent.question.questionId, next.questionId);
  assert.equal(await env.STORE.get(`ses/${sessionId}`), skippedSaved);

  const env2 = makeEnv();
  const s2 = (await call(env2, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] })).structuredContent;
  const fieldName = CATALOG[SRC.qualificationId].fields.s1;
  await rpc(env2, 'tools/call', { name: 'chooseItem', arguments: { sessionId: s2.sessionId, fieldName, mode: 'check' } }, { path: '/app' });
  const ai = (await rpc(env2, 'tools/call', { name: 'registerConfirmationQuestion',
    arguments: { sessionId: s2.sessionId, question: '確認問題として出題する十分な長さの本文です。', choices: ['A','B','C'], correctAnswer: 2 } },
  { path: '/app' })).body.result._meta.qlp;
  const aiSaved = await env2.STORE.get(`ses/${s2.sessionId}`);
  const restoredAi = (await rpc(env2, 'tools/call', { name: 'restoreStudyView',
    arguments: { sessionId: s2.sessionId } }, { path: '/app' })).body.result._meta.qlp;
  assert.equal(restoredAi.status, 'confirmation_question');
  assert.equal(restoredAi.challengeId, ai.challengeId, '同じ正答固定済みの問題へ復帰する');
  assert.equal(restoredAi.correctAnswer, undefined, '復元で正答を先に公開しない');
  assert.equal(await env2.STORE.get(`ses/${s2.sessionId}`), aiSaved);
});

test('通常の確認問題は1問目から全3問と全分野の位置を固定し、3問終了後に同じ分野の実践問題へ進む', async () => {
  const env = makeEnv({ answers: [3, 1, 4], fieldIds: ['s1', 's1', 's1'], figureOn: [] });
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const sessionId = s.structuredContent.sessionId;
  const app = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { path: '/app' })).body.result;
  const fieldName = CATALOG[SRC.qualificationId].fields.s1;
  const choice = (await app('chooseItem', { sessionId, fieldName, mode: 'explain' })).structuredContent;
  assert.deepEqual(choice.journey, { fieldIndex: 1, fieldTotal: Object.keys(CATALOG[SRC.qualificationId].fields).length });
  for (let i = 1; i <= 3; i++) {
    const args = { sessionId, question: `確認問題の第${i}問の本文です。`, choices: ['A', 'B', 'C'], correctAnswer: 2, explanation: '選択肢Bが正答です。AとCは設問の条件を満たしません。' };
    const q = (await app('registerConfirmationQuestion', args))._meta.qlp;
    assert.equal(q.position, i);
    assert.equal(q.total, 3);
    assert.deepEqual(q.journey, choice.journey);
    assert.equal(q.correctAnswer, undefined, '画面とモデルには正答を先渡ししない');
    const repeated = (await app('registerConfirmationQuestion', { ...args, question: '別の問題を上書きしようとする' }))._meta.qlp;
    assert.equal(repeated.challengeId, q.challengeId);
    const answer = (await app('answerConfirmationQuestion', { sessionId, challengeId: q.challengeId, selected: i === 2 ? '1' : '2' })).structuredContent;
    assert.equal(answer.position, i);
    assert.equal(answer.explanation, args.explanation);
    assert.equal(answer.correctChoice, 'B');
    assert.equal(answer.complete, i === 3);
    assert.equal(answer.correctCount, i === 3 ? 2 : 1);
    if (i === 3) assert.equal(answer.nextFieldName, CATALOG[SRC.qualificationId].fields.s2);
  }
  const after = await app('registerConfirmationQuestion', { sessionId, question: '4問目を登録しないための文章です。', choices: ['A', 'B'], correctAnswer: 1 });
  assert.equal(after.structuredContent.error, 'CONFIRMATION_NOT_ACTIVE');
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.match(html, /同じ分野の公式過去問を解く/);
  assert.match(html, /localBar\('この分野の確認問題', d.position, 3\)/);
  assert.match(html, /journeyBar\(j.fieldIndex, j.fieldTotal, 'check' \+ d.position/);
  const practice = (await app('chooseItem', { sessionId, fieldName, mode: 'practice' })).structuredContent;
  assert.equal(practice.mode, 'practice');
  const official = (await call(env, 'nextQuestion', { sessionId })).structuredContent;
  assert.equal(official.question.fieldName, fieldName);
});

test('3問後に同じ分野の未出題の実践問題を続けると、先取りした次分野を飛ばさず元の分野の4問目を出す', async () => {
  const env = makeEnv({ answers: [3, 1, 4, 2, 3], fieldIds: ['s1', 's1', 's1', 's1', 's2'], figureOn: [] });
  const { sessionId } = (await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [SRC] })).structuredContent;
  let q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  for (const answer of ['3', '1', '4']) {
    const graded = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: answer })).structuredContent;
    if (answer !== '4') q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
    else assert.equal(graded.next.question.fieldName !== q.fieldName, true);
  }
  const continued = (await call(env, 'nextQuestion', { sessionId, question: 'この分野の未出題の実践問題を続ける' })).structuredContent;
  assert.equal(continued.status, 'question');
  assert.equal(continued.question.questionNumber, 4);
  assert.equal(continued.question.fieldName, q.fieldName);
  assert.equal(continued.fieldChanged, false);
  assert.equal(continued.question.progress.fieldQuestion, 1, '同じ分野で新しい3問セットを始める');
});

test('ツールだけで、取り込み → 出題 → 採点 → 引継ぎ まで通る', async () => {
  const env = makeEnv();
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  assert.equal(s.isError, false);
  const { sessionId, job, learnerId } = s.structuredContent;
  assert.equal(job.state, 'done');
  assert.match(learnerId, /^[A-Za-z0-9]+$/);
  const q = (await call(env, 'nextQuestion', { sessionId })).structuredContent.question;
  assert.equal(q.questionNumber, 1);
  assert.ok(!JSON.stringify(q).includes('correctAnswer'));
  const wrong = await call(env, 'submitAnswer', { sessionId, questionId: 'surveyor:2026:main:2', value: '1' });
  assert.equal(wrong.isError, true);
  assert.equal(wrong.structuredContent.error, 'QUESTION_BINDING_MISMATCH');
  const g = (await call(env, 'submitAnswer', { sessionId, questionId: q.questionId, value: '3' })).structuredContent.grade;
  assert.equal(g.correct, true);
  const h = (await call(env, 'getHandoff', { sessionId })).structuredContent.handoff;
  const imp = (await call(env, 'importHandoff', { handoff: h })).structuredContent;
  assert.equal(imp.restored, 1);
  assert.equal((await call(env, 'getJob', { qualificationId: `${SRC.qualificationId}~${learnerId}` })).structuredContent.job.state, 'done');
});

test('必須の引数が無い・知らないツール・知らないメソッドはエラーで返す', async () => {
  const env = makeEnv();
  const miss = await call(env, 'nextQuestion', {});
  assert.equal(miss.isError, true);
  assert.match(miss.content[0].text, /ARGUMENT_REQUIRED/);
  assert.equal((await rpc(env, 'tools/call', { name: 'nothing', arguments: {} })).body.error.code, -32602);
  assert.equal((await rpc(env, 'resources/list', {})).body.error.code, -32601);
});

test('ChatGPT アプリ（/app/<トークン>）：問題はエンジンの画面に出し、AIには図や表示文を渡さない', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  // 主のトークンをURLに入れても入れない（URLに入れるのはアプリ専用の合言葉だけ）
  assert.equal((await rpc(env, 'initialize', {}, { token: null, path: `/app/${TOKEN}` })).status, 401);
  assert.ok((await app('initialize', { protocolVersion: '2025-06-18', capabilities: {} })).capabilities.resources);
  const tools = (await app('tools/list', {})).tools;
  const nq = tools.find((t) => t.name === 'nextQuestion');
  assert.equal(nq._meta['openai/outputTemplate'], undefined);
  assert.equal(nq._meta.ui.resourceUri, undefined);
  // 資格名を受けたら、startSession の結果としてすぐ試験概要と免除・学習状況のボタンを画面に出す（AIの次の呼び出しに頼らない）
  assert.equal(tools.find((t) => t.name === 'startSession')._meta['openai/outputTemplate'], WIDGET_URI);
  const startup = tools.find(t => t.name === 'startSession').description;
  assert.match(startup, /getStudySnapshot/);
  assert.match(startup, /既存枠が失われたときだけ/);
  assert.doesNotMatch(startup, /同一セッションのrestoreStudyViewまたはnextQuestion/);

  const snapshotTool = tools.find(x => x.name === 'getStudySnapshot');
  assert.ok(snapshotTool, 'background restoration tool exists');
  assert.equal(snapshotTool._meta?.['openai/outputTemplate'], undefined, 'background restore cannot create a new widget');
  assert.equal(snapshotTool._meta?.ui?.resourceUri, undefined);
  assert.equal(tools.find(x => x.name === 'restoreStudyView')._meta['openai/outputTemplate'], undefined,
    'read-only restoration cannot create a widget');
  assert.equal(tools.find(x => x.name === 'openHandoffView')._meta['openai/outputTemplate'], WIDGET_URI,
    'explicit imported handoff opens the only new widget');
  for (const name of ['registerConfirmationQuestion', 'submitAnswer', 'nextQuestion', 'showMenu', 'endStudy', 'startStudy', 'registerRemediationQuestion', 'showDescriptiveActions']) {
    const t = tools.find(x => x.name === name);
    assert.ok(t, name + ' exists');
    assert.equal(t._meta?.['openai/outputTemplate'], undefined, name + ' must not open another frame');
    assert.equal(t._meta?.ui?.resourceUri, undefined, name + ' must not attach widget');
  }
  const opened = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  assert.ok(Array.isArray(opened._meta.qlp.onboarding));
  assert.ok(opened._meta.qlp.overview);
  assert.deepEqual(opened.structuredContent.onboarding.map((s) => s.kind), ['exempt', 'status'], 'iOSで_metaが消えても導入画面が表示できる');
  assert.equal(opened.structuredContent.overview.title, '■試験概要');
  assert.ok(opened.structuredContent.sessionId);
  const snapshot = await app('tools/call', { name: 'getStudySnapshot',
    arguments: { sessionId: opened.structuredContent.sessionId } });
  assert.equal(snapshot.structuredContent.sessionId, opened.structuredContent.sessionId);
  assert.equal(snapshot._meta, undefined, 'background snapshot must not generate a new widget');
  // 実機で「@資格学習 宅建」を指定したのに、AIがアプリ名だけを資格として送ってしまった回帰例。
  const appNameOnly = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '資格学習', sources: [] } });
  assert.equal(appNameOnly.isError, true, 'アプリ名だけで資格を推測しない');
  assert.equal(appNameOnly.structuredContent.error, 'QUALIFICATION_NOT_SUPPORTED');
  const tagged = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '@資格学習 宅建', sources: [] } });
  assert.deepEqual(tagged.structuredContent.onboarding.map((x) => x.kind), ['exempt', 'status'], 'アプリ名を含む資格表記も宅建の導入画面へ進む');
  assert.equal(tagged.structuredContent.overview.title, '■試験概要');
  const menu = await app('tools/call', { name: 'showMenu', arguments: { kind: 'plan' } });
  assert.equal(menu._meta.qlp.menu.choices[0], 'この学習計画で始める');
  assert.equal(menu.structuredContent.menu, undefined);
  assert.equal((await rpc(env, 'tools/call', { name: 'showMenu', arguments: { kind: 'plan' } })).body.error.code, -32602);
  const res = (await app('resources/list', {})).resources;
  assert.equal(res[0].mimeType, 'text/html;profile=mcp-app');
  const html = (await app('resources/read', { uri: res[0].uri })).contents[0];
  assert.match(html.text, /submitAnswer/);
  assert.deepEqual(html._meta.ui.csp.resourceDomains, ['https://engine.example']);
  assert.equal(html._meta.ui.domain, 'https://engine.example');
  assert.equal(html._meta['openai/widgetDomain'], 'https://engine.example');
  assert.ok(res.some((r) => r.uri === 'ui://qlp/question-v1.html'));
  const previous = (await app('resources/read', { uri: 'ui://qlp/question-v134.html' })).contents[0];
  assert.match(previous.text, /id="licensedLocalPick"/);
  assert.doesNotMatch(previous.text, /id="licensedChooseSaved"/);
  const legacy = (await app('resources/read', { uri: 'ui://qlp/question-v1.html' })).contents[0];
  assert.equal(legacy.uri, 'ui://qlp/question-v1.html');
  assert.match(legacy.text, /submitAnswer/);
  assert.equal((await rpc(env, 'resources/read', { uri: 'ui://qlp/unknown.html' }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.error.code, -32602);
  // 通常の /mcp には画面を出さない（Claude などの接続はこれまでどおり）
  assert.equal((await rpc(env, 'tools/list', {})).body.result.tools.find((t) => t.name === 'nextQuestion')._meta, undefined);
  assert.equal((await rpc(env, 'resources/list', {})).body.error.code, -32601);

  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const call2 = (name, args) => app('tools/call', { name, arguments: args });
  const startedRes = await call2('startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  const started = startedRes.structuredContent ?? JSON.parse(startedRes.content[0].text);
  const { sessionId } = started;
  assert.match(started.howToProceed, /画面のボタン/);
  assert.match(started.howToProceed, /nextQuestion も呼ばない/);
  // 学習の開始（startStudy）の前は出題しない（学習計画の確認を飛ばさせない）
  const earlyRes = await call2('nextQuestion', { sessionId });
  const early = earlyRes.structuredContent;
  assert.deepEqual(early.onboarding.map((s) => s.kind), ['status'], '免除制度のない測量士補では免除を聞かない');
  assert.equal(earlyRes._meta.qlp.onboarding.at(-1).kind, 'status');
  assert.equal(early.status, 'needPlan');
  // SRCは任意の公式PDFを指定する非カタログ資格で、概要が存在しなくても既存の出題を維持する。
  assert.ok(early.overview && typeof early.overview === 'object', '利用者提供PDFの資格でも概要応答の形を保つ');
  assert.equal(early.question, undefined);
  await call2('startStudy', { qualificationName: '測量士補', learnerId: started.learnerId });
  const r = await call2('nextQuestion', { sessionId });
  const full = r._meta.qlp;
  assert.equal(full.sessionId, sessionId);
  assert.ok(Array.isArray(full.question.figureUrls));
  assert.ok(full.question.screen);
  const q = r.structuredContent.question;
  assert.equal(q.screen, undefined);
  assert.equal(q.display, undefined);
  assert.equal(q.figures, undefined);
  assert.equal(q.figureUrls, undefined);
  assert.match(q.howToShow, /書き直したり/);
  assert.ok(q.stem && q.choices);
  const a = await call2('submitAnswer', { sessionId, questionId: q.questionId, value: '3' });
  assert.equal(a._meta.qlp.grade.correct, true);
  if (a._meta.qlp.next.question) {
    assert.equal(a.structuredContent.next.question.screen, undefined);
    assert.ok(a._meta.qlp.next.question.screen);
  }
  // 通常の /mcp では figureUrls を付けない
  const s2 = (await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] })).structuredContent;
  assert.equal((await call(env, 'nextQuestion', { sessionId: s2.sessionId })).structuredContent.question.figureUrls, undefined);
});

test('アプリ：終了ログと引継ぎデータの全文はAIに渡さず、画面に出す', async () => {
  const { forModel } = await import('../src/mcp.js');
  const v = forModel({ minutes: 5, totalMinutes: 9, log: 'LOG', handoff: '引継ぎID：a3txuxxwvj\n中身', display: 'D' });
  assert.equal(v.handoffId, 'a3txuxxwvj');
  assert.equal(v.handoff, undefined);
  assert.equal(v.log, undefined);
  assert.equal(v.display, undefined);
});

test('利用コード：設定を入れるまでは制限なし。入れると、コード無しは断り、コードで入れ、1日の回数で止まる', async () => {
  const env = makeEnv();
  const adminCall = async (b) => (await handle(new Request('https://engine.example/v1/admin/access', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(b) }), env)).json();
  const app = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  // 管理の操作は主のトークンが要る
  assert.equal((await handle(new Request('https://engine.example/v1/admin/access', { method: 'POST', body: '{}' }), env)).status, 401);
  // 制限なし（既定）
  assert.ok(!(await app('startSession', { qualificationId: SRC.qualificationId, sources: [source] })).isError);

  assert.equal((await adminCall({ action: 'config', required: true })).config.required, true);
  assert.equal((await adminCall({ action: 'add', code: 'note-abc123', label: '1人目', dailyLimit: 1 })).ok, true);
  // コード無し・違うコードは断る
  const no = await app('startSession', { qualificationId: SRC.qualificationId, sources: [source] });
  assert.equal(no.isError, true);
  assert.equal(no.structuredContent.error, 'ACCESS_CODE_REQUIRED');
  assert.equal((await app('startSession', { qualificationId: SRC.qualificationId, sources: [source], accessCode: 'wrong-code' })).structuredContent.error, 'ACCESS_CODE_REQUIRED');
  // /mcp（Claude など）は制限しない
  assert.equal((await call(env, 'startSession', { qualificationId: SRC.qualificationId, sources: [source] })).isError, false);

  const ok = (await app('startSession', { qualificationId: SRC.qualificationId, sources: [source], accessCode: 'note-abc123' })).structuredContent;
  assert.ok(ok.sessionId);
  await app('startStudy', { qualificationName: '測量士補', learnerId: ok.learnerId });
  // 同じ学習者は、コードを入れ直さなくてよい
  assert.ok((await app('startSession', { qualificationId: SRC.qualificationId, sources: [source], learnerId: ok.learnerId })).structuredContent.sessionId);
  const q = (await app('nextQuestion', { sessionId: ok.sessionId })).structuredContent.question;
  assert.ok(!(await app('submitAnswer', { sessionId: ok.sessionId, questionId: q.questionId, value: '1' })).isError);
  // 1日1回まで：2問目は止まる。同じ問の再送は数えない
  const q2 = (await app('nextQuestion', { sessionId: ok.sessionId })).structuredContent.question;
  const lim = await app('submitAnswer', { sessionId: ok.sessionId, questionId: q2.questionId, value: '1' });
  assert.equal(lim.structuredContent.error, 'DAILY_LIMIT');
  // 回数を増やせば、続けられる。一覧にコードそのものは出ない
  await adminCall({ action: 'limit', code: 'note-abc123', dailyLimit: 5 });
  assert.ok(!(await app('submitAnswer', { sessionId: ok.sessionId, questionId: q2.questionId, value: '1' })).isError);
  const list = await adminCall({ action: 'list' });
  assert.equal(list.codes[0].usedToday, 2);
  assert.ok(!JSON.stringify(list).includes('note-abc123'));
  // 無効にすると、使っていた人も止まる
  await adminCall({ action: 'disable', code: 'note-abc123' });
  assert.equal((await app('nextQuestion', { sessionId: ok.sessionId })).structuredContent.error, 'ACCESS_CODE_REQUIRED');
});

test('showMenu：免除の確認と学習状況も、エンジンの固定の選択肢で出す', async () => {
  const env = makeEnv();
  const app = async (args) => (await rpc(env, 'tools/call', { name: 'showMenu', arguments: args }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  assert.deepEqual((await app({ kind: 'exempt' }))._meta.qlp.menu.choices, ['免除を利用する', '免除を利用しない']);
  assert.equal((await app({ kind: 'status' }))._meta.qlp.menu.choices.length, 4);
});

test('showMenu旧互換：新規学習の免除・学習状況・学習計画はエンジン画面で進み、AI独自のフォームを作らない', async () => {
  const env = makeEnv();
  const app = async (args) => (await rpc(env, 'tools/call', { name: 'showMenu', arguments: args }, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  assert.match((await app({ kind: 'exempt' })).structuredContent.howToProceed, /エンジンの同じ画面/);
  assert.match((await app({ kind: 'status' })).structuredContent.howToProceed, /ラジオ式の質問を作りません/);
  const instructions = appInstructions();
  assert.match(instructions, /ChatGPT側で学習状況のラジオ式フォーム/);
  assert.match(instructions, /showMenu\(kind=status\/plan\/item\/exempt\)も呼ばない/);
});

test('初期の学習状況・学習計画は枠内の番号ボタンだけで選択し、AIが別の質問を作らない', () => {
  const html = widgetHtml();
  assert.match(html, /m\.choices\.map\(function\(c, i\)\{ return '<button data-n="/);
  assert.match(html, /この学習計画で始める/);
  assert.match(html, /学習計画を見直す/);
  assert.match(html, /初期診断で苦手分野を調べる/);
  assert.match(html, /今は学習しない/);
  assert.match(html, /function onboard\(steps, got\)/);
  assert.match(html, /callTool\('saveProfile'/);
  const tool = TOOLS.find(x => x.name === 'showMenu');
  assert.deepEqual(tool.local({kind:'plan'}).menu.choices, ['この学習計画で始める','学習計画を見直す']);
  assert.match(tool.description, /showMenu\(kind=exempt\/status\/plan\/item\)を呼んではならない/);
});
test('宅建は試験概要の直下に免除→学習状況のボタン、免除なしの資格は学習状況だけ', () => {
  assert.deepEqual(onboardingSteps('q041').map((x) => x.kind), ['exempt', 'status']);
  assert.ok(overviewFor('q041').lines.some((l) => /免除制度：登録講習/.test(l)));
  assert.deepEqual(onboardingSteps('q063').map((x) => x.kind), ['status']);
  assert.ok(!overviewFor('q063').lines.some((l) => /免除制度/.test(l)));
});

test('新しい測量士補は復元要求が届いても試験概要から開始し、別資格の引継ぎIDを上書きしない', async () => {
  const env = makeEnv();
  const callUi = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { path: '/app' })).body.result;
  const takken = (await callUi('startSession', { qualificationId: '宅建', sources: [] })).structuredContent;
  assert.equal(takken.status, 'needPlan');
  const surveyor = (await callUi('startSession', { qualificationId: '測量士補', learnerId: takken.learnerId, sources: [] })).structuredContent;
  assert.equal(surveyor.status, 'needPlan');
  assert.notEqual(surveyor.learnerId, takken.learnerId, '他資格のIDで旧履歴を上書きせず新しい資格に独立したIDを割り当てる');
  assert.deepEqual(surveyor.onboarding.map(x => x.kind), ['status']);

  const restored = (await callUi('restoreStudyView', { sessionId: surveyor.sessionId })).structuredContent;
  assert.equal(restored.status, 'needPlan', '新資格の試験概要を再開済みの空画面へ置き換えない');
  assert.deepEqual(restored.onboarding.map(x => x.kind), ['status']);
  assert.equal(restored.qualificationId, 'q063');

  const previous = (await callUi('importHandoff', { handoff: '引継ぎID：' + takken.learnerId })).structuredContent;
  assert.equal(previous.status, 'resumeReady');
  assert.equal(previous.qualificationId, 'q041', '宅建の保存履歴と測量士補を混在させない');
  const resume = (await callUi('restoreStudyView', { sessionId: previous.sessionId })).structuredContent;
  assert.equal(resume.status, 'resumeReady', '明示的な引継ぎでは従来どおり続きの画面を表示');
  assert.equal(resume.qualificationId, 'q041');

  const fromNow = (await callUi('startSession', { qualificationId: '測量士補', learnerId: surveyor.learnerId, sources: [] })).structuredContent;
  assert.equal(fromNow.status, 'resumeReady', '同じ資格・同じIDの場合だけ学習を再開する');
  assert.equal(fromNow.qualificationId, 'q063');
  const backToTak = (await callUi('startSession', { qualificationId:'宅建', learnerId:surveyor.learnerId, sources:[] })).structuredContent;
  assert.equal(backToTak.qualificationId,'q041');
  assert.equal(backToTak.learnerId,takken.learnerId,'別資格から戻る時は以前の学習者IDと既存の取込みを再利用');
  assert.equal(backToTak.status,'resumeReady');
  const backToSur = (await callUi('startSession', {qualificationId:'測量士補',learnerId:takken.learnerId,sources:[]})).structuredContent;
  assert.equal(backToSur.learnerId,surveyor.learnerId,'同じ所有者の二つの資格間を再往復しても新規IDを発行しない');
  assert.equal(backToSur.status,'resumeReady');
  const resumedStudy = (await callUi('startStudy',{learnerId:surveyor.learnerId,qualificationName:'宅建'})).structuredContent;
  assert.equal(resumedStudy.learnerId,takken.learnerId,'学習開始ボタンからも正しい資格IDに戻る');
});

test('アプリ：前回の学習の記録があっても、新しいセッションは学習の開始（startStudy）をするまで出題しない', async () => {
  let t = T0;
  const env = makeEnv();
  env.clock = () => t;
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const first = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } }));
  const learnerId = first.learnerId;
  await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '宅建', learnerId } });
  t += 60_000;
  // 同じ引継ぎIDで、新しいチャット（新しいセッション）を始める。学習の開始はまだ
  const again = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [], learnerId } }));
  const n1 = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: again.sessionId } });
  assert.equal(n1._meta.qlp.status, 'resumeReady', '再開した学習者には初回の試験概要を表示しない');
  assert.equal(n1._meta.qlp.question, undefined);
  t += 60_000;
  await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '宅建', learnerId } });
  const n2 = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: again.sessionId } });
  assert.notEqual(n2._meta.qlp.status, 'needPlan');
});

test('アプリ：初期診断は、分野と問数を先に示し、過去問をエンジンだけで出して採点し、結果で計画を並べ直す（AIに頼らない）', async () => {
  const env = makeEnv();
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, { answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's2', 's1'], figureOn: [2] });
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: SRC.qualificationId, sources: [source] } }));
  const listed = (await app('tools/list', {})).tools;
  assert.equal(listed.find((t) => t.name === 'diagQuestion'), undefined);
  assert.equal(listed.find((t) => t.name === 'diagStep')._meta['openai/visibility'], 'private');
  const start = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'start' } }));
  assert.equal(start.diag.total, 3);
  assert.deepEqual(start.diag.fields.map((f) => f.count), [2, 1]);
  assert.equal(start.question.label, '初期診断 1/3');
  assert.ok(!JSON.stringify(start).includes('correctAnswer'));
  let q = start.question;
  const seen = [];
  let last;
  for (let i = 0; i < 3; i++) {
    seen.push(q.questionNumber);
    // 測量の分野（s1）は間違え、s2 だけ正解する
    const right = { 1: '3', 2: '1', 3: '4', 4: '2' }[q.questionNumber];
    last = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'answer', questionId: q.questionId, value: q.fieldName === start.diag.fields[1].name ? right : '5' } }));
    if (i === 0) {
      const duplicate = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'answer', questionId: q.questionId, value: '1' } }));
      assert.equal(duplicate.grade.alreadyGraded, true, '同じ問の再送は採点し直さない');
      assert.equal(duplicate.question.questionId, last.question.questionId, '再送で次問へ進まない');
    }
    q = last.question;
  }
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(last.status, 'diagResult');
  assert.equal(last.order[0], start.diag.fields[0].name);
  assert.equal(last.diagResult[0].answered, 2);
  assert.equal(last.diagResult[0].correct, 0);
  const applied = content(await app('tools/call', { name: 'diagStep', arguments: { sessionId: s.learnerId, action: 'apply' } }));
  assert.equal(applied.planReady, true);
  assert.equal(applied.plan.fields[0], start.diag.fields[0].name);
  // 診断のあとも、学習の開始（startStudy）までは実践問題を出さない
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: s.sessionId } });
  assert.equal(n._meta.qlp.status, 'needPlan');
});

test('アプリ：項目開始で選んだ分野から、過去問を出す', async () => {
  const env = makeEnv();
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, { answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's2', 's1'], figureOn: [] });
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const source = { adapter: 'surveyor', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: SRC.qualificationId, sources: [source] } }));
  await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '測量士補', learnerId: s.learnerId } });
  const s2 = CATALOG.surveyor.fields.s2;
  const bad = await app('tools/call', { name: 'chooseItem', arguments: { sessionId: s.learnerId, fieldName: 'ない分野', mode: 'practice' } });
  assert.equal(bad.isError, true);
  const ok = content(await app('tools/call', { name: 'chooseItem', arguments: { sessionId: s.learnerId, fieldName: s2, mode: 'practice' } }));
  assert.equal(ok.mode, 'practice');
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: s.learnerId } });
  assert.equal(n._meta.qlp.question.questionNumber, 3);
});

test('アプリ：免除が適用確定なら免除される問を出さず、学習段階は残す（U02・U03）', async () => {
  const env = makeEnv();
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parse = fakeParser(web, { src: { ...SRC, qualificationId: 'takken' }, answers: Array(47).fill(1), fieldIds: Array(47).fill('t7'), figureOn: [] });
  env.parserFetch = async (u, init) => {
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const r = await parse({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const content = (r) => r.structuredContent ?? JSON.parse(r.content[0].text);
  const source = { adapter: 'takken', year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
  const s = content(await app('tools/call', { name: 'startSession', arguments: { qualificationId: 'takken', sources: [source] } }));
  const steps = onboardingSteps(CATALOG.takken.qualificationId);
  assert.equal(steps[0].prompt, '今回の試験での免除適用状況');
  assert.equal(steps[0].choices.length, 3);
  assert.equal(steps[1].prompt, '今の学習の段階');
  const saved = content(await app('tools/call', { name: 'saveProfile', arguments: { sessionId: s.learnerId, exemption: 'confirmed', stage: 3 } }));
  assert.equal(saved.exemption, 'confirmed');
  const st = content(await app('tools/call', { name: 'startStudy', arguments: { qualificationName: '宅建', learnerId: s.learnerId } }));
  assert.equal(st.learnerStage ?? 3, 3);
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: s.learnerId, question: '2026年度 問46' } });
  assert.equal(n._meta.qlp.status, 'questionUnavailable', '免除対象の指定問を別の問題へ置き換えない');
  assert.equal(n._meta.qlp.question, undefined);
});

test('アプリ：過去問がまだ無いときの初期診断は、取り込み待ちのエラーで返す', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const s = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  const lid = (s.structuredContent ?? JSON.parse(s.content[0].text)).learnerId;
  const r = await app('tools/call', { name: 'diagStep', arguments: { sessionId: lid, action: 'start' } });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.error, 'DIAG_NO_PAST_EXAMS');
});

test('アプリ：宅建を始めると nextQuestion の画面データに試験概要と免除ボタンが入る', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const s = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  const sid = (s.structuredContent ?? JSON.parse(s.content[0].text)).sessionId;
  const n = await app('tools/call', { name: 'nextQuestion', arguments: { sessionId: sid } });
  assert.equal(n._meta.qlp.status, 'needPlan');
  assert.deepEqual(n._meta.qlp.onboarding.map((x) => x.kind), ['exempt', 'status']);
  assert.equal(n._meta.qlp.overview.title, '■試験概要');
  assert.ok(n._meta.qlp.overview.lines.some((l) => /宅建/.test(l)));
});

test('全資格：概要は公式ページの記載（台帳）を出し、出典と未掲載の注記が付く', () => {
  for (const c of Object.values(CATALOG)) {
    // 新規移行した資格はURL台帳だけが根拠。試験時間・合格基準等の未確認情報を
    // 実在する4項目へ水増ししてはならない。
    assert.ok(c.urlCatalog ? Array.isArray(c.overview) : c.overview?.length >= 4, c.name);
    assert.ok(c.overview.every(([k, v]) => k && v), c.name);
    const ov = overviewFor(c.qualificationId);
    assert.equal(ov.title, '■試験概要', c.name);
    assert.ok(ov.lines.some((l) => /^公式：/.test(l)) && ov.lines.includes('参考（非公式）：なし'), c.name);
    assert.ok(ov.lines.some((l) => /^合格基準/.test(l)), c.name);
    assert.match(ov.source, /^https:\/\//);
    if (c.urlCatalog) assert.ok(!ov.lines.some((l) => /PDFを同じ年度|未確認の問題は出題しません|公式問題と正答の確認が完了/.test(l)), c.name);
  }
  assert.ok(overviewFor('q041').lines.some((l) => /試験時間：午後1時〜午後3時/.test(l)));
});

test('アプリ：利用者が添付した過去問PDFを受け取り、保管して取り込みに足す（PDFでないものは断る）', async () => {
  const env = makeEnv();
  const app = async (method, params) => (await rpc(env, method, params, { token: null, path: `/app/${appKey(TOKEN)}` })).body.result;
  const listed = (await app('tools/list', {})).tools.find((t) => t.name === 'attachPdf');
  assert.deepEqual(listed._meta['openai/fileParams'], ['questionPdf', 'answerPdf']);
  const batch = (await app('tools/list', {})).tools.find((t) => t.name === 'attachPdfBatch');
  assert.ok(batch, '10ファイル一括登録ツールが公開される');
  assert.deepEqual(batch._meta['openai/fileParams'], ['questionPdfs', 'answerPdfs']);
  assert.equal(batch.inputSchema.properties.questionPdfs.type, 'array');
  assert.equal(batch.inputSchema.properties.questionPdfs.maxItems, 10);
  assert.deepEqual(batch.inputSchema.properties.questionPdfs.items.required, ['download_url', 'file_id']);
  assert.equal(listed._meta['openai/outputTemplate'], WIDGET_URI, 'PDF登録後は学習操作画面を表示する');
  const statusTool = (await app('tools/list', {})).tools.find((t) => t.name === 'getOfficialLibrary');
  assert.ok(statusTool, 'PDF受付後の照会はAIからも利用できる');
  assert.deepEqual(statusTool._meta.ui.visibility, ['model', 'app']);
  assert.equal(statusTool._meta['openai/outputTemplate'], undefined, '登録状況照会はデータ専用');
  const chatTools = (await rpc(makeEnv(), 'tools/list', {}, {path:'/mcp'})).body.result.tools;
  assert.ok(chatTools.some(t => t.name === 'getOfficialLibrary'), 'モデルから利用可能なツール一覧にも公開');
  assert.match(listed.description, /行政書士など区分が一つだけの資格ではsectionを省略してよい/);
  assert.match(listed.description, /許諾未確認エラーを試験区分エラーと言い換えず/);
  assert.match(batch.description, /添付ターンで直ちに呼び出す/);
  // ChatGPT のファイル受渡し規約。file_id のrequired欠落は登録時INVALID_ARGUMENTになる。
  for (const name of listed._meta['openai/fileParams']) {
    const schema = listed.inputSchema.properties[name];
    assert.equal(schema.type, 'object');
    assert.deepEqual([...schema.required].sort(), ['download_url', 'file_id'],
      `${name}: download_url と file_id の両方を必須とする`);
    assert.deepEqual(Object.keys(schema.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type'].sort());
  }
  const s = await app('tools/call', { name: 'startSession', arguments: { qualificationId: '宅建', sources: [] } });
  const sid = (s.structuredContent ?? JSON.parse(s.content[0].text)).sessionId;
  const bytes = new TextEncoder().encode('%PDF-1.7 attached question 2019');
  env.fetchAttached = async (u) => {
    if (u === 'https://files.example/q.pdf') return bytes;
    if (u === 'https://files.example/a.png') return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    throw new Error('HTTP 404');
  };
  const bad = await app('tools/call', { name: 'attachPdf', arguments: { sessionId: sid, year: 2019, questionPdf: { download_url: 'https://files.example/a.png', file_id: 'f2' } } });
  assert.equal(bad.isError, true);
  assert.equal(bad.structuredContent.error, 'ATTACH_NOT_PDF');
  const r = await app('tools/call', { name: 'attachPdf', arguments: { sessionId: sid, year: 2019, questionPdf: { download_url: 'https://files.example/q.pdf', file_id: 'f1' } } });
  assert.equal(r.isError, false);
  assert.equal(r.structuredContent.status, 'attached');
  assert.match(r._meta.qlp.notice, /2019年度/);
  const added = r._meta.qlp.job.sources.find((x) => x.year === 2019 && /\/v1\/attached\//.test(x.questionUrl));
  assert.match(added.questionUrl, /\/v1\/attached\/[a-f0-9]{64}\.pdf$/);
  assert.equal(added.adapter, 'takken');
  const got = await handle(new Request(added.questionUrl), env);
  assert.equal(got.status, 200);
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), bytes);
  // 年度が無いときは受け取らない
  const noYear = await app('tools/call', { name: 'attachPdf', arguments: { sessionId: sid, year: 0, questionPdf: { download_url: 'https://files.example/q.pdf' } } });
  assert.equal(noYear.structuredContent.error, 'ATTACH_YEAR_REQUIRED');
});

test('画面からチャットに送る文は短い普通の言葉だけ。AIへの手順はアプリのツールの説明にある', () => {
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  const mcp = readFileSync(new URL('../src/mcp.js', import.meta.url), 'utf8');
  // 利用者のチャットに「AIへの指示」が見えないこと
  assert.ok(!html.includes('【順番】'), '画面の送信文に手順を入れない');
  assert.ok(html.includes('var visible = actionLabel || text;'), '会話には操作名だけを渡す');
  assert.ok(html.includes("content:[{type:'text',text:visible}]") && !html.includes('.concat(blocks)'), 'iPhoneの会話へ送るのは照合番号付き短文だけ。根拠は読取ツールから取得');
  assert.ok(!html.includes('setWidgetState'), '保存時に不要な添付を増やさない');
  assert.ok(html.includes('lessonRequestMessage(field, chosen?.lessonRef)'));
  assert.ok(html.includes('lessonRequestMessage(field, lessonRef)'));
  assert.match(html, /照会番号/);
  assert.ok(html.includes('function planEditMenu()'));
  assert.ok(html.includes("callTool('saveStudyPlan'"), '計画確定は学習開始の承認後だけ');
  // 続きのボタンは解説・確認問題の「下」に出す（画面の上に押すボタンを置かない）
  assert.ok(!html.includes('id="toPractice"'));
  // 根拠のない「おすすめ」は付けない／長いURLは枠からはみ出さず折り返す
  assert.ok(!html.includes('苦手分野を調べる（おすすめ）'));
  assert.ok(html.includes('overflow-wrap:anywhere'));
  // 短い文に対するAIの手順は、アプリのツールの説明にある
  assert.ok(mcp.includes('「○○の基礎解説を作成して学習画面に登録してください。」と送ってきたら'));
  assert.ok(mcp.includes('学習計画の見直し・承認・分野開始も枠内のエンジンが処理する'));
  // 最初の公式過去問は画面から直接取得し、取得失敗時も同じ要求で復旧する。
  assert.ok(html.includes('function nextBelow(fallback, say)'));
  assert.ok(html.includes('await fallback();'));
  assert.ok(html.includes('id="nextHere" disabled'));
  assert.ok(!html.includes('出ないときは、ここで次の問題へ'));
  const nextBody = html.slice(html.indexOf('function nextBelow('), html.indexOf('function scrollUp('));
  assert.ok(!nextBody.includes('ask('), '初回出題をChatGPTの再呼び出しに任せない');
  assert.ok(!nextBody.includes("callTool('redisplayQuestion'"), '未出題の問に再表示APIを呼ばない');
  assert.ok(mcp.includes('「○○を実践問題から始めます。」「次の問題へ」と送ってきたら'));
});

test('解説の本文は showMenu の body に入れ、画面のボタンの上（同じ枠）に出る', async () => {
  const mcp = readFileSync(new URL('../src/mcp.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  const show = TOOLS.find((t) => t.name === 'showMenu');
  assert.ok(show.inputSchema.properties.body, 'body を受け付ける');
  const r = show.local({ kind: 'next', body: '## 解説\n- 要点' });
  assert.equal(r.menu.body, '## 解説\n- 要点');
  assert.equal(show.local({ kind: 'next' }).menu.body, undefined);
  assert.equal(show.local({ kind: 'next', body: 'あ'.repeat(17000) }).menu.body.length, 16000);
  assert.ok(mcp.includes('の body に入れて呼ぶ'));
  assert.ok(!mcp.includes('まず答え合わせと解説を書き、最後に showMenu'));
  assert.ok(html.includes('function md(src)') && html.includes('var body = preparedBase +'), '元の教材にAI本文を追加する');
  // 待ち画面（解説は下に出ます）に「終了」ボタンを置かない
  assert.ok(!html.includes("は、この下に出ます。少し待つと文章が出てきます。終わると、その下に進むためのボタンが出ます（出ないときは「次の問題へ」と送ってください）。</div>' + endBar()"));
});

test('問題文は文ごとに段落へ分けて表示する', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('function stemHtml'));
  assert.ok(h.includes('stemHtml(q.stem)'));
});

test('解説の本文のURLは、押して開けるリンクにする', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('target=\\"_blank\\"') || h.includes('target=\\\\"_blank\\\\"') || h.includes('_blank'));
  assert.ok(h.includes('.md a{'));
});

test('解説の依頼に問題文を載せない／新しい画面が出たら古い画面のボタンを押せなくする', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(!h.includes('qtext'));
  assert.ok(h.includes('function lockOld') && h.includes("BroadcastChannel('qlp-fixed-study-frame-v103')") && h.includes('stamp(data);'));
});

test('「今日はここまで」は問題の画面に出さず、解説・次へのメニューと一緒に出す', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('id="endMenu"'));
  assert.ok(!/h \+= endBar\(\);\s*app\.innerHTML = h;\s*scrollUp\(\);/.test(h));
});

test('メニューの「今日はここまで」は、画面から直接 endStudy を呼んで終了する', () => {
  const h = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  assert.ok(h.includes('function saveIds') && h.includes('function loadIds'));
  assert.ok(h.includes("callTool('endStudy', { studyId: lid, sessionId: ids.sid || lid"));
});

test('再表示は読み取り専用で、内部指示を利用者の発言として送らず、終了時には引継ぎ本文を描画する', () => {
  const html = readFileSync(new URL('../src/widget.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const again = TOOLS.find((t) => t.name === 'redisplayQuestion');
  assert.ok(again && again.appOnly && again.uiOnly);
  assert.deepEqual(again.api({ sessionId: 'abc' }), ['GET', '/v1/sessions/abc/redisplay']);
  assert.ok(app.includes('async function redisplayView('));
  const fn = app.split('async function redisplayView(')[1].split('/** 図をもう一度')[0];
  assert.ok(!fn.includes('saveSession(') && !fn.includes('nextView(') && !fn.includes('pin('));
  assert.ok(!html.includes("rpc('ui/update-model-context',{content:blocks})") &&
    html.includes("rpc('ui/message',{role:'user',content:[{type:'text',text:visible}]})"),
    'モデルへの証拠は照合番号経由。iOSの会話に生JSON・添付画像を載せない');
  assert.ok(!html.includes('window.openai.sendFollowUpMessage({ prompt: text })'), '内部依頼文を利用者のチャットへ送らない');
  assert.ok(!html.includes("rpc('ui/message', { role: 'user', content: [{ type: 'text', text: text }] })"));
  assert.ok(html.includes('showEnd(r);'));
  assert.ok(html.includes("typeof r.handoff === 'string'"));
  assert.ok(!html.includes("ask('今日はここまで。学習を終了します。')"));
});
test('最新の画面へ進むと前の問題・解説本文・選択肢を破棄して旧枠を1行へ縮める', () => {
  const html = widgetHtml();
  const start=html.indexOf('function lockOld(){');
  const end=html.indexOf('function stamp(data)',start);
  const fn=html.slice(start,end);
  assert.ok(fn.includes('app.innerHTML =') && fn.includes('old-screen'), '旧DOMを丸ごと破棄する');
  assert.ok(!fn.includes("app.insertAdjacentHTML('beforeend'"),'長い旧解説の下に通知を追加しない');
  assert.ok(!fn.includes("app.style.opacity = '.65'"), '古い問題を半透明のまま残さない');
  assert.ok(html.includes("#app.is-old{height:auto;min-height:0"),'旧枠の高さを縮めて独立スクロールも解除する');
  assert.ok(html.includes("window.addEventListener('storage'"),'iOSではlocalStorageでも画面更新を通知する');
  assert.ok(html.includes("app.classList.remove('is-old')"),'手動で現在の画面を開いたときは旧表示解除');
});

test('解説・次へのメニューには学習ID等を渡せる', () => {
  const show = TOOLS.find((t) => t.name === 'showMenu');
  const r = show.local({ kind: 'next', body: '解説', sessionId: 's1', studyId: 'st1', learnerId: 'l1' });
  assert.equal(r.menu.sessionId, 's1');
  assert.equal(r.menu.studyId, 'st1');
  assert.equal(r.menu.learnerId, 'l1');
});

test('AI作成確認問題は出題時の正答固定を行い、AIには画面の本文・選択肢を再配布しない', async () => {
  const { forModel } = await import('../src/mcp.js');
  const { WIDGET_URI } = await import('../src/widget.js');
  const reg = TOOLS.find((t) => t.name === 'registerRemediationQuestion');
  const answer = TOOLS.find((t) => t.name === 'completeRemediation');
  assert.ok(reg && reg.appOnly && !reg.uiOnly);
  assert.ok(answer && answer.appOnly && answer.uiOnly);
  assert.deepEqual(reg.api({ sessionId: 'abc', question: '確認問題の長い本文です。どれが適切ですか？',
    choices: ['選択肢1','選択肢2'], correctAnswer: 2 }),
    ['POST', '/v1/sessions/abc/remediation/register',
      { question: '確認問題の長い本文です。どれが適切ですか？', choices: ['選択肢1','選択肢2'], correctAnswer: 2 }]);
  assert.deepEqual(answer.api({ sessionId: 'abc', challengeId: 'id1', selected: '2' }),
    ['POST', '/v1/sessions/abc/remediation/complete', { challengeId: 'id1', selected: '2' }]);
  const result = forModel({ status: 'remediation_question', question: '問題本文', choices: ['A','B'],
    sessionId: 'abc', challengeId: 'id1', correctAnswer: 2 });
  assert.equal(result.question, undefined);
  assert.equal(result.choices, undefined);
  assert.equal(result.correctAnswer, undefined);
  assert.equal(result.challengeId, 'id1');
  assert.match(WIDGET_URI, /^ui:\/\/qlp\/question-v\d+\.html$/, '画面版は変更ごとに更新でき、ツールと画面が同じURIを参照する');
});

test('解説の表示：旧SVGコードは除去し、正誤は大きな結果見出しで表示する', () => {
  const menu = TOOLS.find((t) => t.name === 'showMenu').local({
    kind: 'next', body: '結論：国土交通大臣です。\n<svg xmlns="http://www.w3.org/2000/svg"><rect width="40"/></svg>\n| 項目 | 担当 |\n| --- | --- |\n| 承認 | 大臣 |',
  });
  assert.doesNotMatch(menu.menu.body, /<svg|<rect|<\/svg>/);
  assert.match(menu.menu.body, /国土交通大臣/);
  assert.match(menu.menu.body, /\| 承認 \| 大臣 \|/);
  const html = widgetHtml();
  assert.match(html, /grade-word.*正解！/);
  assert.match(html, /✕ 不正解/);
  assert.match(html, /gradeBanner\(g, label\)/);
  assert.match(html, /result-grade/);
});

// 土地家屋調査士の過去実装（PDF検証・図抽出）は現行エンジンに未接続。
// ただし試験概要からの導入・午前免除の分野除外・AI確認問題を先に進められることを確認する。
test('土地家屋調査士：試験概要→免除と学習状況→午後中心の計画→開始→解析不可を明示→AI確認問題', async () => {
  const env = makeEnv();
  const app = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { path: '/app' })).body.result;
  const started = await app('startSession', { qualificationId: '土地家屋調査士', sources: [] });
  assert.equal(started.isError, undefined, '土地家屋調査士が開始時に未登録扱いされない');
  const full = started._meta.qlp;
  assert.equal(full.status, 'needPlan');
  assert.equal(full.overview.title, '■試験概要');
  assert.match(full.overview.lines.join('\n'), /午前の部/);
  assert.deepEqual(full.onboarding.map((q) => q.kind), ['exempt', 'status']);
  assert.equal(full.job, null, 'PDF解析ジョブを未対応なのに起動しない');
  assert.equal(started.structuredContent.overview.title, '■試験概要', '初期概要はUI優先で、iOSが_metaを落としても使える');

  const sid = full.sessionId, lid = full.learnerId;
  assert.equal((await app('nextQuestion', { sessionId: sid }))._meta.qlp.status, 'needPlan', '開始承認を飛ばせない');
  const profile = await app('saveProfile', { sessionId: sid, exemption: 'confirmed', stage: 4 });
  assert.equal(profile.structuredContent.status, 'profile');
  const afternoon = Object.values(CATALOG.land_surveyor.fields).slice(2);
  const plan = await app('saveStudyPlan', { sessionId: sid, orderedFields: afternoon, methodChoice: 'balanced', reviewPreset: 'ai' });
  assert.equal(plan.structuredContent.status, 'planSaved');
  assert.deepEqual(plan.structuredContent.orderedFields, afternoon);
  const begun = await app('startStudy', { qualificationName: '土地家屋調査士', learnerId: lid });
  assert.equal(begun.structuredContent.learnerId, lid);
  const skipped = await app('chooseItem', { sessionId: sid, fieldName: CATALOG.land_surveyor.fields.l1, mode: 'check' });
  assert.equal(skipped.isError, true, '午前免除後は午前分野を選べない');
  const choose = await app('chooseItem', { sessionId: sid, fieldName: afternoon[0], mode: 'practice' });
  assert.equal(choose.structuredContent.status, 'item');
  const view = (await app('nextQuestion', { sessionId: sid }))._meta.qlp;
  assert.equal(view.status, 'sourceUnavailable');
  assert.equal(view.fieldName, afternoon[0]);
  assert.match(view.notice, /添付すると原本を照合/);
  assert.deepEqual(view.sharedLibrary.stored, [], '未保存の年度を保存済みと表示しない');
  assert.equal(view.sharedLibrary.missing.length, 22);
  assert.equal((await app('nextQuestion', { sessionId: sid })).structuredContent.sharedLibrary, undefined,
    '保存状況の詳細や内部照会情報をAIの会話へ流さない');
  assert.doesNotMatch(view.notice, /準備していま/);
  const restored = (await app('restoreStudyView', { sessionId: sid }))._meta.qlp;
  assert.equal(restored.status, 'sourceUnavailable');
  assert.equal(restored.fieldName, afternoon[0]);
  const ai = await app('chooseItem', { sessionId: sid, fieldName: afternoon[0], mode: 'check' });
  assert.equal(ai.structuredContent.status, 'item');
  const question = await app('registerConfirmationQuestion', { sessionId: sid,
    question: '土地家屋調査士の学習用に作成した確認問題です。', choices: ['選択肢1', '選択肢2', '選択肢3'], correctAnswer: 2 });
  assert.equal(question._meta.qlp.status, 'confirmation_question');
  assert.equal(question.structuredContent.question, undefined, 'AI作成確認問題はプライベート画面に表示する');
});


// エンジン・画面までの配線試験。パーサーの実際のPDF照合は別のPython単体試験と
// 手元の2025年度の本物PDFのSHA確認で検査し、ここでは決して偽物を公式と認定しない。
test('土地家屋調査士2022〜2025：添付の部・年度・正答を確認し、学習承認後に画面で出題／固定正答採点する', async () => {
  for (const year of [2022, 2023, 2024, 2025]) {
  const env = makeEnv();
  const answer = pdf(`land-surveyor-${year}-answer`);
  const question = pdf(`land-surveyor-${year}-afternoon`);
  env.fetchAttached = async (url) => url.endsWith('answer.pdf') ? answer : question;
  env.parserFetch = async (_url, init) => {
    const b = JSON.parse(init.body);
    const bytes = (part) => Uint8Array.from(atob(part.base64), (c) => c.charCodeAt(0));
    const src = { qualificationId: 'land_surveyor', adapter: b.adapter, year: b.year, section: b.section,
      questionUrl: b.question.url, answerUrl: b.answer.url };
    const parsed = await fakeResult({ src, qBytes: bytes(b.question), aBytes: bytes(b.answer),
      answers: year === 2022 ? [4, 1, 4] : year === 2023 ? [2, 1, 4] : year === 2024 ? [4, 5, 2] : [1, 5, 2], fieldIds: ['l3', 'l3', 'l3'], figureOn: [1] });
    return new Response(JSON.stringify({ result: parsed.result, assets: assetsB64(parsed.assets) }));
  };
  const callUi = async (name, args) => (await rpc(env, 'tools/call',
    { name, arguments: args }, { path: '/app' })).body.result;
  const open = await callUi('startSession', { qualificationId: '土地家屋調査士', sources: [] });
  const { sessionId, learnerId } = open._meta.qlp;
  const profile = await callUi('saveProfile', { sessionId, exemption: 'confirmed', stage: 4 });
  assert.equal(profile.structuredContent.status, 'profile');
  const order = Object.values(CATALOG.land_surveyor.fields).slice(2);
  assert.equal((await callUi('saveStudyPlan', { sessionId, orderedFields: order,
    methodChoice: 'practice', reviewPreset: 'standard' })).structuredContent.status, 'planSaved');
  assert.equal((await callUi('startStudy', { learnerId, qualificationName: '土地家屋調査士' })).structuredContent.learnerId, learnerId);
  const before = await callUi('nextQuestion', { sessionId });
  assert.equal(before._meta.qlp.status, 'sourceUnavailable');
  const source = { download_url: 'https://attachment.example/afternoon.pdf' };
  const key = { download_url: 'https://attachment.example/answer.pdf' };
  const bad = await callUi('attachPdf', { sessionId, year: 2014, section: '午後の部', questionPdf: source, answerPdf: key });
  assert.equal(bad.isError, true, '未照合年度を誤って取り込まない');
  const noSection = await callUi('attachPdf', { sessionId, year, questionPdf: source, answerPdf: key });
  assert.equal(noSection.isError, true, '午前午後の区分がない場合は取り込まない');
  const noAnswer = await callUi('attachPdf', { sessionId, year, section: '午後の部', questionPdf: source });
  assert.equal(noAnswer.isError, true, '正答PDFのない採点を始めない');
  const imported = await callUi('attachPdf', { sessionId, year, section: '午後の部', questionPdf: source, answerPdf: key });
  assert.equal(imported.structuredContent.status, 'attached', JSON.stringify(imported.structuredContent));
  const choose = await callUi('chooseItem', { sessionId, fieldName: order[0], mode: 'practice' });
  assert.equal(choose.structuredContent.status, 'item');
  const pending = await callUi('nextQuestion', { sessionId });
  const view = pending._meta.qlp;
  assert.equal(view.status, 'question', JSON.stringify(view));
  assert.equal(view.question.questionId, `land_surveyor:${year}:午後の部:1`);
  assert.equal(view.question.fieldName, order[0]);
  assert.ok(view.question.figures.length >= 1, '公式図の画像を実践画面に結び付ける');
  assert.equal(pending.structuredContent.question?.figureUrls, undefined, 'AIに図のURLを誤配布しない');
  const result = await callUi('submitAnswer', { sessionId, questionId: view.question.questionId, value: String(year === 2022 ? 4 : year === 2023 ? 2 : year === 2024 ? 4 : 1) });
  assert.equal(result._meta.qlp.grade.correct, true, '出題時の固定正答だけで採点する');
  const again = await callUi('restoreStudyView', { sessionId });
  assert.equal(again._meta.qlp.status, 'restoredGrade', '復元時に再採点しない');
  }
});

test('共有公式過去問：同じ検証済み原本を別の学習者が再添付なしで解き、未保存の年度だけ表示する', async () => {
  const env = makeEnv();
  const cat = CATALOG.land_surveyor;
  const pins = cat.officialPdfPins[2025];
  const qsha = pins['午後の部'];
  const p = {
    qualificationId: cat.qualificationId, year: 2025, section: '午後の部',
    questionSha256: qsha, answerSha256: pins.answer,
    parserVersion: '0.8.2', owner: '_shared',
  };
  const figureSha = await sha256Hex(PNG);
  const packets = Array.from({ length: 20 }, (_, i) => ({
    questionId: `land_surveyor:2025:午後の部:${i + 1}`,
    qualificationId: 'land_surveyor', year: 2025, section: '午後の部',
    questionNumber: i + 1, fieldId: 'l3', stemMode: 'official_image',
    choiceMode: 'official_image', stem: '原本問題の画像を読んでください。',
    choices: ['1','2','3','4','5'], correctAnswer: 1,
    questionPdfSha256: qsha, answerPdfSha256: pins.answer,
    questionPdfUrl: 'https://moj.go.jp/paper/2025/afternoon.pdf',
    answerPdfUrl: 'https://moj.go.jp/paper/2025/answer.pdf',
    figures: [{ file: 'q.png', sha256: figureSha, width: 10, height: 10 }],
    evidence: { questionPdfPages: [i + 4] },
  }));
  const parsed = { status: 'ready', qualificationId: 'land_surveyor',
    year: 2025, section: '午後の部', parserVersion: '0.8.2',
    questionPdfSha256: qsha, answerPdfSha256: pins.answer,
    packetCount: 20, excluded: [], packets };
  const empty = await officialLibrary(env.STORE, cat, '0.8.2', T0);
  assert.deepEqual(empty.stored, []);
  assert.equal(empty.missing.length, 22, '対応年度と共通保存済みは異なる');
  assert.equal(empty.descriptive.totalQuestions,57,'記述式19年度×午前1問・午後2問は択一の保存状況と独立に出題対応');
  assert.equal(empty.descriptive.years.length,19);
  assert.equal(empty.descriptive.byYear[2015]['午前の部'],1);
  assert.equal(empty.descriptive.byYear[2020]['午後の部'],2);
  assert.equal(empty.descriptive.byYear[2007]['午前の部'],1);
  assert.equal(empty.descriptive.byYear[2008]['午後の部'],2);
  assert.equal(empty.descriptive.gradingMode,'none','記述式の採点を有効にしない');
  assert.equal(empty.totalQuestions,0,'記述式57問を択一式の採点可能件数に混ぜない');

  // SHAが異なる保存内容は共有の年度一覧に出さない。
  await writeResult(env.STORE, { ...p, questionSha256: 'a'.repeat(64) },
    parsed, { 'q.png': PNG }, T0);
  assert.equal((await officialLibrary(env.STORE, cat, '0.8.2', T0)).stored.length, 0);
  await writeResult(env.STORE, p, parsed, { 'q.png': PNG }, T0);
  const shared = await officialLibrary(env.STORE, cat, '0.8.2', T0);
  assert.deepEqual(shared.stored, [{ year: 2025, section: '午後の部', questions: 20, writtenQuestions: 2 }]);
  assert.equal(shared.completeYears.length, 0, '午前が未保存なら年度全体は保存済みと呼ばない');
  assert.equal(shared.missing.length, 21);

  let fetched = 0;
  env.fetchAttached = async () => { fetched += 1; throw new Error('SHOULD_NOT_FETCH_ATTACHMENT'); };
  const app = async (name,args) => (await rpc(env,'tools/call',{name,arguments:args},{path:'/app'})).body.result;
  for (let n = 0; n < 2; n++) {
    const started = await app('startSession', { qualificationId: '土地家屋調査士', sources: [] });
    assert.ok(started?._meta?.qlp, 'startSession must return app UI metadata: ' + JSON.stringify(started));
    const { sessionId, learnerId, overview } = started._meta.qlp;
    assert.equal(overview.sharedLibrary.totalQuestions, 20);
    assert.equal(overview.sharedLibrary.descriptive.totalQuestions,57,'導入画面へ記述式の対応状況を渡す');
    assert.deepEqual(overview.sharedLibrary.missing.filter(x=>x.year===2025),
      [{ year: 2025, section: '午前の部' }]);
    const published = await app('getOfficialLibrary', { sessionId });
    assert.equal(published._meta.qlp.sharedLibrary.totalQuestions,20);
    assert.equal(published.structuredContent.sharedLibrary, undefined, '画面用データをAIに重複掲示させない');
    const duplicate = await app('attachPdf', {
      sessionId, year: 2025, section: '午後の部',
      questionPdf: { download_url:'https://bad.example/no.pdf' },
      answerPdf: { download_url:'https://bad.example/none.pdf' },
    });
    assert.equal(duplicate.structuredContent.status,'attachedAlready');
    assert.equal(fetched,0);
    await app('saveProfile', { sessionId, exemption:'confirmed', stage: 4 });
    const plan = await app('saveStudyPlan', { sessionId, orderedFields: Object.values(cat.fields).slice(2),
      methodChoice:'practice', reviewPreset:'standard' });
    assert.equal(plan.structuredContent.status,'planSaved');
    const startedStudy = await app('startStudy',{qualificationName:'土地家屋調査士',learnerId});
    assert.equal(startedStudy.structuredContent.learnerId,learnerId);
    const chosen = await app('chooseItem',{sessionId,fieldName:cat.fields.l3,mode:'practice'});
    assert.equal(chosen.structuredContent.status,'item');
    const q = await app('nextQuestion', { sessionId });
    assert.equal(q._meta.qlp.status,'question');
    assert.equal(q._meta.qlp.question.year,2025);
    assert.equal(q._meta.qlp.question.questionNumber,1);
    assert.ok(q._meta.qlp.question.figures.length, '全員に共有図が表示される');
    assert.equal(fetched,0);
    const grade = await app('submitAnswer',{
      sessionId, questionId:q._meta.qlp.question.questionId,value:'1'
    });
    assert.equal(grade._meta.qlp.grade.correct,true);
  }
  const clean = await officialLibrary(env.STORE,cat,'0.8.2',T0);
  assert.equal(clean.stored.length,1,'個人の問題進捗で共有の数を変更しない');
});

test('PDF未添付のボタンはAIへの会話メッセージを起動せず、学習画面内で直接PDFを送信する', () => {
  const html = widgetHtml();
  const a = html.indexOf("document.getElementById('sourceAttach').onclick");
  const b = html.indexOf("document.getElementById('sourceAiCheck').onclick",a);
  assert.ok(a > 0 && b > a);
  const block = html.slice(a,b);
  assert.ok(!block.includes("ask("), '空の取り込み依頼を会話へ送信してはいけない');
  assert.ok(block.includes('sourceLocalUpload'), '画面内のiPhoneファイル選択を表示する');
  assert.ok(block.includes('attachPdfBatchFromPicker'), '選択されたPDFをモデルに依存せず登録ツールへ渡す');
  assert.ok(block.includes('最大10ファイル'), '一括上限を利用者へ明示する');
  assert.ok(html.includes('利用可能（'), '検証済み年度と利用可能問題数のみを表示する');
  assert.ok(html.includes('公式問題・正答PDFを登録する'));
  assert.ok(!html.includes('共有保存状況を更新して'), '内部共有の選択肢は出さない');
  assert.ok(!html.includes('登録済みの公式過去問URL記録'), '内部URL台帳の件数は表示しない');
  assert.ok(html.includes('過去問をもう一度確認する'));
});


test('資格別の共有年度・試験区分の表示とAI個別解説の起動は固定', () => {
  const html = widgetHtml();
  assert.match(html, /sectionsByYear/, '資格ごとに保存している区分を使用する');
  assert.doesNotMatch(html, /\['午前の部', '午後の部'\]\.map/, '全資格に午前・午後を一律に追加しない');
  assert.match(html, /利用可能（/, '本当に利用できる年度だけを表示する');
  assert.match(html, /async function loadExplanation\(questionId, requestAi\)/);
  assert.match(html, /await callTool\('explainSpec', args\)/, '採点済み問題をエンジンから確認する');
  assert.match(html, /await requestAdaptiveExplanation\(ctx\)/, 'AIの理解度別解説を初回も呼び出す');
  assert.match(html, /await waitForPublishedExplanation\(ctx.sessionId, ctx.question.questionId\)/, '解説の保存完了まで追跡する');
  assert.match(html, /loadExplanation\(q.questionId, true\)/, '解説ボタンは本人の問題IDを渡す');
});

test('解説ありは解説を先に保存・復元し、確認問題は利用者の操作後だけ開始する', async () => {
  const env = makeEnv({ answers: [3, 1, 4], fieldIds: ['s1', 's1', 's1'], figureOn: [] });
  const app = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { path: '/app' })).body.result;
  const start = await app('startSession', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const sessionId = start.structuredContent.sessionId;
  const learnerId = start.structuredContent.learnerId;
  await app('startStudy', { learnerId, qualificationName: '測量士補' });
  const fieldName = CATALOG[SRC.qualificationId].fields.s1;
  const chosen = (await app('chooseItem', { sessionId, fieldName, mode: 'explain' })).structuredContent;
  assert.equal(chosen.mode, 'explain');
  assert.match(chosen.lessonRef, /^L-[A-Za-z0-9_-]{16}$/);
  const before = (await app('restoreStudyView', { sessionId }))._meta.qlp;
  assert.equal(before.status, 'lesson_pending', '解説を表示する前に確認問題へ飛ばない');
  assert.equal(before.lessonRef, chosen.lessonRef, '照会番号は元の学習枠へ復元される');
  const repeatedExplain = (await app('chooseItem', { sessionId, fieldName, mode:'explain' })).structuredContent;
  assert.equal(repeatedExplain.lessonRef, chosen.lessonRef, '二重タップでも同じ解説依頼を保持しAIの登録先を失わない');
  const stored = JSON.parse(await env.STORE.get('ses/' + sessionId));
  const original = stored.state;
  assert.equal(original.confirmation ?? null, null, '解説時に確認問題は未開始');
  // 保存領域は {savedAt,state} 形式。旧版の確認問題状態だけを再現する。
  await env.STORE.put('ses/' + sessionId, JSON.stringify({ ...stored, state: { ...original,
    confirmation: { fieldId: original.set.fieldId, count: 0, correct: 0, challenge: null } } }));
  const legacy = (await app('restoreStudyView', { sessionId }))._meta.qlp;
  assert.equal(legacy.status, 'lesson_pending', '旧版の偽の確認問題状態は表示しない');

  const lessonBody = '## 必修問題の解説\n必要な原則を具体例とともに説明します。最初に要点を読み、理解を確認してから確認問題3問へ進みます。';
  // 開始セッションIDがモデルに見えていなくても照会番号だけで解説登録できる。
  const lesson = await app('showMenu', { kind: 'lesson', lessonRef:chosen.lessonRef, body: lessonBody });
  assert.equal(lesson.isError, undefined, JSON.stringify(lesson));
  assert.equal(lesson._meta.qlp.menu.body, lessonBody);
  const duplicate = await app('showMenu', { kind:'lesson', lessonRef:chosen.lessonRef, body:'別の説明で先ほどの解説を上書きしようとしても、表示済みの教材は変更されません。' });
  assert.equal(duplicate._meta.qlp.menu.body, lessonBody, '同じ照会番号の再送は上書きしない');
  const restored = (await app('restoreStudyView', { sessionId }))._meta.qlp;
  assert.equal(restored.status, 'menu', '画面再開時は確認問題でなく解説を復元');
  assert.equal(restored.menu.kind, 'lesson');
  assert.equal(restored.menu.body, lessonBody);
  assert.deepEqual(restored.menu.actions, ['check', 'end']);

  const check = (await app('chooseItem', { sessionId, fieldName, mode: 'check' })).structuredContent;
  assert.equal(check.mode, 'check');
  const replay = await app('showMenu', { kind:'lesson', lessonRef:chosen.lessonRef, body:lessonBody });
  assert.equal(replay.isError, true, '確認問題開始後の古い照会番号は拒否される');
  assert.equal(replay.structuredContent.error, 'LESSON_NOT_ACTIVE');
  const pending = (await app('restoreStudyView', { sessionId }))._meta.qlp;
  assert.equal(pending.status, 'confirmation_pending');
  assert.equal(pending.position, 1);
  // 同じ開始操作を再送しても問題数や登録済み問題を巻き戻さない。
  const question = (await app('registerConfirmationQuestion', {
    sessionId, question: '測量に関する法規について正しい選択肢を選んでください。',
    choices: ['選択肢A', '選択肢B', '選択肢C'], correctAnswer: 2,
  }))._meta.qlp;
  assert.equal(question.status, 'confirmation_question');
  await app('chooseItem', { sessionId, fieldName, mode: 'check' });
  const same = (await app('restoreStudyView', { sessionId }))._meta.qlp;
  assert.equal(same.challengeId, question.challengeId);
  assert.equal(same.position, 1);
});


test('AI解説の照会番号は当該分野・最新依頼だけに紐づき、古い番号から学習状態を変えられない', async () => {
  const env = makeEnv({ answers: [3, 1, 4], fieldIds: ['s1', 's1', 's1'], figureOn: [] });
  const app = async (name, args) => (await rpc(env, 'tools/call', { name, arguments: args }, { path: '/app' })).body.result;
  const start = await app('startSession', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const sessionId = start.structuredContent.sessionId;
  await app('startStudy', { learnerId: start.structuredContent.learnerId, qualificationName: '測量士補' });
  const fieldName = CATALOG[SRC.qualificationId].fields.s1;
  const first = (await app('chooseItem', { sessionId, fieldName, mode: 'explain' })).structuredContent;
  const repeat = (await app('chooseItem', { sessionId, fieldName, mode: 'explain' })).structuredContent;
  assert.equal(repeat.lessonRef, first.lessonRef, '二重タップでは照会番号を変えない');
  await app('chooseItem', { sessionId, fieldName, mode: 'check' });
  const latest = (await app('chooseItem', { sessionId, fieldName, mode: 'explain' })).structuredContent;
  assert.notEqual(first.lessonRef, latest.lessonRef, '学習方法を変更して再び解説を開始したときは新しい照会番号を作る');
  const textBody = '## 測量に関する法規の基礎解説\n公式の手続を読み、測量の基本原則と法的効果の区別を理解します。具体例で確かめて確認問題へ進みます。';
  const stale = await app('showMenu', { kind: 'lesson', lessonRef: first.lessonRef, body: textBody });
  assert.equal(stale.isError, true);
  assert.equal(stale.structuredContent.error, 'LESSON_REQUEST_STALE');
  const unknown = await app('showMenu', { kind: 'lesson', lessonRef: 'L-0000000000000000', body: textBody });
  assert.equal(unknown.isError, true);
  assert.equal(unknown.structuredContent.error, 'LESSON_REQUEST_NOT_FOUND');
  const pending = (await app('getStudySnapshot', { sessionId })).structuredContent;
  assert.equal(pending.status, 'lesson_pending');
  assert.equal(pending.lessonRef, latest.lessonRef, '不正な解説登録で最新依頼を変えない');
  const good = await app('showMenu', { kind: 'lesson', lessonRef: latest.lessonRef, body: textBody });
  assert.equal(good.isError, undefined, JSON.stringify(good));
  assert.equal(good._meta.qlp.menu.body, textBody);
  const saved = (await app('getStudySnapshot', { sessionId })).structuredContent;
  assert.equal(saved.status, 'menu');
  assert.equal(saved.menu.sessionId, sessionId);
  assert.equal(saved.menu.body, textBody);
});


test('行政書士の内蔵基礎教材は全6分野・各3問、正答と簡易解説を事前確定している', () => {
  const fields = Object.values(CATALOG.gyosei.fields);
  assert.deepEqual(Object.keys(PREPARED_LESSONS).sort(), fields.slice().sort());
  for(const field of fields){
    const entry = PREPARED_LESSONS[field];
    assert.ok(entry.intro.length >= 3, field + ': 導入の要点');
    assert.ok(entry.example.length >= 15 && entry.pitfall.length >= 15, field + ': 具体例と注意点');
    assert.equal(entry.questions.length, 3, field + ': 確認3問');
    for(const q of entry.questions){
      assert.ok(q.question.length >= 10);
      assert.equal(q.choices.length, 3);
      assert.ok(Number.isInteger(q.correctAnswer) && q.correctAnswer >= 1 && q.correctAnswer <= 3);
      assert.ok(q.explanation.length >= 12);
      assert.ok(q.choices.every(c => c.length > 0));
    }
  }
  const html = widgetHtml();
  assert.match(html, /基礎解説（学習システム内蔵）/);
  assert.match(html, /AI詳細解説を追加/);
  assert.match(html, /registerPreparedConfirmation/);
  assert.match(html, /if \(!preparedLessons\[field\]\) ask\(lessonRequestMessage/);
  assert.match(html, /理解度を確かめる練習問題です（公式過去問ではありません）/);
  assert.doesNotMatch(html, /問題は新しい学習枠に表示されます/);
});

test('行政書士：学習枠がAIを呼ばずに3問をエンジンに登録し、正誤・簡易解説・完了を保持する', async () => {
  const env = makeEnv();
  const app = async (name,args) => (await rpc(env,'tools/call',{name,arguments:args},{path:'/app'})).body.result;
  const started = await app('startSession',{qualificationId:'行政書士',sources:[]});
  assert.equal(started.isError,undefined,JSON.stringify(started));
  const {sessionId,learnerId} = started.structuredContent;
  const open = await app('startStudy',{learnerId,qualificationName:'行政書士'});
  assert.equal(open.isError,undefined,JSON.stringify(open));
  const fieldName = '基礎法学';
  const explained = await app('chooseItem',{sessionId,fieldName,mode:'explain'});
  assert.equal(explained.structuredContent.mode,'explain');
  assert.match(explained.structuredContent.lessonRef,/^L-[A-Za-z0-9_-]{16}$/);
  const pending = (await app('getStudySnapshot',{sessionId})).structuredContent;
  assert.equal(pending.status,'lesson_pending');
  const check = await app('chooseItem',{sessionId,fieldName,mode:'check'});
  assert.equal(check.structuredContent.mode,'check');
  const bank = PREPARED_LESSONS[fieldName].questions;
  for(let i=0;i<3;i++){
    const q=bank[i];
    const given = await app('registerConfirmationQuestion',{
      sessionId,question:q.question,choices:q.choices,correctAnswer:q.correctAnswer,explanation:q.explanation
    });
    assert.equal(given.isError,undefined,JSON.stringify(given));
    assert.equal(given._meta.qlp.status,'confirmation_question');
    assert.equal(given._meta.qlp.position,i+1);
    const graded = await app('answerConfirmationQuestion',{
      sessionId,challengeId:given._meta.qlp.challengeId,selected:String(q.correctAnswer)
    });
    assert.notEqual(graded.isError,true,JSON.stringify(graded));
    assert.equal(graded.structuredContent.correct,true);
    assert.equal(graded.structuredContent.explanation,q.explanation);
    assert.equal(graded.structuredContent.complete,i===2);
  }
  const restored = await app('restoreStudyView',{sessionId});
  assert.equal(restored._meta.qlp.status,'confirmation_result');
  assert.equal(restored._meta.qlp.correctCount,3);
  assert.equal(restored._meta.qlp.complete,true);
});

test('異なる未連結の学習者IDには、本人専用PDF取込み履歴と年度を絶対表示しない',async()=>{
  const env=makeEnv();
  const app=async(name,args)=>(await rpc(env,'tools/call',{name,arguments:args},{path:'/app'})).body.result;
  const a=(await app('startSession',{qualificationId:'行政書士',sources:[]})).structuredContent;
  const b=(await app('startSession',{qualificationId:'行政書士',sources:[]})).structuredContent;
  assert.notEqual(a.learnerId,b.learnerId);
  const ownJobId='q090~'+a.learnerId;
  const job={
    qualificationId:ownJobId,persistent:true,state:'done',startedAt:100,updatedAt:200,
    sources:[{year:2025,section:'年度共通',status:'done',packetCount:45,
      questionUrl:'https://private.example/a.pdf',answerUrl:'https://official.example/ans.html',
      importEvents:[{at:100,status:'registered'},{at:200,status:'done',questions:45}]}],
  };
  await env.STORE.put('job/'+encodeURIComponent(ownJobId),JSON.stringify(job));
  const va=(await app('getOfficialLibrary',{sessionId:a.sessionId}))._meta.qlp;
  const vb=(await app('getOfficialLibrary',{sessionId:b.sessionId}))._meta.qlp;
  assert.deepEqual(va.personalUploadedYears,[2025]);
  assert.equal(va.importHistory[0].events.length,2);
  assert.deepEqual(vb.personalUploadedYears,[]);
  assert.deepEqual(vb.importHistory,[],'別利用者の登録・失敗・再試行履歴も非表示');
  assert.doesNotMatch(JSON.stringify(va.importHistory),/https:\/\/private|learnerId|questionUrl|answerUrl/);
});

test('本人専用の過去問取り込み画面は確認問題へ誘導せず、登録済み問題の操作だけを出す',()=>{
  const html=widgetHtml();
  assert.match(html,/readyYearDetails/);
  assert.match(html,/licensedStart/);
  const licensedStart=html.indexOf("if (data.status === 'sourceUnavailable' && data.permissionedUpload)");
  const licensedEnd=html.indexOf("if (data.status === 'sourceUnavailable')",licensedStart+1);
  const licensedScreen=html.slice(licensedStart,licensedEnd);
  assert.ok(licensedStart >= 0 && licensedEnd > licensedStart);
  assert.doesNotMatch(licensedScreen,/licensedCheck/);
  assert.doesNotMatch(licensedScreen,/確認問題へ（3問）/);
  assert.match(html,/登録状況は自動で更新します/);
  assert.doesNotMatch(html,/id="licensedRefresh"/);
  assert.doesNotMatch(html,/id="licensedAi"/);
});

test('本人専用PDFの検証結果を見てから学習の次の選択肢を提示する',()=>{
  const queued=forModel({status:'attachedBatch',sessionId:'s1',queued:6,failed:0});
  assert.equal(queued.status,'attachedBatch');
  assert.match(queued.howToProceed,/登録依頼は完了ではありません/);
  const pending=forModel({status:'officialLibrary',sessionId:'s1',permissionedUpload:true,
    importingYears:[2020,2021],readyYearDetails:[]});
  assert.deepEqual(pending.nextChoices,[]);
  const done=forModel({status:'officialLibrary',sessionId:'s1',permissionedUpload:true,
    readyYearDetails:[{year:2020,questions:49,excluded:1}],importingYears:[2021]});
  assert.deepEqual(done.readyYears,[{year:2020,questions:49,excluded:1}]);
  assert.deepEqual(done.nextChoices,['公式過去問を解く']);
  assert.equal(done.readyYears.length,1,'解析中の年度を登録済みと数えない');
});

test('資格名付きアプリ起動はエンジン必須で汎用学習メニューへの代替を禁止',()=>{
  const text = readFileSync(new URL('../../deploy/gpt-instructions.txt',import.meta.url),'utf8');
  assert.equal(INSTRUCTIONS,text,'MCPに配布する指示は正本と一致');
  assert.match(text,/回答本文・選択肢・フォーム・学習メニューを一切生成する前に必ず startSession/);
  assert.match(text,/通常のChatGPTメニューにフォールバックせず/);
  assert.match(text,/汎用メニューは仕様違反として出力禁止/);
  const startup=TOOLS.find(x=>x.name==='startSession');
  assert.match(startup.description,/起動ゲート/);
  assert.match(startup.description,/汎用メニューへフォールバックしない/);
  assert.match(appInstructions(),/startSession/);
});

test('v132 利用者選択のPDF登録は学習枠からだけ呼べ、AIからは呼べない', async()=>{
  const env = makeEnv();
  const appTools = (await rpc(env,'tools/list',{}, {path:'/app'})).body.result.tools;
  const picker = appTools.find(t=>t.name==='attachPdfBatchFromPicker');
  assert.ok(picker,'学習枠に本人選択PDF登録ツールを公開');
  assert.deepEqual(picker._meta.ui.visibility,['app']);
  assert.equal(picker._meta['openai/widgetAccessible'],true);
  assert.equal(picker._meta['openai/outputTemplate'],undefined,'学習枠を追加生成しない');
  assert.equal(picker.annotations?.readOnlyHint,undefined,'保存操作を読取専用と偽装しない');
  const modelTools=(await rpc(env,'tools/list',{}, {path:'/mcp'})).body.result.tools;
  assert.ok(!modelTools.some(t=>t.name==='attachPdfBatchFromPicker'),'モデル側ツール一覧に出さない');
  const forbidden=await rpc(env,'tools/call',{name:'attachPdfBatchFromPicker',arguments:{
    sessionId:'00000000-0000-0000-0000-000000000000', questionPdfs:[{download_url:'https://file.example/p.pdf',file_id:'test'}]
  }},{path:'/mcp'});
  assert.equal(forbidden.body.error?.code,-32602,'通常会話からの直接呼出しを拒否');
});

test('PDF一括添付はその会話に操作可能な学習枠を返す',()=>{
  const batch=TOOLS.find(x=>x.name==='attachPdfBatch');
  const single=TOOLS.find(x=>x.name==='attachPdf');
  assert.ok(batch && single);
  const rpcSource=readFileSync(new URL('../src/mcp.js',import.meta.url),'utf8');
  assert.match(rpcSource,/WIDGET_TOOLS = new Set\(\['attachPdfBatch', 'attachPdf'/, 'PDF送信結果にも学習画面を添付する');
  assert.match(rpcSource,/tool\.name === 'attachPdf' \? \{ isError: false \}/, '登録受付を正常なツール結果として返す');
  assert.match(rpcSource,/\['startSession','openHandoffView','attachPdf','attachPdfBatch'\]\.includes\(name\)/, 'PDF添付結果にもoutputTemplateを割り当てる');
  assert.match(rpcSource,/\.\.\.WIDGET_TOOL_META, \.\.\.\(meta \|\| \{\}\)/, '添付用fileParamsを維持する');
  const html=widgetHtml();
  assert.match(html,/過去問の登録状況/);
  assert.match(html,/今すぐ登録状況を確認/);
  assert.match(html,/PDFの再添付は不要です/);
  assert.match(html,/state.sessionId = sid; saveIds\(\)/);
  assert.match(html,/getOfficialLibrary/);
  assert.match(html,/確認問題へ（3問）/);
  assert.match(html,/公式過去問を解く/);
});

test('詳細解説E照合番号は無言で終了せず学習枠へ保存する指示がある',()=>{
  assert.match(INSTRUCTIONS,/AI詳細解説の完了ゲート/);
  assert.match(INSTRUCTIONS,/空の応答・無言で終了/);
  assert.match(INSTRUCTIONS,/showMenu\(\{kind:"next"/);
  const explain=TOOLS.find(t=>t.name==='explainSpec');
  assert.match(explain.description,/再発防止/);
  assert.match(explain.description,/showMenu/);
  const html=widgetHtml();
  assert.match(html,/aiPermissionNotice/);
  assert.match(html,/アクセスを許可/);
});
