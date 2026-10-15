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
 *   PARSER_VERSION 受け付ける分解結果の版（既定 0.3.0）
 */
import { readFigure } from './cache.js';
import { availablePackets, grade, jstToday, newState, pickNext, pin, present } from './engine.js';
import { exportHandoff, importHandoff, WITHHELD_MESSAGES } from './handoff.js';
import { IngestError, ingestOne, readJob, startJob, stepJob, withNotice } from './ingest.js';
import { awaitUpload, httpParser, uploadedParse } from './parser-client.js';

const DEFAULT_PARSER_VERSION = '0.3.0';
const MAX_SOURCES = 40;
const MAX_BODY = 16 * 1024 * 1024;
const SESSION_TTL_S = 26 * 60 * 60;
const SESSION_MS = 24 * 60 * 60 * 1000;
const STEP_BUDGET_MS = 15000;
const ADAPTERS = new Set(['takken', 'surveyor']);

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
  return { store: env.STORE, fetchPdf: env.fetchPdf ?? defaultFetchPdf, parse, parserVersion, ...extra };
}

async function defaultFetchPdf(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { accept: 'application/pdf' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!/^https:\/\//.test(res.url || url)) throw new Error('REDIRECT_NOT_HTTPS');
  return new Uint8Array(await res.arrayBuffer());
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

function checkSources(sources, qualificationId) {
  if (!Array.isArray(sources) || !sources.length || sources.length > MAX_SOURCES) throw new HttpError(400, 'SOURCES_INVALID');
  return sources.map((s) => {
    const ok = s && ADAPTERS.has(s.adapter) && Number.isInteger(s.year) && typeof s.section === 'string' && s.section && s.section.length <= 50
      && /^https:\/\/\S+$/.test(s.questionUrl ?? '') && s.questionUrl.length <= 500
      && (s.answerUrl == null || (/^https:\/\/\S+$/.test(s.answerUrl) && s.answerUrl.length <= 500));
    if (!ok) throw new HttpError(400, 'SOURCES_INVALID');
    return { qualificationId, adapter: s.adapter, year: s.year, section: s.section, questionUrl: s.questionUrl, answerUrl: s.answerUrl ?? null };
  });
}

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
}

/** 利用者に見せる取り込みの状況（URLとSHAは経路Aでアプリが分解するときに使う）。 */
function jobView(job) {
  if (!job) return null;
  return {
    state: job.state,
    notice: job.notice ?? null,
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

async function advance(env, qualificationId, now, budgetMs) {
  const job = await readJob(env.STORE, qualificationId);
  if (!job) return null;
  if (job.state !== 'running') return withNotice(job, now);
  return stepJob(env.STORE, qualificationId, deps(env, { now }), { budgetMs, clock: env.clock ?? Date.now });
}

async function route(request, env, url, now) {
  const parts = url.pathname.split('/').filter(Boolean);
  const method = request.method;

  // 図（画像表示用。トークン不要。キーにSHA-256が入るので推測できない）
  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'figure' && parts.length === 5) {
    const [qsha, pv, file] = parts.slice(2).map(decodeURIComponent);
    if (!/^[a-f0-9]{64}$/.test(qsha)) throw new HttpError(404, 'FIGURE_NOT_FOUND');
    const bytes = await readFigure(env.STORE, qsha, pv, file);
    if (!bytes) throw new HttpError(404, 'FIGURE_NOT_FOUND');
    return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' } });
  }

  const auth = request.headers.get('authorization') ?? '';
  if (!env.API_TOKEN || !timingSafeEqual(auth, `Bearer ${env.API_TOKEN}`)) throw new HttpError(401, 'UNAUTHORIZED');

  if (method === 'POST' && url.pathname === '/v1/sessions') {
    const b = await body(request);
    if (!qidOk(b.qualificationId)) throw new HttpError(400, 'QUALIFICATION_INVALID');
    const sources = checkSources(b.sources, b.qualificationId);
    await startJob(env.STORE, b.qualificationId, sources, now);
    const job = await advance(env, b.qualificationId, now, STEP_BUDGET_MS);
    const id = crypto.randomUUID();
    await saveSession(env, id, newState({ qualificationId: b.qualificationId, plan: b.plan ?? {}, now }), now);
    return json(201, { sessionId: id, job: jobView(job) });
  }

  if (method === 'POST' && parts[0] === 'v1' && parts[1] === 'sessions' && parts[3] === 'next' && parts.length === 4) {
    let state = await loadSession(env, parts[2], now);
    const job = await advance(env, state.qualificationId, now, STEP_BUDGET_MS);
    const items = await availablePackets(env.STORE, job, now);
    const pick = pickNext(state, items, { today: jstToday(now), job });
    if (pick.status !== 'question') {
      return json(200, { status: pick.status, notice: job?.notice ?? null, job: jobView(job) });
    }
    state = pin(state, pick.item, pick.kind, now);
    await saveSession(env, parts[2], state, now);
    return json(200, { status: 'question', repeated: !!pick.repeated, question: present(pick.item, pick.kind, `${env.PUBLIC_BASE_URL ?? ''}/v1/figure`), notice: job?.notice ?? null });
  }

  if (method === 'POST' && parts[0] === 'v1' && parts[1] === 'sessions' && parts[3] === 'answer' && parts.length === 4) {
    const b = await body(request);
    const state = await loadSession(env, parts[2], now);
    // 採点は出題時に控えた正答だけで行う（公式PDF・保存データは読み直さない）
    const r = grade(state, { questionId: b.questionId, value: b.value, confidence: b.confidence }, { today: jstToday(now), now });
    if (!r.ok) throw new HttpError(409, r.reason);
    if (!r.grade.alreadyGraded) await saveSession(env, parts[2], r.state, now);
    return json(200, { grade: r.grade });
  }

  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'sessions' && parts[3] === 'handoff' && parts.length === 4) {
    const state = await loadSession(env, parts[2], now);
    return json(200, { handoff: exportHandoff(state) });
  }

  if (method === 'POST' && url.pathname === '/v1/handoff/import') {
    const b = await body(request);
    const state = await importHandoff(b.handoff, { store: env.STORE, fetchPdf: env.fetchPdf ?? defaultFetchPdf, now });
    let job = null;
    if (b.sources) {
      await startJob(env.STORE, state.qualificationId, checkSources(b.sources, state.qualificationId), now);
      job = await advance(env, state.qualificationId, now, STEP_BUDGET_MS);
    }
    const id = crypto.randomUUID();
    await saveSession(env, id, state, now);
    return json(201, {
      sessionId: id,
      restored: Object.keys(state.history).length,
      withheld: state.withheld.map((w) => ({ ...w, message: WITHHELD_MESSAGES[w.reason] })),
      job: jobView(job),
    });
  }

  if (parts[0] === 'v1' && parts[1] === 'jobs' && parts.length >= 3) {
    const qid = decodeURIComponent(parts[2]);
    if (!qidOk(qid)) throw new HttpError(404, 'JOB_NOT_FOUND');
    if (method === 'GET' && parts.length === 3) {
      const job = await advance(env, qid, now, STEP_BUDGET_MS);
      if (!job) throw new HttpError(404, 'JOB_NOT_FOUND');
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

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const now = env.clock ? env.clock() : Date.now();
  try {
    return await route(request, env, url, now);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code });
    if (e instanceof IngestError) return json(422, { error: e.code });
    if (e?.message === 'HANDOFF_INVALID' || e?.message === 'HANDOFF_TOO_LARGE') return json(400, { error: e.message });
    return json(500, { error: 'INTERNAL_ERROR' });
  }
}

