/**
 * 学習エンジンのAPI（T4）。AIアプリはこのAPIを呼び、返ってきた問題と採点結果を表示するだけ。
 * Cloud Run では server.js がこの handle() を呼ぶ。
 *
 * env（server.js が環境変数から作る。トークンは Secret Manager から渡し、チャットには書かない）：
 *   STORE         保存先（24時間保存・セッション）。本番は GcpStore、テストは MemoryStore
 *   PUBLIC_BASE_URL 図のURLの先頭（例 https://qlp-engine-xxxx.a.run.app）。無ければ相対URL
 *   API_TOKEN     AIアプリが付ける Bearer トークン（図の取得だけは不要：画像表示がトークンを付けられないため）
 *   PARSER_URL    経路Bの分解サーバー（Cloud Run）。無ければ経路A（アプリが分解結果を送る）
 *   PARSER_TOKEN  分解サーバーへ付けるトークン（任意）
 *   PARSER_VERSION 受け付ける分解結果の版（既定 0.8.2。パーサーの PARSER_VERSION と合わせる）
 */
import { CATALOG } from './catalog.js';
import { FIXED_UI_CHOICES } from './fixed-ui.js';
import https from 'node:https';
import { constants as cryptoConstants, createHmac } from 'node:crypto';
import { readFigure } from './cache.js';
import { availablePackets, findWanted, grade, jstToday, newState, pickNext, pin, present, questionDisplay, questionScreen } from './engine.js';
import { explainHow, stageNumber, weakFields } from './explain.js';
import { exportHandoff, importHandoff, WITHHELD_MESSAGES } from './handoff.js';
import { IngestError, ingestOne, readJob, staleSources, startJob, stepJob, withNotice } from './ingest.js';
import { awaitUpload, httpParser, renderPages, uploadedParse } from './parser-client.js';
import { handleRpc } from './mcp.js';
import { withStoredSources } from './source-store.js';
import { findSources, newLearnerId, pages } from './pages.js';
import { sha256Hex } from './store.js';
import { LIMIT_MSG, NEED_CODE, admin as accessAdmin, checkCode, countUse, getConfig as accessConfig, grantLearner, learnerAccess } from './access.js';
import { INSTRUCTIONS } from './instructions.js';
import { PRIVACY_HTML } from './privacy.js';
import { OPENAPI_YAML } from './gpt-openapi.js';
import { finishStudy, formatTotal, jst, newStudy, STUDY_TTL_S, lastStudyKey, studyKey, timeKey, validLearnerId } from './study-log.js';

export const DEFAULT_PARSER_VERSION = '0.8.2';
const MAX_SOURCES = 40;
const MAX_BODY = 16 * 1024 * 1024;
const SESSION_TTL_S = 26 * 60 * 60;
const SESSION_MS = 24 * 60 * 60 * 1000;
const STEP_BUDGET_MS = 15000;
// Cloud Run の応答期限（配置スクリプトで 900 秒）より、1件の分解にかかる時間（最大数分）だけ短くする
const RUN_ALL_MS = 540000;
const ADAPTERS = new Set(['takken', 'surveyor', 'chintai', 'fp2', 'fp3', 'itpass', 'gyosei']);

class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function deps(env, extra = {}) {
  const parserVersion = env.PARSER_VERSION || DEFAULT_PARSER_VERSION;
  const parse = env.PARSER_URL ? httpParser({ endpoint: env.PARSER_URL, token: env.PARSER_TOKEN, fetch: env.parserFetch }) : awaitUpload();
  return { store: env.STORE, fetchPdf: withStoredSources(env.STORE, env.fetchPdf ?? defaultFetchPdf), parse, parserVersion, ...extra };
}

/**
 * 公式PDFを取得する。国土地理院のサーバーは古い再ネゴシエーション方式を使うため、標準の fetch では
 * 接続できない（2026-10-15 GitHub Actions で確認）。そのため node:https で、その方式を許可して取得する。
 */
const legacyAgent = new https.Agent({ secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT, keepAlive: false });
const MAX_PDF_FETCH = 30 * 1024 * 1024;

function defaultFetchPdf(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (!/^https:\/\//.test(url)) return reject(new Error('REDIRECT_NOT_HTTPS'));
    const req = https.get(url, { agent: legacyAgent, headers: { accept: /\.html?$/i.test(url) ? 'text/html' : 'application/pdf', 'user-agent': 'qualification-learning-system' }, timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('TOO_MANY_REDIRECTS'));
        return resolve(defaultFetchPdf(new URL(res.headers.location, url).href, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_PDF_FETCH) req.destroy(new Error('PDF_TOO_LARGE'));
        else chunks.push(c);
      });
      res.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
  });
}

/** 公式の過去問掲載ページ（HTML）を取得する。文字コードは Shift_JIS のページもあるため、宣言を見て読む。 */
function defaultFetchText(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: legacyAgent, headers: { accept: 'text/html', 'user-agent': 'qualification-learning-system' }, timeout: 8000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(defaultFetchText(new URL(res.headers.location, url).href, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const m = /charset=["']?([A-Za-z0-9_-]+)/i.exec(res.headers['content-type'] ?? '') ?? /charset=["']?([A-Za-z0-9_-]+)/i.exec(buf.subarray(0, 2000).toString('latin1'));
        const enc = (m?.[1] ?? 'utf-8').toLowerCase().replace(/^(shift_jis|sjis|x-sjis)$/, 'shift_jis');
        try {
          resolve(new TextDecoder(enc).decode(buf));
        } catch {
          resolve(buf.toString('utf8'));
        }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
  });
}

async function body(request) {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, 'BODY_TOO_LARGE');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'BODY_TOO_LARGE');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'BODY_INVALID');
  }
}

/**
 * エンジンが扱う資格（宅建・測量士補）は、取り込む年度をAIに選ばせず、公式の掲載ページにある過去問をすべて取り込む。
 * 新しい年度から順に取り込むので、直近の数年度で出題を始め、残りは裏で続く。
 */
async function catalogSources(env, qualificationId) {
  const slug = Object.keys(CATALOG).find((k) => CATALOG[k].qualificationId === qualificationId);
  if (!slug) return null;
  return findSources({ ...env, fetchText: env.fetchText ?? defaultFetchText }, slug, { years: 99, max: MAX_SOURCES });
}

function checkSources(sources, qualificationId, owner = null) {
  if (!Array.isArray(sources) || !sources.length || sources.length > MAX_SOURCES) throw new HttpError(400, 'SOURCES_INVALID');
  return sources.map((s) => {
    const ok = s && ADAPTERS.has(s.adapter) && Number.isInteger(s.year) && typeof s.section === 'string' && s.section && s.section.length <= 50
      && /^https:\/\/\S+$/.test(s.questionUrl ?? '') && s.questionUrl.length <= 500
      && (s.answerUrl == null || (/^https:\/\/\S+$/.test(s.answerUrl) && s.answerUrl.length <= 500));
    if (!ok) throw new HttpError(400, 'SOURCES_INVALID');
    const out = { qualificationId, adapter: s.adapter, year: s.year, section: s.section, questionUrl: s.questionUrl, answerUrl: s.answerUrl ?? null };
    return owner ? { ...out, owner } : out;
  });
}

/**
 * セッションの取り込みの名前。引継ぎIDがあれば学習者ごと（期限なし・問題の保存も学習者ごと）。
 * 無い古い記録は資格ごとの共有の取り込み。
 */
const sessionJobId = (state) => (state.learnerId ? `${state.qualificationId}~${state.learnerId}` : state.qualificationId);

const qidOk = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100 && !/[/\s]/.test(v);
const sesKey = (id) => `ses/${id}`;

async function loadSession(env, id, now) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'SESSION_NOT_FOUND');
  const v = await env.STORE.get(sesKey(id), 'json');
  if (!v || now - v.savedAt >= SESSION_MS) throw new HttpError(404, 'SESSION_NOT_FOUND');
  return v.state;
}

async function saveSession(env, id, state, now) {
  await env.STORE.put(sesKey(id), JSON.stringify({ savedAt: now, state }), { expirationTtl: SESSION_TTL_S });
  // 引継ぎIDごとにも残す（期限なし）。再開は引継ぎIDだけでできるので、引継ぎデータにエンジンの記録を載せなくてよい
  if (state.learnerId) await env.STORE.put(learnerStateKey(state.learnerId), JSON.stringify(state));
}

const learnerStateKey = (lid) => `lrnstate/${lid}`;
// 利用者が答えた学習段階（1〜4）。解説の深さを合わせるため、引継ぎIDごとに残す（期限なし）
const learnerProfileKey = (lid) => `lrnprof/${lid}`;

/** 引継ぎIDの記録から再開するときの状態。出題したまま答えていない問は残す（再開したらその問から続ける）。 */
function resumed(saved) {
  const cur = saved.current;
  return { ...saved, current: cur && !cur.grade ? cur : null };
}

/** 本文に入れるSVGの長さの上限（これより長い図は、画像を開くリンクにする）。 */
export const INLINE_SVG_MAX = 8000;

/** 再開のとき「新しい問題から」と選ばれた（nextQuestion の question）。 */
const FRESH_WANT = /^\s*(新しい問題|新しい問|別の問題)/;

/** 利用者が「図をもう一度」「図を表示して」などと言った（nextQuestion の question）。直前の問の公式の図だけを付け直す。 */
const FIGURE_WANT = /図.*(もう一度|再表示|表示|出し|見せ|見え)|(もう一度|再表示).*図|^\s*図\s*$/;

// 図をもう一度見せるとき：AIがウェブ検索や画像検索で図を探さないよう、エンジンが公式の図のファイルを付け直す（2026-10-18 ChatGPTが再表示で検索画像を出した）
const FIGURE_AGAIN_HOW = '図の画像ファイル（figureCount 枚）がこの応答に付いている。付いた図はChatGPTが回答に表示する（Pythonは使わない）。screen をそのまま出す。図はこのファイルだけを使い、ウェブ検索・画像検索で探したり描いたりしない。付いた図が見えないときは、見えないと伝えて screen のリンクを案内する。';

/** 前回答えていない問の名前（「2025年度 問13」）。無ければ null。選択ボタンに入るので短くする（分野名は付けない）。 */
function pendingLabel(saved) {
  const cur = saved?.current;
  if (!cur || cur.grade || !cur.source) return null;
  const year = cur.source.year ? `${cur.source.year}年度 ` : '';
  return `${year}問${cur.source.number ?? '?'}`;
}

/** 引継ぎデータの文から、引継ぎIDらしい文字列を探す（「引継ぎID」の近くを先に。最大5つ）。 */
export function learnerIdCandidates(given, text) {
  const t = String(text ?? '').normalize('NFKC');
  const out = [];
  const add = (v) => {
    const lid = validLearnerId(String(v ?? '').toLowerCase());
    if (lid && !out.includes(lid)) out.push(lid);
  };
  add(given);
  for (const m of t.matchAll(/引き?継ぎ\s*ID[^A-Za-z0-9]{0,8}([A-Za-z0-9]{10})(?![A-Za-z0-9])/gi)) add(m[1]);
  for (const m of t.matchAll(/(?<![A-Za-z0-9])([a-z2-9]{10})(?![A-Za-z0-9])/g)) add(m[1]);
  return out.slice(0, 5);
}

const HANDOFF_HINT = '引継ぎデータから引継ぎIDを読めなかった。前回の終了時に表示された引継ぎデータの「引継ぎID：」の行を含めて、handoff にそのまま入れて呼び直す。';

/** 引継ぎIDで残した学習の記録から、新しいセッションを作る（無ければ null）。 */
async function sessionFromLearner(env, lid, now) {
  const saved = await env.STORE.get(learnerStateKey(lid), 'json');
  if (!saved) return null;
  const state = resumed(saved);
  const id = crypto.randomUUID();
  await saveSession(env, id, state, now);
  await env.STORE.put(lastSessionKey(lid), id, { expirationTtl: SESSION_TTL_S });
  return { id, state };
}

/** 学習の開始（startStudy）で決めた資格名から、エンジンが出題する資格の番号を探す（無ければ null）。 */
function catalogIdByName(name) {
  const t = String(name ?? '').replace(/\s/g, '');
  if (!t) return null;
  const names = (x) => [x.name, ...(x.aliases ?? [])];
  const exact = Object.values(CATALOG).find((x) => names(x).some((a) => t.includes(a)));
  if (exact) return exact.qualificationId;
  // 短い呼び方（「宅地建物」など）は、当てはまる資格が1つだけのときに限る（「FP」だけでは2級か3級か決めない）
  const part = [...new Set(Object.values(CATALOG).filter((x) => names(x).some((a) => a.includes(t))).map((x) => x.qualificationId))];
  return part.length === 1 ? part[0] : null;
}

/** qualificationId か資格名から、エンジンの資格の番号を返す（エンジンの資格でなければ受け取った値のまま）。 */
function catalogQid(v) {
  const t = String(v ?? '').trim();
  if (Object.values(CATALOG).some((c) => c.qualificationId === t)) return t;
  return catalogIdByName(t) ?? t;
}

const NOT_SUPPORTED_HINT = 'この資格の過去問は、まだエンジンで扱えません。利用者に、公式の過去問PDFを添付してもらうか、AIが作った練習問題と明示して進めるかを選んでもらってください。';

/** 新しい学習者のセッションを作り、過去問の取り込みを始める（startSession と同じ）。 */
async function createSession(env, { qualificationId, learnerId, plan, sources }, now) {
  const state = newState({ qualificationId, learnerId, plan: plan ?? {}, now });
  const checked = checkSources((await catalogSources(env, qualificationId)) ?? sources, qualificationId, learnerId);
  await startJob(env.STORE, sessionJobId(state), checked, now, { persistent: true });
  await markEngineSources(env, checked);
  const id = crypto.randomUUID();
  await saveSession(env, id, state, now);
  await env.STORE.put(lastSessionKey(learnerId), id, { expirationTtl: SESSION_TTL_S });
  return { id, state };
}

// AIアプリが sessionId の代わりに引継ぎIDや学習の番号（studyId）を送ってくることがあるので、
// その学習者の最後のセッションに読み替える
const lastSessionKey = (lid) => `lrnsess/${lid}`;
const NO_SESSION_HINT = '出題用のセッションがまだありません。startSession を learnerId（引継ぎID）と sources を付けて1回だけ呼び、返った sessionId を nextQuestion と submitAnswer に使ってください。';

async function resolveSession(env, id, now) {
  try {
    return { id, state: await loadSession(env, id, now) };
  } catch (e) {
    let lid = validLearnerId(id);
    if (!lid && /^[0-9a-f-]{36}$/.test(id)) lid = (await env.STORE.get(studyKey(id), 'json'))?.learnerId ?? null;
    const sid = lid ? await env.STORE.get(lastSessionKey(lid)) : null;
    if (sid) {
      try {
        return { id: sid, state: await loadSession(env, sid, now) };
      } catch {
        // 期限切れ：下で引継ぎIDの記録から作り直す
      }
    }
    if (lid) {
      // セッションが切れていても、引継ぎIDの記録から続ける（AIに作り直させない）
      const restored = await sessionFromLearner(env, lid, now);
      if (restored) return restored;
      // まだ取り込みを始めていない学習者：学習の開始で決めた資格がエンジンの資格なら、ここで始める
      const studyId = await env.STORE.get(lastStudyKey(lid));
      const study = studyId ? await env.STORE.get(studyKey(studyId), 'json') : null;
      const qid = catalogIdByName(study?.qualificationName);
      if (qid) return createSession(env, { qualificationId: qid, learnerId: lid }, now);
    }
    throw new HttpError(404, 'SESSION_NOT_FOUND', NO_SESSION_HINT);
  }
}

/** 利用者に見せる取り込みの状況（URLとSHAは経路Aでアプリが分解するときに使う）。 */
/** 公式PDFから読み取った表を、そのまま表示できるマークダウンにする（見出しの文があれば表の前に置く）。 */
// 推論の浅いモデルでも表示を崩さないよう、問題ごとに表示のしかたを添える
const SHOW_COMMON = 'question.screen を1文字も変えずに、そのまま回答の本文として出す（見出し・問題文・図・選択肢・問題PDF・答え方が、この順で入っている。前後に説明を足さない）。選択肢を書き換えない。renderPdfPages は呼ばない。利用者が「スキップ」と答えたら、submitAnswer の value に「スキップ」を送る。';
const SHOW_TEXT = `${SHOW_COMMON}「図を開く（公式PDFの図）」のリンクは公式PDFから切り出した図なので、書き換えずにそのまま出す。図をウェブ検索・画像検索で探したり、自分で描いたりしない（このリンクを案内する）。`;
// GPT：図の画像ファイルがアクションの応答に付いている。ChatGPTが回答に添付として出す（Pythonで探す必要はない。2026-10-18 実機：添付は出たが、Pythonは対象ファイルを見つけられなかった）
const SHOW_WITH_FILES = `図の画像ファイル（figureCount 枚）がこの応答に付いている。付いた図はChatGPTが回答に表示する。Pythonは使わず、ファイルを探したり描き直したりしない。続けて ${SHOW_COMMON}図が見えていないときは、見えないと伝える（「表示しました」と書かない）。利用者が図をもう一度見たいと言ったら（解説の途中でも）、nextQuestion の question に「〔年度〕年度 問〔番号〕の図をもう一度」と入れて呼ぶ（図をウェブ検索・画像検索で探さない）。`;
const SHOW_WITH_FIGURE = `${SHOW_COMMON}svg タグの図は公式PDFの図なので、コードブロックに入れず省略せず、白い背景（rect）も消さずにそのまま出す（その位置に図が表示される）。図をウェブ検索・画像検索・Pythonで出さない。`;

export function tablesMarkdown(tables) {
  if (!Array.isArray(tables) || !tables.length) return null;
  const cell = (v) => String(v ?? '').replace(/\|/g, '｜').replace(/\s+/g, ' ').trim() || '　';
  return tables
    .map((t) => {
      const width = Math.max(...t.rows.map((r) => r.length));
      const row = (r) => `| ${Array.from({ length: width }, (_, i) => cell(r[i])).join(' | ')} |`;
      const lines = [row(t.rows[0]), `|${' --- |'.repeat(width)}`, ...t.rows.slice(1).map(row)];
      return [t.caption, ...lines].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function jobView(job) {
  if (!job) return null;
  return {
    state: job.state,
    notice: job.notice ?? null,
    progress: job.progress ?? null,
    sources: job.sources.map((s, index) => ({
      index,
      adapter: s.adapter,
      year: s.year,
      section: s.section,
      questionUrl: s.questionUrl,
      answerUrl: s.answerUrl,
      status: s.status,
      reason: s.reason ?? null,
      packetCount: s.packetCount ?? null,
      excludedCount: s.excludedCount ?? null,
    })),
  };
}

async function advance(env, qualificationId, now, budgetMs, leaseMs = 0) {
  const job = await readJob(env.STORE, qualificationId);
  if (!job) return null;
  if (job.state !== 'running' && !staleSources(job, deps(env).parserVersion).length) return withNotice(job, now);
  return stepJob(env.STORE, qualificationId, deps(env, { now }), { budgetMs, clock: env.clock ?? Date.now, leaseMs });
}

/**
 * 取り込みを裏で進める（方針3：資格が決まった時点で始め、導入の間に進める）。
 * 学習画面の応答を待たせないよう、自分自身の取り込みURLを別の呼び出しとして開き、応答は待たない。
 * 自分のURLが分からない環境（テスト）では、その場で時間の許す分だけ進める。
 */
async function kickIngest(env, qid, now) {
  if (!env.PUBLIC_BASE_URL || !env.API_TOKEN) {
    await advance(env, qid, now, STEP_BUDGET_MS);
    return;
  }
  const doFetch = env.selfFetch ?? fetch;
  await doFetch(`${env.PUBLIC_BASE_URL}/v1/jobs/${encodeURIComponent(qid)}?run=all`, {
    headers: { authorization: `Bearer ${env.API_TOKEN}` },
    signal: AbortSignal.timeout(1500),
  }).catch(() => {});
}

/**
 * AIアプリからの呼び出しで取り込みを進めるとき。公式PDF1件の分解（OCRなど）は数分かかることがあり、
 * その場で待つとAIアプリが時間切れになって応答（sessionId など）を受け取れないため、本番では裏で進めて今の状況だけを返す。
 */
async function progress(env, qid, now) {
  if (!env.PUBLIC_BASE_URL || !env.API_TOKEN) return advance(env, qid, now, STEP_BUDGET_MS);
  const job = await readJob(env.STORE, qid);
  if (!job) return null;
  if (job.state === 'running' || staleSources(job, deps(env).parserVersion).length) await kickIngest(env, qid, now);
  return withNotice(job, now);
}

// 利用者に見せる文（notice）と、AIへの案内（hint）を分ける。内部の話（セッションなど）は利用者に見せない
const JOB_NOTICE = '過去問を準備しています。そろったら問題を出します。';
const JOB_BY_SESSION = '取り込みは続いています。状況は nextQuestion（startSession の sessionId）で確かめてください。取り込み中なら進み具合が出ます。startSession をやり直さないでください。';

const sourceKey = (urlSha) => `srcurl/${urlSha}`;

/** エンジンが取り込む公式の問題PDFのURLを控える（renderPdfPages で別に出させないため）。 */
async function markEngineSources(env, sources) {
  for (const s of sources) await env.STORE.put(sourceKey(await sha256Hex(new TextEncoder().encode(s.questionUrl))), '1');
}

// 学習計画・項目の進め方・再開の確認も、同じ形で選べるようにする（指示文を貼り直さなくてよいよう、応答に添える）
const PLAN_MENU = ['---', '学習を開始しますか？', '1：始めます'].join('\n');
// アプリ（ウィジェット）では指示文を置けず、AIが学習の始め方の順番を飛ばした（2026-10-18）。順番はエンジンが応答で示し、学習の開始（startStudy）の前は出題しない
export const PLAN_STEPS = '学習の始め方（この順で、飛ばさない）：①公式サイトで確認できた試験概要（対象・出題分野・形式・時間・合格基準。確認できない項目は「未確認」）を示す。②公式に免除制度がある資格だけ、免除を使うかを聞く。③利用者の学習状況（1：未着手／2：基礎学習中／3：応用学習中／4：過去問演習中）を聞き、答えを待つ。④その答えと出題分野の頻度を踏まえた学習計画（始める分野と理由、進め方）を示し、planMenu を付けて返事を待つ。利用者の答えより先に、学習計画を作ったり問題を出したりしない。';
const NEED_PLAN = '先に、学習の始め方（試験概要→学習状況の確認→学習計画→「1：始めます」）を進めます。';
const PLAN_UI = {
  howToProceed: PLAN_STEPS,
  planMenu: PLAN_MENU,
  planHowToShow: '学習計画を示す返答の最後に、「学習を開始しますか？」「1：始めます」の代わりに planMenu を1文字も変えずに付ける（後ろに何も書かない）。「1」「始めます」なら startStudy を呼ぶ。',
};
const ITEM_MENU = ['---', '■この項目はどう進めますか？（以後も同じにするときは「2 以後も」のように入力してください）', '1：解説あり（解説→確認問題→実践問題）', '2：確認問題から（解説なし）', '3：実践問題から（解説も確認問題もなし）'].join('\n');
const ITEM_HOW = 'display をそのまま表示し、📍今回の位置・🎯今回の目的・🧭始める理由と全体の進捗を示したあと、「📍〔科目・領域〕→〔項目〕」の1行に続けて itemMenu を1文字も変えずに付ける（後ろに何も書かない）。';
const RESUME_MENU = ['---', '■続きから始めますか？', '1：始めます'].join('\n');
const RESUME_HOW = '読めた内容を短く確認したあと、「続きから始めるときは『始めます』と入力してください。」の代わりに resumeMenu を1文字も変えずに付ける（後ろに何も書かない）。';

// ChatGPTは、返答が区切り線のあとの「質問＋番号の選択肢」で終わるとボタンにする（後ろに案内の行があるとボタンにならない）
const WAIT_MENU = ['---', '■取り込みを待つ間、どうしますか？', '1：今の項目の解説を読む', '2：今の項目の確認問題を解く', '3：取り込みの進み具合を確認する'].join('\n');
const WAIT_AFTER = ['---', '■次はどうしますか？', '1：取り込みの進み具合を確認する', '2：続けて解説を読む', '3：確認問題を解く'].join('\n');
const WAIT_HOW = 'screen を1文字も変えずにそのまま出し、番号の答えを待つ（前後に案内を足さない。選択肢の後ろに何も書かない）。1・2を選ばれたら、解説（または「AIが作った確認問題」と明示した確認問題）を出し、その返答の最後に afterScreen を1文字も変えずに付ける（afterScreen の後ろに何も書かない）。確認問題の答え合わせのあとも同じく afterScreen を付ける。「取り込みの進み具合を確認する」を選ばれたら nextQuestion を呼ぶ（getJob は使わない）。';

/** 次の問題（または待ち・終了）を決め、出題中として控える。nextQuestion と、採点の応答に付ける next で共通。 */
async function nextView(env, id, state0, now, { prefetched = false, want: want0 = null } = {}) {
  let want = want0;
  let state = state0;
  // アプリでは、学習の開始（startStudy）の前に出題しない（学習計画の確認を飛ばさせない）。再開した学習者は、前の学習の記録があるので通る
  if (env.QLP_WIDGET && state.learnerId && !(await env.STORE.get(lastStudyKey(state.learnerId)))) {
    return { status: 'needPlan', screen: NEED_PLAN, howToProceed: PLAN_STEPS, planMenu: PLAN_MENU };
  }
  const job = await progress(env, sessionJobId(state), now);
  let items = await availablePackets(env.STORE, job, now);
  const prevField = state.current?.fieldId ?? null;
  // 再開のとき「新しい問題から」を選んだら、前回答えていない問を今回は出さずに別の問へ進む（記録には残さない）
  if (want && FRESH_WANT.test(want)) {
    const skipId = state.current && !state.current.grade ? state.current.questionId : null;
    state = { ...state, current: null };
    if (skipId) items = items.filter((x) => x.packet.questionId !== skipId);
    want = null;
  }
  // 図をもう一度：直前の問（答えた後でもよい）の公式の図を付け直す。問の順番や記録は変えない
  if (want && FIGURE_WANT.test(want.normalize('NFKC'))) {
    // 「2026年度 問3の図をもう一度」のように問が書かれていればその問。無ければ、いま見ている問
    // （採点の応答に付けた次の問は、まだ見ていないことがあるので、そのときは答えたばかりの問）
    const named = /問\s*\d/.test(want) ? findWanted(state, items, want.replace(/の?図.*$/, ''), {}) : null;
    const cur = state.current && !(state.current.prefetched && state.lastGrade) ? state.current.questionId : null;
    const qid = named?.item.packet.questionId ?? cur ?? state.lastGrade?.questionId ?? state.current?.questionId ?? null;
    const item = qid ? items.find((x) => x.packet.questionId === qid) : null;
    if (item) return figureAgain(env, item);
    want = null;
  }
  // 利用者が問を指定したとき（マスタープロンプトの「直接問題指定」）は、その問を出す。見つからなければ知らせて通常の次の問
  const fieldNames = Object.values(CATALOG).find((c) => c.qualificationId === state.qualificationId)?.fields ?? {};
  const wanted = want ? findWanted(state, items, want, fieldNames) : null;
  // 分野の指定なら、その分野の問が残っている間はそこから出す（別の分野を指定するまで）
  if (wanted?.fieldId) state = { ...state, focusField: wanted.fieldId };
  const wantNotice = want && !wanted ? `指定の問題・分野（${String(want).slice(0, 30)}）は、取り込んだ過去問の中に見つかりませんでした。` : null;
  const pick = wanted ? { status: 'question', ...wanted } : pickNext(state, items, { today: jstToday(now), job });
  if (pick.status !== 'question') {
    // 取り込み中は、進み具合（棒グラフと残り時間の目安）をそのまま見せる文にする
    const notice = pick.status === 'waiting' ? job?.progress ?? job?.notice ?? null : job?.notice ?? null;
    if (pick.status === 'waiting') {
      // 待つ間にできることを番号で選べるようにし、解説や確認問題のあとにも、進み具合を確かめる選択肢を必ず出す
      // 取り込みを待ったことを控え、そろって最初の問題を出すときに一言知らせる
      if (!state.waitedForImport) await saveSession(env, id, { ...state, waitedForImport: true }, now);
      return { status: 'waiting', notice, screen: [notice, WAIT_MENU].filter(Boolean).join('\n\n'), afterScreen: WAIT_AFTER, howToShow: WAIT_HOW, job: jobView(job) };
    }
    return { status: pick.status, notice, job: jobView(job) };
  }
  // 最初の過去問（または取り込みを待ったあとの最初の問題）の前に、取り込めた年度を知らせる
  const readyNotice = !pick.repeated && (state.waitedForImport || !Object.keys(state.history ?? {}).length) && !state.readyAnnounced ? importReadyNotice(job) : null;
  state = pin(state, pick.item, pick.kind, now);
  if (readyNotice || state.waitedForImport) state = { ...state, waitedForImport: false, readyAnnounced: true };
  if (prefetched && !pick.repeated) state = { ...state, current: { ...state.current, prefetched: true } };
  // nextQuestion で出した問は、利用者が見た問（採点の応答に先に付けた印を外す）
  else if (!prefetched && state.current?.prefetched) state = { ...state, current: { ...state.current, prefetched: false } };
  await saveSession(env, id, state, now);
  const names = Object.values(CATALOG).find((c) => c.qualificationId === state.qualificationId)?.fields ?? {};
  const fid = pick.item.packet.fieldId ?? null;
  const shown = present(pick.item, pick.kind, `${env.PUBLIC_BASE_URL ?? ''}/v1/figure`);
  const { keyParts } = pick.item;
  const svgs = await Promise.all(shown.figures.map(async (f) => {
    if (!f.svgFile) return null;
    const bytes = await readFigure(env.STORE, pick.item.packet.questionPdfSha256, keyParts.parserVersion, f.svgFile, keyParts.owner ?? null).catch(() => null);
    const svg = bytes ? new TextDecoder().decode(bytes) : null;
    // 長いSVGはAIが写しきれず、図だけでなく問題文や選択肢まで省いて出してしまう（2026-10-17、ChatGPT）。その図は画像で開く形にする
    return svg && svg.length <= INLINE_SVG_MAX ? svg : null;
  }));
  // 本文に入れたSVGの図は画像のURLを渡さない（AIが別の方法で図を出そうとしないように）
  // GPT（MCP以外の呼び出し）では、図を画像ファイルとして応答に付ける（ChatGPTが添付として表示する）
  const attach = !env.QLP_MCP && !env.QLP_WIDGET && shown.figures.length > 0;
  const figures = shown.figures.map(({ svgFile, url, ...f }, i) => (svgs[i] && !attach ? f : { url, ...f })); // eslint-disable-line no-unused-vars
  const display = questionDisplay(shown, attach ? [] : svgs, { attached: attach });
  const fieldName = fid ? names[fid] ?? null : null;
  // 前の問と分野が変わるときは、利用者に分かるよう知らせる文を付ける（初回と同じ問の再表示では付けない）
  const changed = !pick.repeated && prevField && fid && prevField !== fid;
  const fieldNotice = changed ? `分野が変わります：${names[prevField] ?? '前の分野'} → ${names[fid] ?? '次の分野'}` : null;
  const screen = [wantNotice, readyNotice, questionScreen(shown, display, { fieldName, fieldNotice })].filter(Boolean).join('\n\n');
  // figureUrls：ChatGPT アプリの画面が全部の図を公式PDFの画像で出すため（AIには渡さない。mcp.js の forModel）
  const figureUrls = env.QLP_WIDGET ? shown.figures.map((f) => f.url) : undefined;
  const howToShow = attach ? SHOW_WITH_FILES : screen.includes('<svg') ? SHOW_WITH_FIGURE : SHOW_TEXT;
  const question = { ...shown, figures, ...(figureUrls ? { figureUrls } : {}), display, screen, howToShow, fieldName, ...(attach ? { figureCount: shown.figures.length } : {}) };
  return {
    status: 'question', sessionId: id, repeated: !!pick.repeated, question, fieldChanged: !!changed, fieldNotice, notice: job?.notice ?? null,
    // ChatGPT はこの欄のURLのファイルを取り込み、回答に添付として表示する（最大10個）
    ...(attach ? { openaiFileResponse: shown.figures.slice(0, 10).map((f) => f.url) } : {}),
  };
}

/** 図をもう一度見せる応答（図の無い問は、そのことを伝える文だけ）。 */
function figureAgain(env, item) {
  const shown = present(item, 'review', `${env.PUBLIC_BASE_URL ?? ''}/v1/figure`);
  const label = `${shown.year}年度 問${shown.questionNumber}`;
  const urls = shown.figures.map((f) => f.url);
  if (!urls.length) return { status: 'figure', questionId: shown.questionId, figureCount: 0, screen: `${label}には、図はありません。`, howToShow: 'screen をそのまま出す。図を探したり描いたりしない。' };
  const links = urls.map((u, i) => `▶ 図${urls.length > 1 ? i + 1 : ''}が表示されないときは：[図${urls.length > 1 ? i + 1 : ''}を開く（公式PDFの図）](${u})`).join('\n');
  const attach = !env.QLP_MCP && !env.QLP_WIDGET;
  return {
    status: 'figure',
    questionId: shown.questionId,
    figureCount: urls.length,
    screen: attach ? `〔図〕${label}の公式PDFから切り出した図を、この回答に添付しています。\n${links}` : env.QLP_WIDGET ? `${label}の公式PDFから切り出した図です。` : `${label}の公式PDFから切り出した図です。\n${links}`,
    ...(env.QLP_WIDGET ? { figureUrls: urls } : {}),
    howToShow: attach ? FIGURE_AGAIN_HOW : 'screen をそのまま出す（リンクから公式の図を開ける）。図を探したり描いたりしない。',
    ...(attach ? { openaiFileResponse: urls.slice(0, 10) } : {}),
  };
}

/** 「2022〜2026年度の過去問の取り込みが終わりました。過去問を出題します。」（取り込み中の年度が残っていれば、そのことも添える） */
export function importReadyNotice(job) {
  const done = (job?.sources ?? []).filter((s) => s.status === 'done' && (s.packetCount ?? 1) > 0).map((s) => s.year);
  if (!done.length) return null;
  const lo = Math.min(...done);
  const hi = Math.max(...done);
  const span = lo === hi ? `${hi}年度` : `${lo}〜${hi}年度`;
  const rest = (job.sources ?? []).some((s) => s.status === 'pending') ? '残りの年度は、学習を続けている間に取り込みます。' : '';
  return `**${span}の過去問の取り込みが終わりました。過去問を出題します。**${rest ? `\n${rest}` : ''}`;
}

async function route(request, env, url, now) {
  const parts = url.pathname.split('/').filter(Boolean);
  const method = request.method;

  // 図（画像表示用。トークン不要。キーにSHA-256が入るので推測できない）
  // 学習者ごとの図は /v1/figure/own/<引継ぎID>/... 
  const own = parts[2] === 'own' && parts.length === 7;
  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'figure' && (parts.length === 5 || own)) {
    const [qsha, pv, file] = parts.slice(own ? 4 : 2).map(decodeURIComponent);
    if (!/^[a-f0-9]{64}$/.test(qsha)) throw new HttpError(404, 'FIGURE_NOT_FOUND');
    const bytes = await readFigure(env.STORE, qsha, pv, file, own ? decodeURIComponent(parts[3]) : null);
    if (!bytes) throw new HttpError(404, 'FIGURE_NOT_FOUND');
    const type = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' } });
  }

  // 公式PDFのページ画像（トークン不要。キーにPDFのSHA-256が入るので推測できない）
  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'pageimg' && parts.length === 4) {
    const sha = decodeURIComponent(parts[2]);
    const m = /^p(\d{1,4})\.png$/.exec(decodeURIComponent(parts[3]));
    if (!/^[a-f0-9]{64}$/.test(sha) || !m) throw new HttpError(404, 'PAGE_IMAGE_NOT_FOUND');
    const bytes = await env.STORE.get(`pgimg/${sha}/${m[1]}`, 'arrayBuffer');
    if (!bytes) throw new HttpError(404, 'PAGE_IMAGE_NOT_FOUND');
    return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' } });
  }

  // 公式PDFから問題のページだけを抜き出したPDF（トークン不要。キーにPDFのSHA-256が入るので推測できない）
  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'pagepdf' && parts.length === 4) {
    const sha = decodeURIComponent(parts[2]);
    const m = /^(\d{1,4})-(\d{1,4})\.pdf$/.exec(decodeURIComponent(parts[3]));
    if (!/^[a-f0-9]{64}$/.test(sha) || !m) throw new HttpError(404, 'PAGE_PDF_NOT_FOUND');
    const bytes = await env.STORE.get(`fig/pgpdf/${sha}/${m[1]}-${m[2]}`, 'arrayBuffer');
    if (!bytes) throw new HttpError(404, 'PAGE_PDF_NOT_FOUND');
    const name = `official-pages-${m[1]}-${m[2]}.pdf`;
    return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'public, max-age=3600' } });
  }

  // AIアプリのページ取得はまず robots.txt を見る。401 を返すと全体が禁止と扱われ、次のページを開いてもらえない
  if (method === 'GET' && url.pathname === '/robots.txt') {
    return new Response('User-agent: *\nAllow: /p\nAllow: /t\nAllow: /v1/figure\nAllow: /v1/pageimg\nAllow: /v1/pagepdf\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  // GPT の公開に必要なプライバシーポリシー（個人情報を集めていない内容を、ありのまま書く）
  if (method === 'GET' && url.pathname === '/privacy') {
    return new Response(PRIVACY_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  // GPT の作成用（運営者が iPhone で GPT を作るとき、URL から取り込めるようにする）。秘密は含まない。
  if (method === 'GET' && url.pathname === '/gpt/openapi.yaml') {
    const base = env.PUBLIC_BASE_URL || url.origin;
    const spec = OPENAPI_YAML.replaceAll('https://REPLACE-WITH-CLOUD-RUN-URL', base);
    return new Response(spec, { headers: { 'content-type': 'text/yaml; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (method === 'GET' && url.pathname === '/gpt/instructions.txt') {
    return new Response(INSTRUCTIONS, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }

  // ChatGPT の挙動を確かめるための試験用ページ（学習には使わない）
  if (method === 'GET' && parts[0] === 't') {
    const base = env.PUBLIC_BASE_URL || url.origin;
    const time = new Date(now).toISOString();
    const text = parts[1] === 'next'
      ? `【表示】ページ内のリンクを開けました。合言葉：みかん（${time}）`
      : `【AIへの指示】下の「次に開くURL」をすぐ開き、開いたページの合言葉を利用者に伝えてください。\n【表示】いまの時刻：${time}\n【次に開くURL】${base}/t/next/${Math.random().toString(36).slice(2, 10)}`;
    return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }

  // プロンプトだけで使う方式（pages.js）。AIアプリの「Webページを開く」機能で開くのでトークンは付けない
  if (method === 'GET' && parts[0] === 'p') return pages({ ...env, fetchText: env.fetchText ?? defaultFetchText }, url, parts, now, advance, (qid) => kickIngest(env, qid, now));

  // MCP（Claude・Perplexity・Gemini のカスタムコネクタ）。トークンは Authorization ヘッダー、
  // またはヘッダーを設定できないアプリ向けに URL（/mcp/<トークン>）で受け取る
  // ChatGPT アプリ（/app/<トークン>）は、問題をエンジンが描く画面で出す
  if ((parts[0] === 'mcp' || parts[0] === 'app') && parts.length <= 2) {
    // ChatGPT アプリはヘッダーを設定できないので URL に合言葉を入れる。主のトークンは URL に入れず、アプリ専用の合言葉（appKey）だけを受け付ける
    const pathKey = parts[0] === 'app' ? appKey(env.API_TOKEN) : env.API_TOKEN;
    const viaPath = parts.length === 2 && pathKey && timingSafeEqual(decodeURIComponent(parts[1]), pathKey);
    const viaHeader = env.API_TOKEN && timingSafeEqual(request.headers.get('authorization') ?? '', `Bearer ${env.API_TOKEN}`);
    if (!viaPath && !viaHeader) throw new HttpError(401, 'UNAUTHORIZED');
    if (method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    return mcp(request, env, url, now, parts[0] === 'app');
  }

  const auth = (request.headers.get('authorization') ?? '').trim();
  if (!env.API_TOKEN || !timingSafeEqual(auth, `Bearer ${env.API_TOKEN}`)) throw new HttpError(401, 'UNAUTHORIZED', authHint(auth, env.API_TOKEN));

  // 運営者の操作：利用コードの追加・無効化・回数の変更（合言葉で守る）
  if (method === 'POST' && url.pathname === '/v1/admin/access') {
    return json(200, await accessAdmin(env.STORE, await body(request), jstToday(now)));
  }

  if (method === 'POST' && url.pathname === '/v1/sessions') {
    const b = await body(request);
    if (!qidOk(String(b.qualificationId ?? '').replace(/\s/g, ''))) throw new HttpError(400, 'QUALIFICATION_INVALID');
    // 資格名（「賃管」など）で呼ばれても、エンジンが扱う資格なら番号に読み替える（指示文に番号を並べなくてよいように）
    b.qualificationId = catalogQid(b.qualificationId);
    const known = Object.values(CATALOG).some((c) => c.qualificationId === b.qualificationId);
    if (!known && !(Array.isArray(b.sources) && b.sources.length)) throw new HttpError(422, 'QUALIFICATION_NOT_SUPPORTED', NOT_SUPPORTED_HINT);
    // 引継ぎIDを新しく作り、取り込みと分解結果をその学習者ごとに保存する（期限なし）
    // 学習の開始（startStudy）で受け取った引継ぎIDがあれば、同じ学習者として使う
    const given = validLearnerId(b.learnerId);
    const learnerId = given ?? newLearnerId();
    await gateEnter(env, learnerId, b.accessCode, now);
    // 再開のときに startSession が呼ばれても、これまでの記録を消さずに続ける
    const restored = given ? await sessionFromLearner(env, given, now) : null;
    if (restored && restored.state.qualificationId === b.qualificationId) {
      const sources = checkSources((await catalogSources(env, b.qualificationId)) ?? b.sources, b.qualificationId, learnerId);
      await startJob(env.STORE, sessionJobId(restored.state), sources, now, { persistent: true });
      await markEngineSources(env, sources);
      return json(201, { sessionId: restored.id, learnerId, job: jobView(await progress(env, sessionJobId(restored.state), now)), ...PLAN_UI });
    }
    const { id, state } = await createSession(env, { qualificationId: b.qualificationId, learnerId, plan: b.plan, sources: b.sources }, now);
    const job = await progress(env, sessionJobId(state), now);
    return json(201, { sessionId: id, learnerId, job: jobView(job), ...PLAN_UI, ...(env.QLP_WIDGET ? { onboarding: onboardingSteps(b.qualificationId) } : {}) });
  }

  if (method === 'POST' && parts[0] === 'v1' && parts[1] === 'sessions' && parts[3] === 'next' && parts.length === 4) {
    const b = await body(request).catch(() => ({}));
    const { id, state } = await resolveSession(env, parts[2], now);
    await gateUse(env, state.learnerId, now);
    const want = typeof b?.question === 'string' && b.question.trim() ? b.question.trim().slice(0, 40) : null;
    return json(200, await nextView(env, id, state, now, { want }));
  }

  if (method === 'POST' && parts[0] === 'v1' && parts[1] === 'sessions' && parts[3] === 'answer' && parts.length === 4) {
    const b = await body(request);
    const { id, state } = await resolveSession(env, parts[2], now);
    const acc = await gateUse(env, state.learnerId, now, { answering: true });
    // 採点は出題時に控えた正答だけで行う（公式PDF・保存データは読み直さない）
    const r = grade(state, { questionId: b.questionId, value: b.value, confidence: b.confidence }, { today: jstToday(now), now });
    if (!r.ok) {
      // 原因を後から確かめられるよう、送られた番号と出題中の番号だけを残す（回答の中身は残さない）
      console.warn(JSON.stringify({ event: 'answer_rejected', reason: r.reason, given: String(b.questionId ?? '').slice(0, 80), current: state.current?.questionId ?? null }));
      throw new HttpError(409, r.reason);
    }
    if (!r.grade.alreadyGraded) {
      await saveSession(env, id, r.state, now);
      if (acc) await countUse(env.STORE, acc.hash, jstToday(now));
    }
    // 診断：送られた番号と採点の結果（回答の中身以外・個人情報なし）
    console.log(JSON.stringify({ event: 'answer_graded', questionId: r.grade.questionId, given: String(b.questionId ?? '').slice(0, 80), value: String(b.value ?? '').slice(0, 10), selected: r.grade.selected ?? null, correctAnswer: r.grade.correctAnswer ?? null, correct: r.grade.correct ?? null, alreadyGraded: !!r.grade.alreadyGraded, viaMcp: !!env.QLP_MCP }));
    // 解説の書き方：学習段階と、エンジンの採点記録（苦手な分野・今回の正誤）に合わせる
    const names = Object.values(CATALOG).find((c) => c.qualificationId === r.state.qualificationId)?.fields ?? {};
    const prof = r.state.learnerId ? await env.STORE.get(learnerProfileKey(r.state.learnerId), 'json') : null;
    const fid = r.state.history?.[r.grade.questionId]?.fieldId ?? null;
    const how = explainHow({ stage: prof?.stage, weak: weakFields(r.state.history, names), grade: r.grade, fieldName: fid ? names[fid] ?? null : null });
    // 次の問題も同じ応答で返す（AIアプリの「許可」の確認が、採点と出題で2回出るのを1回にするため）。
    // 表示は利用者が次へ進むときでよい（出題済みの問は、nextQuestion を呼んでも同じ問が返る）
    const next = await nextView(env, id, r.state, now, { prefetched: true });
    // 次の問題の図のファイルも、この応答で付ける（利用者が次へ進んだときに、ChatGPTが添付として表示する）
    const { openaiFileResponse, ...nextBody } = next;
    return json(200, { grade: { ...r.grade, explainHow: how }, next: nextBody, ...(openaiFileResponse ? { openaiFileResponse } : {}) });
  }

  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'sessions' && parts[3] === 'handoff' && parts.length === 4) {
    const { state } = await resolveSession(env, parts[2], now);
    return json(200, { handoff: exportHandoff(state) });
  }

  // 学習の開始：時刻はエンジンが取る（AIに推測させない）。引継ぎIDごとの累計学習時間も返す
  if (method === 'POST' && url.pathname === '/v1/study/start') {
    const b = await body(request);
    const given = validLearnerId(b.learnerId);
    const learnerId = given ?? newLearnerId();
    const study = newStudy({ qualificationName: b.qualificationName, learnerId, now });
    const studyId = crypto.randomUUID();
    await env.STORE.put(studyKey(studyId), JSON.stringify(study), { expirationTtl: STUDY_TTL_S });
    await env.STORE.put(lastStudyKey(learnerId), studyId, { expirationTtl: STUDY_TTL_S });
    const total = (await env.STORE.get(timeKey(learnerId), 'json'))?.minutes ?? 0;
    // 前回答えていない問があれば、その問から続けるかを利用者に選んでもらう（勝手には出さない）
    const savedState = given ? await env.STORE.get(learnerStateKey(learnerId), 'json') : null;
    const pendingQuestion = pendingLabel(savedState);
    // 学習段階：今回答えた段階（stage）があれば残す。無ければ前回までに残した段階を使う
    const stageNow = stageNumber(b.stage);
    if (stageNow) await env.STORE.put(learnerProfileKey(learnerId), JSON.stringify({ stage: stageNow, updatedAt: now }));
    const stage = stageNow ?? (given ? (await env.STORE.get(learnerProfileKey(learnerId), 'json'))?.stage ?? null : null);
    const names = Object.values(CATALOG).find((c) => c.qualificationId === savedState?.qualificationId)?.fields ?? {};
    const t = jst(now);
    return json(201, {
      studyId,
      learnerId,
      resumed: !!given,
      startDate: t.date,
      startTime: t.time,
      totalMinutes: total,
      pendingQuestion,
      display: `📚 学習開始｜${t.time}\n🔑 引継ぎID：${learnerId}（別のチャットやAIで続けるときに使います）${total > 0 ? `\n📊 これまでの累計学習時間：${formatTotal(total)}` : ''}`,
      itemMenu: ITEM_MENU,
      howToShow: ITEM_HOW,
      learnerStage: stage,
      // 解説（項目の解説・採点後の解説）の書き方。この学習の間ずっと従う
      explainHow: explainHow({ stage, weak: weakFields(savedState?.history, names) }),
    });
  }

  // 学習の終了：終了時刻・今回の時間・累計をエンジンが確定し、終了ログと引継ぎデータの全文を返す
  if (method === 'POST' && parts[0] === 'v1' && parts[1] === 'study' && parts[3] === 'end' && parts.length === 4) {
    // studyId の代わりに引継ぎIDが来たときは、その引継ぎIDで最後に始めた学習を終える
    const lid = validLearnerId(parts[2]);
    const studyId = lid ? await env.STORE.get(lastStudyKey(lid)) : parts[2];
    if (!/^[0-9a-f-]{36}$/.test(studyId ?? '')) throw new HttpError(404, 'STUDY_NOT_FOUND');
    const b = await body(request);
    const study = await env.STORE.get(studyKey(studyId), 'json');
    if (!study) throw new HttpError(404, 'STUDY_NOT_FOUND');
    const saved = (await env.STORE.get(timeKey(study.learnerId), 'json')) ?? { minutes: 0, studies: [] };
    // 同じ学習を二度終了しても累計を二重に足さない
    const before = study.endedAt == null ? saved.minutes : saved.minutes - (study.minutes ?? 0);
    let engineHandoff = null;
    let input = b;
    const sesRef = typeof b.sessionId === 'string' && b.sessionId ? b.sessionId : study.learnerId;
    if (sesRef) {
      try {
        const { state: st } = await resolveSession(env, sesRef, now);
        if (st.learnerId) {
          // 記録はエンジン側に引継ぎIDで残す（引継ぎデータには載せない。利用者に内部の記録を見せないため）
          await env.STORE.put(learnerStateKey(st.learnerId), JSON.stringify(st));
        } else {
          engineHandoff = exportHandoff(st);
        }
        // 実践問題（過去問）の正誤は、エンジンが採点した記録で数える（AIの数え間違いを避ける）
        const graded = Object.values(st.history).filter((h) => Number.isFinite(h.gradedAt) && h.gradedAt >= study.startedAt);
        if (graded.length) {
          const right = graded.filter((h) => h.result !== 'wrong').length;
          input = { ...b, results: { ...(b.results ?? {}), practiceCorrect: right, practiceWrong: graded.length - right } };
        }
        // 苦手な分野・今回解いた問題は、AIが書かなかったときもエンジンの記録から入れる（アプリではAIが採点結果を見ないため）
        const cat = Object.values(CATALOG).find((c) => c.qualificationId === st.qualificationId);
        if (!(input.weaknesses ?? []).length) {
          const weak = weakFields(st.history, cat?.fields ?? {});
          if (weak.length) input = { ...input, weaknesses: weak };
        }
        if (!(input.contents ?? []).length && graded.length) {
          input = { ...input, contents: graded.map((h) => `${h.source?.year ?? '年度未確認'}年度 問${h.source?.number ?? '?'}：${h.result === 'wrong' ? '不正解' : '正解'}`) };
        }
        const skipped = (st.skipped ?? []).filter((x) => Number.isFinite(x.at) && x.at >= study.startedAt);
        if (skipped.length) {
          const detail = skipped.map((x) => `${x.year ?? '年度未確認'}年度 問${x.questionNumber ?? '?'}`).join('、');
          input = { ...input, results: { ...(input.results ?? {}), skipped: skipped.length, skippedDetail: detail } };
        }
      } catch {
        engineHandoff = null;
      }
    }
    // 学習段階が書かれていれば残す（次のチャットで解説の深さを合わせるため）
    const stageEnd = stageNumber(b?.qualification?.stage);
    if (stageEnd) await env.STORE.put(learnerProfileKey(study.learnerId), JSON.stringify({ stage: stageEnd, updatedAt: now }));
    const r = finishStudy(study, before, input, now, engineHandoff);
    if (study.endedAt == null) {
      await env.STORE.put(studyKey(studyId), JSON.stringify(r.study), { expirationTtl: STUDY_TTL_S });
      await env.STORE.put(timeKey(study.learnerId), JSON.stringify({ minutes: r.total, updatedAt: now }));
    }
    return json(200, { minutes: r.minutes, totalMinutes: r.total, log: r.log, handoff: r.handoff, display: r.display });
  }

  // 未対応の資格でも、公式PDFの指定ページ（または見出しを含むページ）を画像にして返す。PDFの検証・分解はしない
  if (method === 'POST' && url.pathname === '/v1/pdf-pages') {
    const b = await body(request);
    if (typeof b.url !== 'string' || !/^https:\/\/[^\s]{4,500}$/.test(b.url)) throw new HttpError(400, 'URL_INVALID');
    const byFind = typeof b.find === 'string' && b.find.length > 0;
    if (byFind) {
      if (b.find.length > 30) throw new HttpError(400, 'FIND_INVALID');
      if (b.span !== undefined && (!Number.isInteger(b.span) || b.span < 1 || b.span > 4)) throw new HttpError(400, 'SPAN_INVALID');
    } else if (!Array.isArray(b.pages) || b.pages.length < 1 || b.pages.length > 4 || b.pages.some((n) => !Number.isInteger(n) || n < 1 || n > 1000)) {
      throw new HttpError(400, 'PAGES_INVALID');
    }
    // エンジンが出題する資格の公式PDFは、ここでページを出さない（AIが出題の表示を飛ばして、ページ全体の画像を出さないように）
    if (await env.STORE.get(sourceKey(await sha256Hex(new TextEncoder().encode(b.url))))) {
      throw new HttpError(409, 'ENGINE_QUESTION', 'この問題はエンジンが出題します。renderPdfPages は使わず、nextQuestion（または submitAnswer の next）の question.screen をそのまま出してください。');
    }
    if (!env.PARSER_URL) throw new HttpError(503, 'PAGE_IMAGES_UNAVAILABLE');
    let bytes;
    try {
      bytes = await withStoredSources(env.STORE, env.fetchPdf ?? defaultFetchPdf)(b.url);
    } catch {
      throw new HttpError(502, 'PDF_FETCH_FAILED');
    }
    if (!bytes || bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new HttpError(422, 'NOT_A_PDF');
    const sha = await sha256Hex(bytes);
    // 表の文字と図の切り出しは毎回分解サーバーで作る（ページ画像だけの保存では表を返せないため）
    let r;
    try {
      r = await renderPages({ endpoint: env.PARSER_URL, token: env.PARSER_TOKEN, fetch: env.parserFetch, bytes, ...(byFind ? { find: b.find, span: b.span ?? 2 } : { pages: [...new Set(b.pages)].sort((x, y) => x - y) }) });
    } catch (e) {
      const code = e instanceof IngestError ? e.code : 'PAGE_RENDER_FAILED';
      throw new HttpError(['PAGE_OUT_OF_RANGE', 'PAGES_INVALID', 'PDF_UNREADABLE', 'FIND_NOT_FOUND', 'FIND_INVALID', 'SPAN_INVALID'].includes(code) ? 422 : 502, code);
    }
    const pageNums = Object.keys(r.pages).map((f) => Number(/^p(\d+)\.png$/.exec(f)[1])).sort((x, y) => x - y);
    for (const n of pageNums) await env.STORE.put(`pgimg/${sha}/${n}`, r.pages[`p${n}.png`], { expirationTtl: 26 * 60 * 60 });
    const range = pageNums.length ? `${pageNums[0]}-${pageNums[pageNums.length - 1]}` : '';
    if (r.excerpt && range) await env.STORE.put(`fig/pgpdf/${sha}/${range}`, r.excerpt);
    const base = env.PUBLIC_BASE_URL ?? '';
    const pages = pageNums.map((n) => ({ page: n, url: `${base}/v1/pageimg/${sha}/p${n}.png` }));
    // ChatGPTは外部の画像を回答に表示しないので、図だけを切り出したPDFをファイルとして渡す（openaiFileResponse）。AI側のPythonで画像にする
    const fileUrl = `${base}/v1/pagepdf/${sha}/${range}.pdf`;
    const figureCount = r.figures.length;
    const notice = figureCount
      ? '公式PDFから問題の図を切り出して、ファイル（PDF）で付けました。チャットに出たファイルをタップすると、公式の図をそのまま見られます。'
      : `公式PDFの${pageNums[0]}〜${pageNums[pageNums.length - 1]}ページを、ファイル（PDF）で付けました。チャットに出たファイルをタップすると、公式のページをそのまま見られます。`;
    return json(200, {
      pageCount: r.pageCount ?? null,
      matchedPage: r.matchedPage,
      pages,
      display: r.display,
      tables: tablesMarkdown(r.tables),
      figureCount,
      fileUrl,
      notice,
      openaiFileResponse: [fileUrl],
    });
  }

  if (method === 'POST' && url.pathname === '/v1/handoff/import') {
    const b = await body(request);
    // 引継ぎデータにエンジンの記録が無いとき（今の形）は、引継ぎIDで残した記録から続ける
    let state;
    try {
      state = importHandoff(b.handoff, { now });
    } catch (e) {
      // AIは引継ぎデータを要約したり、IDだけを渡したり、太字や記号で囲んだりするので、それらしい文字列を順に確かめる
      let saved = null;
      for (const lid of learnerIdCandidates(b.learnerId, b.handoff)) {
        saved = await env.STORE.get(learnerStateKey(lid), 'json');
        if (saved) break;
      }
      if (!saved) {
        console.warn(JSON.stringify({ event: 'handoff_import_failed', candidates: learnerIdCandidates(b.learnerId, b.handoff).length, length: String(b.handoff ?? '').length }));
        throw new HttpError(400, 'HANDOFF_INVALID', HANDOFF_HINT);
      }
      state = resumed(saved);
    }
    await gateEnter(env, state.learnerId, b.accessCode, now);
    let job = null;
    if (b.sources) {
      const persistent = !!state.learnerId;
      const sources = checkSources((await catalogSources(env, state.qualificationId)) ?? b.sources, state.qualificationId, state.learnerId);
      await startJob(env.STORE, sessionJobId(state), sources, now, { persistent });
      await markEngineSources(env, sources);
    }
    if (state.learnerId || b.sources) job = await progress(env, sessionJobId(state), now);
    const id = crypto.randomUUID();
    await saveSession(env, id, state, now);
    if (state.learnerId) await env.STORE.put(lastSessionKey(state.learnerId), id, { expirationTtl: SESSION_TTL_S });
    return json(201, {
      sessionId: id,
      restored: Object.keys(state.history).length,
      withheld: state.withheld.map((w) => ({ ...w, message: WITHHELD_MESSAGES[w.reason] })),
      job: jobView(job),
      resumeMenu: RESUME_MENU,
      howToShow: RESUME_HOW,
    });
  }

  if (parts[0] === 'v1' && parts[1] === 'jobs' && parts.length >= 3) {
    const qid = decodeURIComponent(parts[2]);
    if (!qidOk(qid)) throw new HttpError(404, 'JOB_NOT_FOUND');
    if (method === 'GET' && parts.length === 3) {
      // ?run=all：学習画面から裏で呼ぶとき（取り込みを最後まで進める）
      const runAll = url.searchParams.get('run') === 'all';
      const job = runAll ? await advance(env, qid, now, RUN_ALL_MS, RUN_ALL_MS + 300000) : await progress(env, qid, now);
      if (!job && !runAll && !qid.includes('~')) {
        // AIが資格の番号だけで状況を聞いたとき。404 を返すと、取り込みをやり直してしまう（学習者が別になる）
        return json(200, { job: null, notice: JOB_NOTICE, hint: JOB_BY_SESSION });
      }
      if (!job) throw new HttpError(404, 'JOB_NOT_FOUND');
      // 時間内に終わらなかった分は、続きを別の呼び出しで進める（取り込みが途中で止まらないように）
      const more = job.state === 'running' || staleSources(job, deps(env).parserVersion).length;
      if (runAll && more && !job.leaseUntil) await kickIngest(env, qid, now);
      return json(200, { job: jobView(job) });
    }
    // 経路A：POST /v1/jobs/:qid/sources/:index/result  {result, assets:{file: base64}}
    if (method === 'POST' && parts[3] === 'sources' && parts[5] === 'result' && parts.length === 6) {
      const index = Number(parts[4]);
      if (!Number.isInteger(index) || index < 0) throw new HttpError(404, 'SOURCE_NOT_FOUND');
      const b = await body(request);
      const r = await ingestOne(env.STORE, qid, index, deps(env, { parse: uploadedParse(b), now }), now);
      return json(r.code ? 422 : 200, { accepted: !r.code, reason: r.code, job: jobView(r.job) });
    }
  }

  throw new HttpError(404, 'NOT_FOUND');
}

async function mcp(request, env, url, now, widget = false) {
  let msg;
  try {
    msg = JSON.parse(await request.text());
  } catch {
    return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  // ツールの呼び出しは、認証済みの API 呼び出しとして同じ処理に回す
  const callApi = async (method, path, body) => {
    const inner = new Request(new URL(path, url), {
      method,
      headers: { authorization: `Bearer ${env.API_TOKEN}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await handle(inner, widget ? { ...env, QLP_MCP: true, QLP_WIDGET: true } : { ...env, QLP_MCP: true });
    return { status: res.status, body: await res.json() };
  };
  const batch = Array.isArray(msg);
  // 診断用：どの呼び出しが来たか（方法とツール名だけ。引数・合言葉は記録しない）
  for (const m of batch ? msg : [msg]) console.log(JSON.stringify({ event: 'mcp_rpc', route: widget ? 'app' : 'mcp', method: m?.method, tool: m?.params?.name }));
  const opts = { widget, baseUrl: env.PUBLIC_BASE_URL ?? url.origin };
  const out = (await Promise.all((batch ? msg : [msg]).map((m) => handleRpc(m, callApi, opts)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return json(200, batch ? out : out[0]);
}

/** 合言葉が合わないとき、運営者が直せるように「どう違うか」だけを返す（合言葉の中身は返さない）。 */
function authHint(auth, token) {
  if (!token) return 'server_token_not_set';
  if (!auth) return 'no_authorization_header';
  if (!auth.startsWith('Bearer ')) return 'not_bearer';
  const t = auth.slice(7);
  if (t.includes('/')) return 'looks_like_a_path_not_the_value';
  if (t !== t.trim() || /\s/.test(t)) return 'contains_whitespace';
  return `wrong_value_length_${t.length}`;
}

/** アプリ専用の合言葉：主のトークンから決まる（主のトークンを変えれば変わる。VERSION を変えても作り直せる）。 */
const APP_KEY_VERSION = 'qlp-app-v1';
export function appKey(token) {
  return token ? createHmac('sha256', token).update(APP_KEY_VERSION).digest('hex').slice(0, 40) : null;
}

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** アプリで最初に聞く確認（免除・学習状況）。ChatGPT に任せると自分の選択肢画面で聞くので、エンジンの画面（ボタン）で聞く */
function onboardingSteps(qid) {
  const c = Object.values(CATALOG).find((x) => x.qualificationId === qid);
  const steps = [];
  if (c?.exemption) steps.push({ kind: 'exempt', prompt: FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.prompt, choices: [...FIXED_UI_CHOICES.EXEMPTION_USE_CONFIRM.choices], notice: c.exemption.label });
  steps.push({ kind: 'status', prompt: '現在の学習状況を選んでください。', choices: ['未着手', '基礎学習中', '応用学習中', '過去問演習中'] });
  return steps;
}

/** 利用コードの確認（ChatGPT アプリだけ。設定の required が true のときだけ働く） */
async function gateEnter(env, learnerId, code, now) {
  if (!env.QLP_WIDGET || !(await accessConfig(env.STORE)).required) return;
  const day = jstToday(now);
  if (await learnerAccess(env.STORE, learnerId, day)) return;
  const ok = await checkCode(env.STORE, code);
  if (!ok) throw new HttpError(403, 'ACCESS_CODE_REQUIRED', NEED_CODE + '（利用者が入力したコードを accessCode に入れて、もう一度呼ぶ。コードを推測・補完しない）');
  await grantLearner(env.STORE, learnerId, ok.hash);
}

async function gateUse(env, learnerId, now, { answering = false } = {}) {
  if (!env.QLP_WIDGET || !(await accessConfig(env.STORE)).required) return null;
  const day = jstToday(now);
  const a = await learnerAccess(env.STORE, learnerId, day);
  if (!a) throw new HttpError(403, 'ACCESS_CODE_REQUIRED', NEED_CODE + '（startSession を、利用者が入力したコード accessCode つきで呼ぶ）');
  if (answering && a.used >= a.limit) throw new HttpError(429, 'DAILY_LIMIT', LIMIT_MSG);
  return a;
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const now = env.clock ? env.clock() : Date.now();
  try {
    return await route(request, env, url, now);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, e.detail ? { error: e.code, hint: e.detail } : { error: e.code });
    if (e instanceof IngestError) return json(422, { error: e.code });
    if (e?.message === 'HANDOFF_INVALID' || e?.message === 'HANDOFF_TOO_LARGE') return json(400, { error: e.message });
    return json(500, { error: 'INTERNAL_ERROR' });
  }
}

