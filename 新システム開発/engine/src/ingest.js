/**
 * 過去問の取り込み（設計計画§1）。
 *
 * 公式PDFを取得 → SHA-256 → 24時間保存を確認 → 無ければ分解（経路A：AIアプリが分解して送る／
 * 経路B：Cloud Run）→ 検査 → 保存。1つのPDFが失敗しても、ほかのPDFの取り込みは続ける。
 *
 * 取り込みは「1回の呼び出しで時間の許す分だけ進める」形にしている（Workersは1回の処理時間に
 * 上限があるため）。残りは次の呼び出しで続きから進む。
 */
import { readResult, readSource, writeResult, writeSource } from './cache.js';
import { sha256Hex } from './store.js';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const SLOW_AFTER_MS = 20 * 1000;

export class IngestError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

function isPdf(bytes) {
  return bytes instanceof Uint8Array && bytes.length > 5 && PDF_MAGIC.every((b, i) => bytes[i] === b);
}

async function fetchVerified(fetchPdf, url) {
  let bytes;
  try {
    bytes = await fetchPdf(url);
  } catch (e) {
    throw new IngestError('PDF_FETCH_FAILED', { url, error: String(e?.message ?? e) });
  }
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!isPdf(bytes)) throw new IngestError('PDF_INVALID', { url });
  if (bytes.length > MAX_PDF_BYTES) throw new IngestError('PDF_TOO_LARGE', { url });
  return { bytes, sha256: await sha256Hex(bytes) };
}

/** 公式PDFの現在の SHA-256（24時間以内に確かめた値があればそれを使う）。PDF本体も返すことがある。 */
export async function currentSha(store, fetchPdf, url, now) {
  const known = await readSource(store, url, now);
  if (known) return { sha256: known.sha256, bytes: null };
  const got = await fetchVerified(fetchPdf, url);
  await writeSource(store, url, got.sha256, now);
  return got;
}

const QUESTION_ID = (s, n) => `${s.qualificationId}:${s.year}:${s.section}:${n}`;

/**
 * 分解結果を検査する（経路Aではアプリ側から届くので、信用せずに確かめる）。
 * 形の崩れたパケットはその問だけ外し、理由を付けて excluded に足す。
 */
export async function validateResult(src, shas, parserVersion, result, assets) {
  if (!result || typeof result !== 'object') throw new IngestError('RESULT_INVALID');
  if (result.status === 'unavailable') throw new IngestError('PARSER_UNAVAILABLE', { reason: result.reason });
  if (!['ready', 'partial'].includes(result.status)) throw new IngestError('RESULT_INVALID');
  if (result.parserVersion !== parserVersion) throw new IngestError('PARSER_VERSION_MISMATCH', { got: result.parserVersion });
  if (result.questionPdfSha256 !== shas.question || result.answerPdfSha256 !== shas.answer) {
    throw new IngestError('RESULT_SHA_MISMATCH');
  }
  if (result.qualificationId !== src.qualificationId || result.year !== src.year || result.section !== src.section) {
    throw new IngestError('RESULT_SOURCE_MISMATCH');
  }
  const assetSha = {};
  for (const [file, bytes] of Object.entries(assets ?? {})) assetSha[file] = await sha256Hex(bytes);
  const seen = new Map();
  for (const p of result.packets ?? []) seen.set(p.questionNumber, (seen.get(p.questionNumber) ?? 0) + 1);
  const packets = [];
  const excluded = [...(result.excluded ?? [])];
  for (const p of result.packets ?? []) {
    const reason = packetProblem(src, shas, p, seen, assetSha);
    if (reason) excluded.push({ questionNumber: p?.questionNumber ?? null, reason });
    else packets.push(p);
  }
  return { ...result, packets, excluded, packetCount: packets.length, status: packets.length ? (excluded.length ? 'partial' : 'ready') : 'unavailable' };
}

function packetProblem(src, shas, p, seen, assetSha) {
  if (!p || !Number.isInteger(p.questionNumber)) return 'PACKET_INVALID';
  if (seen.get(p.questionNumber) > 1) return 'QUESTION_NUMBER_DUPLICATED';
  if (p.questionId !== QUESTION_ID(src, p.questionNumber)) return 'QUESTION_ID_MISMATCH';
  if (p.questionPdfSha256 !== shas.question || p.answerPdfSha256 !== shas.answer) return 'PACKET_SHA_MISMATCH';
  if (!Array.isArray(p.choices) || p.choices.length < 2 || p.choices.some((c) => typeof c !== 'string' || !c.trim())) return 'CHOICES_INCOMPLETE';
  if (!Number.isInteger(p.correctAnswer) || p.correctAnswer < 1 || p.correctAnswer > p.choices.length) return 'OFFICIAL_ANSWER_OUT_OF_RANGE';
  if (p.stemMode !== 'official_image' && (typeof p.stem !== 'string' || !p.stem.trim())) return 'STEM_EMPTY';
  const figures = Array.isArray(p.figures) ? p.figures : [];
  if (figures.some((f) => !f?.file || assetSha[f.file] !== f.sha256)) return 'FIGURE_ASSET_MISMATCH';
  if ((p.stemMode === 'official_image' || p.choiceMode === 'official_image' || p.diagramRequired) && !figures.length) return 'FIGURE_REQUIRED_NOT_AVAILABLE';
  return null;
}

/**
 * 1つの問題PDF（＋正答PDF）を取り込む。
 * deps: { store, fetchPdf(url) -> bytes, parse(input) -> {result, assets}, parserVersion, now }
 */
export async function ingestSource(src, deps) {
  const { store, fetchPdf, parse, parserVersion, now } = deps;
  const q = await currentSha(store, fetchPdf, src.questionUrl, now);
  const a = src.answerUrl && src.answerUrl !== src.questionUrl ? await currentSha(store, fetchPdf, src.answerUrl, now) : q;
  const keyParts = { ...pick(src), questionSha256: q.sha256, answerSha256: a.sha256, parserVersion };
  if (src.expectedQuestionSha256 && src.expectedQuestionSha256 !== q.sha256) throw new IngestError('PDF_HASH_MISMATCH', { url: src.questionUrl });
  const cached = await readResult(store, keyParts, now);
  if (cached.hit) return { from: 'cache', keyParts, result: cached.result };

  // 保存が無い・期限切れ：分解する。控えのSHAで判断したときはPDF本体を取り直す
  // （経路Aは分解がアプリ側なのでPDF本体は要らない。届いた結果のSHAを控えと照合する）
  const needsBytes = parse.needsBytes !== false;
  const qBytes = needsBytes ? q.bytes ?? (await fetchVerified(fetchPdf, src.questionUrl)).bytes : null;
  const aBytes = !needsBytes ? null : a === q ? qBytes : a.bytes ?? (await fetchVerified(fetchPdf, src.answerUrl)).bytes;
  const qSha = needsBytes ? await sha256Hex(qBytes) : q.sha256;
  const aSha = !needsBytes ? a.sha256 : a === q ? qSha : await sha256Hex(aBytes);
  if (qSha !== q.sha256 || aSha !== a.sha256) {
    // 24時間の間に公式PDFが差し替わった：新しい方で控えを作り直し、次の呼び出しで取り込む
    await writeSource(store, src.questionUrl, qSha, now);
    if (a !== q) await writeSource(store, src.answerUrl, aSha, now);
    throw new IngestError('PDF_CHANGED_DURING_INGEST', { url: src.questionUrl });
  }
  let parsed;
  try {
    parsed = await parse({
      adapter: src.adapter,
      year: src.year,
      section: src.section,
      question: { url: src.questionUrl, sha256: qSha, bytes: qBytes },
      answer: a === q ? null : { url: src.answerUrl, sha256: aSha, bytes: aBytes },
    });
  } catch (e) {
    if (e instanceof IngestError) throw e;
    throw new IngestError('PARSER_FAILED', { error: String(e?.message ?? e) });
  }
  const result = await validateResult(src, { question: qSha, answer: aSha }, parserVersion, parsed?.result, parsed?.assets);
  if (result.status === 'unavailable') throw new IngestError('NO_USABLE_QUESTION', { excluded: result.excluded });
  const used = new Set(result.packets.flatMap((p) => (p.figures ?? []).map((f) => f.file)));
  const assets = Object.fromEntries(Object.entries(parsed.assets ?? {}).filter(([f]) => used.has(f)));
  await writeResult(store, keyParts, result, assets, now);
  return { from: 'parsed', keyParts, result };
}

function pick(src) {
  return { qualificationId: src.qualificationId, year: src.year, section: src.section };
}

// ---- 取り込みジョブ（資格ごと） ----

const jobKey = (qualificationId) => `job/${encodeURIComponent(qualificationId)}`;

export async function readJob(store, qualificationId) {
  return store.get(jobKey(qualificationId), 'json');
}

/** 資格名が決まった時点で登録する（方針3）。同じ資格の取り込みが24時間以内に済んでいれば作り直さない。 */
export async function startJob(store, qualificationId, sources, now) {
  const old = await readJob(store, qualificationId);
  if (old && old.state !== 'failed' && now - old.startedAt < 24 * 60 * 60 * 1000) return old;
  const job = {
    qualificationId,
    state: 'running',
    startedAt: now,
    updatedAt: now,
    sources: sources.map((s) => ({ ...s, status: 'pending' })),
  };
  await store.put(jobKey(qualificationId), JSON.stringify(job), { expirationTtl: 26 * 60 * 60 });
  return job;
}

/**
 * 取り込みを、時間の許す分だけ進める。budgetMs を過ぎたら残りは次回。
 * 返り値の job.notice は、AIが利用者へそのまま伝える文（時間がかかっているとき）。
 */
export async function stepJob(store, qualificationId, deps, { budgetMs = 20000, clock = () => Date.now() } = {}) {
  const job = await readJob(store, qualificationId);
  if (!job) throw new IngestError('JOB_NOT_FOUND');
  const begin = clock();
  let changed = false;
  for (const s of job.sources) {
    if (s.status !== 'pending' || s.reason === 'AWAITING_UPLOAD') continue; // 経路Aの結果待ちは ingestOne で進める
    if (clock() - begin >= budgetMs) break;
    const code = await settle(s, deps, deps.now ?? clock());
    changed = true;
    if (code === 'PDF_CHANGED_DURING_INGEST') break;
  }
  if (changed) await saveJob(store, job, clock());
  return withNotice(job, clock());
}

/** 1つの取り込み元を処理して、結果を job.sources の要素に書き込む。失敗の理由コードを返す。 */
async function settle(s, deps, now) {
  try {
    const r = await ingestSource(s, { ...deps, now });
    Object.assign(s, { status: 'done', from: r.from, packetCount: r.result.packetCount, excludedCount: r.result.excluded.length, keyParts: r.keyParts, reason: null });
    return null;
  } catch (e) {
    const code = e instanceof IngestError ? e.code : 'INGEST_FAILED';
    // 取り込み中に公式PDFが差し替わったときと、経路Aで分解結果がまだ届いていないときは、やり直せるので待ちに戻す
    const retry = code === 'PDF_CHANGED_DURING_INGEST' || code === 'AWAITING_UPLOAD';
    Object.assign(s, { status: retry ? 'pending' : 'failed', reason: code });
    return code;
  }
}

async function saveJob(store, job, now) {
  const pending = job.sources.filter((s) => s.status === 'pending').length;
  const done = job.sources.filter((s) => s.status === 'done').length;
  job.state = pending ? 'running' : done ? 'done' : 'failed';
  job.updatedAt = now;
  await store.put(jobKey(job.qualificationId), JSON.stringify(job), { expirationTtl: 26 * 60 * 60 });
}

/**
 * 経路A：アプリから届いた分解結果で、指定の取り込み元を1つだけ処理する。
 * 届いた結果はほかの経路と同じく、公式PDFのSHA-256と照合・検査してから保存する。
 */
export async function ingestOne(store, qualificationId, index, deps, now) {
  const job = await readJob(store, qualificationId);
  if (!job) throw new IngestError('JOB_NOT_FOUND');
  const s = job.sources[index];
  if (!s) throw new IngestError('SOURCE_NOT_FOUND');
  if (s.status === 'done') return { job: withNotice(job, now), source: s, code: null };
  const code = await settle(s, deps, now);
  await saveJob(store, job, now);
  return { job: withNotice(job, now), source: s, code };
}

export function withNotice(job, now) {
  const slow = job.state === 'running' && now - job.startedAt >= SLOW_AFTER_MS;
  return { ...job, notice: slow ? '過去問の取り込みに時間がかかっています。取り込みが済んだ問題から出題します。' : null };
}
