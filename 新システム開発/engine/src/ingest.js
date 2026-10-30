/**
 * 過去問の取り込み（設計計画§1）。
 *
 * 公式PDFを取得 → SHA-256 → 24時間保存を確認 → 無ければ分解（経路A：AIアプリが分解して送る／
 * 経路B：Cloud Run）→ 検査 → 保存。1つのPDFが失敗しても、ほかのPDFの取り込みは続ける。
 *
 * 取り込みは「1回の呼び出しで時間の許す分だけ進める」形にしている（1回の応答を長く待たせない
 * ため）。残りは次の呼び出しで続きから進む。
 */
import { readFigure, readResult, readSource, writeResult, writeSource } from './cache.js';
import { sha256Hex } from './store.js';
import { learningPolicy } from './learning-policy.js';

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

/** 正答がPDFでなくウェブページで公開されている資格（行政書士）。URLが .html で、中身がHTMLのときだけ受け付ける。 */
function isHtmlPage(url, bytes) {
  if (!/\.html?$/i.test(String(url)) || !(bytes instanceof Uint8Array)) return false;
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).replace(/^\uFEFF/, '').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

async function fetchVerified(fetchPdf, url) {
  let bytes;
  try {
    bytes = await fetchPdf(url);
  } catch (e) {
    throw new IngestError('PDF_FETCH_FAILED', { url, error: String(e?.message ?? e) });
  }
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!isPdf(bytes) && !isHtmlPage(url, bytes)) throw new IngestError('PDF_INVALID', { url });
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
    else packets.push({ ...p, learningStrategy: learningPolicy(p) });
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
  if (p.acceptedAnswers !== undefined) {
    if (!Array.isArray(p.acceptedAnswers) || p.acceptedAnswers.length < 2
      || new Set(p.acceptedAnswers).size !== p.acceptedAnswers.length
      || p.acceptedAnswers.some((n) => !Number.isInteger(n) || n < 1 || n > p.choices.length)
      || !p.acceptedAnswers.includes(p.correctAnswer)
      || (p.allCorrect === true && p.acceptedAnswers.length !== p.choices.length)
      || typeof p.correctAnswerLabel !== 'string' || !p.correctAnswerLabel.trim()) return 'OFFICIAL_SPECIAL_ANSWER_INVALID';
  } else if (p.allCorrect !== undefined || p.correctAnswerLabel !== undefined) return 'OFFICIAL_SPECIAL_ANSWER_INVALID';
  if (p.stemMode !== 'official_image' && (typeof p.stem !== 'string' || !p.stem.trim())) return 'STEM_EMPTY';
  const figures = Array.isArray(p.figures) ? p.figures : [];
  if (figures.some((f) => !f?.file || assetSha[f.file] !== f.sha256)) return 'FIGURE_ASSET_MISMATCH';
  // 本文用のSVGが無い・合わないときは、その図をPNGだけで出す（問題は除外しない）
  for (const f of figures) {
    if (f.svgFile != null && assetSha[f.svgFile] !== f.svgSha256) {
      delete f.svgFile;
      delete f.svgSha256;
    }
  }
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
  // 明示した共有登録ジョブでは、旧解析版が同じ parserVersion で残した
  // 不完全なキャッシュだけを再解析する。全問検証済みの共有結果は再利用する。
  // 管理者がSHA固定の土地家屋調査士PDFを再検証し、テキスト出題に更新する場合のみ、
  // 同じ版の旧「全ページ画像」結果を意図的に再解析する。個人の記録や他資格には使わない。
  const verifiedLandUpgrade = deps.forceReparseVerifiedLand === true &&
    src.owner === '_shared' && src.adapter === 'land_surveyor' &&
    src.qualificationId === 'land_surveyor';
  if (cached.hit && !verifiedLandUpgrade &&
      !(deps.forceReparsePartial === true && cached.result?.status !== 'ready'))
    return { from: 'cache', keyParts, result: cached.result };
  // 学習者ごとの取り込み：同じ公式PDF・同じ分解プログラムの版で分解済みの控えがあれば、それを写す（分解し直さない。費用を抑えるため）
  // 権利者の許諾が本人単位の問題は、共通ライブラリの解析結果も複製しない。
  const tplKey = !src.privateLicensedUpload && keyParts.owner && keyParts.owner !== SHARED_OWNER
    ? { ...keyParts, owner: SHARED_OWNER } : null;
  if (tplKey) {
    const tpl = await readResult(store, tplKey, now);
    const assets = tpl.hit ? await readAssets(store, tplKey, tpl.result) : null;
    if (assets) {
      await writeResult(store, keyParts, tpl.result, assets, now);
      return { from: 'copy', keyParts, result: tpl.result };
    }
  }

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
      qualificationId: src.qualificationId,
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
  const used = new Set(result.packets.flatMap((p) => (p.figures ?? []).flatMap((f) => (f.svgFile ? [f.file, f.svgFile] : [f.file]))));
  const assets = Object.fromEntries(Object.entries(parsed.assets ?? {}).filter(([f]) => used.has(f)));
  await writeResult(store, keyParts, result, assets, now);
  if (tplKey) await writeResult(store, tplKey, result, assets, now);
  return { from: 'parsed', keyParts, result };
}

/** 分解結果を写すときの控えの持ち主（学習者の引継ぎIDとは重ならない名前）。期限なしで残す */
const SHARED_OWNER = '_shared';

/** 控えの図をすべて読む。1つでも欠けていたら null（そのときは分解し直す） */
async function readAssets(store, keyParts, result) {
  const files = new Set((result.packets ?? []).flatMap((p) => (p.figures ?? []).flatMap((f) => (f.svgFile ? [f.file, f.svgFile] : [f.file]))));
  const out = {};
  for (const f of files) {
    const b = await readFigure(store, keyParts.questionSha256, keyParts.parserVersion, f, keyParts.owner);
    if (b == null) return null;
    out[f] = b instanceof ArrayBuffer ? new Uint8Array(b) : b;
  }
  return out;
}

function pick(src) {
  const out = { qualificationId: src.qualificationId, year: src.year, section: src.section };
  if (src.owner) out.owner = src.owner;
  return out;
}

// ---- 取り込みジョブ（資格ごと） ----

const jobKey = (qualificationId) => `job/${encodeURIComponent(qualificationId)}`;
const IMPORT_EVENT_MAX = 24;

/** 元PDFの保存URL・権利情報は履歴に複製せず、取込み状態の変化だけを記録する。 */
function auditSource(source, status, now, { reason=null, questions=null, excluded=null }={}) {
  const entry = {
    at:now, status,
    ...(typeof reason==='string' && reason ? { reason:reason.slice(0,80) } : {}),
    ...(Number.isInteger(questions) ? { questions } : {}),
    ...(Number.isInteger(excluded) ? { excluded } : {}),
  };
  source.importEvents=[...(Array.isArray(source.importEvents)?source.importEvents:[]),entry].slice(-IMPORT_EVENT_MAX);
}

/** 同じ学習者・資格のジョブだけを渡し、保存URLやSHAを含めず履歴の要約を返す。 */
export function importHistoryView(job) {
  if(!job || !Array.isArray(job.sources)) return [];
  return job.sources.map((s)=>{
    const events=Array.isArray(s.importEvents)?s.importEvents.filter((e)=>e&&
      Number.isFinite(e.at)&&typeof e.status==='string').slice(-IMPORT_EVENT_MAX):[];
    return {
      year:Number.isInteger(s.year)?s.year:null,
      section:typeof s.section==='string'?s.section:'',
      status:s.status==='done'?'done':s.status==='failed'?'failed':s.status==='running'?'running':'pending',
      questions:Number.isInteger(s.packetCount)?s.packetCount:0,
      excluded:Number.isInteger(s.excludedCount)?s.excludedCount:0,
      reason:s.status==='failed'&&typeof s.reason==='string'?s.reason.slice(0,80):null,
      events,
      // v133以前の履歴は推測で復元しない。最終状態だけを表示する。
      historicalDetailAvailable:events.length>0,
    };
  }).sort((a,b)=> (b.year??0)-(a.year??0)||a.section.localeCompare(b.section,'ja'));
}

export async function readJob(store, qualificationId) {
  return store.get(jobKey(qualificationId), 'json');
}

/**
 * 資格名が決まった時点で登録する（方針3）。同じ資格の取り込みが24時間以内に済んでいれば作り直さない。
 * persistent：学習者ごとの取り込み（期限なし）。一度登録したら作り直さない。
 */
export async function startJob(store, qualificationId, sources, now, { persistent = false } = {}) {
  const old = await readJob(store, qualificationId);
  if (old && (old.persistent || (old.state !== 'failed' && now - old.startedAt < 24 * 60 * 60 * 1000))) {
    // 本人専用の継続登録では、年度の一部が失敗しても他年度の結果を絶対に消さない。
    // 同一年度・区分の失敗だけ再添付でリトライし、処理中・完了済みの問題は重複させない。
    if (!old.persistent) return old;
    let changed = false;
    for (const source of sources) {
      const samePdf = old.sources.find((s) => s.questionUrl === source.questionUrl);
      if (samePdf) {
        if (samePdf.status === 'failed') {
          auditSource(samePdf,'retry',now,{reason:samePdf.reason});
          Object.assign(samePdf, source, { status: 'pending', reason: null, startedAt: null, leaseUntil: null });
          changed = true;
        }
        continue;
      }
      const sameYear = old.sources.find((s) => s.year === source.year && s.section === source.section);
      if (sameYear && sameYear.status === 'failed') {
        auditSource(sameYear,'retry',now,{reason:sameYear.reason});
        Object.assign(sameYear, source, { status: 'pending', reason: null, startedAt: null, leaseUntil: null });
        changed = true;
        continue;
      }
      // 共通原本がある場合も、利用者の異なる添付原本は別ソースとして保持する。
      // 本人専用で既に出題可能な年度は attachPdf 側で重複登録を防ぐ。
      const added={...source,status:'pending'};
      auditSource(added,'registered',now);
      old.sources.push(added);
      changed = true;
    }
    if (!changed) return old;
    await saveJob(store, old, now);
    return old;
  }
  const job = {
    qualificationId,
    persistent,
    state: 'running',
    startedAt: now,
    updatedAt: now,
    sources: sources.map((source) => {
      const s={...source,status:'pending'};
      auditSource(s,'registered',now);
      return s;
    }),
  };
  await store.put(jobKey(qualificationId), JSON.stringify(job), persistent ? {} : { expirationTtl: 26 * 60 * 60 });
  return job;
}

/**
 * 取り込みを、時間の許す分だけ進める。budgetMs を過ぎたら残りは次回。
 * 返り値の job.notice は、AIが利用者へそのまま伝える文（時間がかかっているとき）。
 */
export async function stepJob(store, qualificationId, deps, { budgetMs = 20000, clock = () => Date.now(), leaseMs = 0 } = {}) {
  const job = await readJob(store, qualificationId);
  if (!job) throw new IngestError('JOB_NOT_FOUND');
  const begin = clock();
  // 裏の取り込み（leaseMs あり）は同時に1つだけ走らせる。走っている間に呼ばれたら何もしない
  if (leaseMs) {
    if (job.leaseUntil && job.leaseUntil > begin) return withNotice(job, begin);
    job.leaseUntil = begin + leaseMs;
    await saveJob(store, job, begin);
  }
  for (const s of job.sources) {
    if (s.status !== 'pending' || s.reason === 'AWAITING_UPLOAD') continue; // 経路Aの結果待ちは ingestOne で進める
    if (clock() - begin >= budgetMs) break;
    // 進み具合（残り時間の目安）を出すため、始めた時刻を先に残す
    s.startedAt = clock();
    auditSource(s,'running',s.startedAt);
    await saveJob(store, job, s.startedAt);
    const code = await settle(s, deps, deps.now ?? clock());
    // 1件ごとに保存する（呼び出しが時間切れで打ち切られても、終わった分は失わない）
    await saveJob(store, job, clock());
    if (code === 'PDF_CHANGED_DURING_INGEST') break;
  }
  // 分解プログラムの版が上がったときは、取り込み済みの年度も新しい版で分解し直す（読み取りの改善を反映するため）。
  // 分解し直す間も前の版の問題で学習を続けられるよう、終わった年度から差し替える。失敗したら前の版のまま使う
  for (const s of staleSources(job, deps.parserVersion)) {
    if (clock() - begin >= budgetMs) break;
    const fresh = { ...s };
    const code = await settle(fresh, deps, deps.now ?? clock());
    if (code) s.upgradeTried = deps.parserVersion;
    else Object.assign(s, fresh, { upgradeTried: null });
    await saveJob(store, job, clock());
  }
  if (leaseMs) {
    job.leaseUntil = null;
    await saveJob(store, job, clock());
  }
  return withNotice(job, clock());
}

/** 前の版の分解プログラムで取り込んだ年度（新しい版での分解し直しを、まだ試していないもの）。 */
export function staleSources(job, parserVersion) {
  if (!parserVersion) return [];
  return (job?.sources ?? []).filter((s) => s.status === 'done' && s.keyParts && s.keyParts.parserVersion !== parserVersion && s.upgradeTried !== parserVersion);
}

/** 1つの取り込み元を処理して、結果を job.sources の要素に書き込む。失敗の理由コードを返す。 */
async function settle(s, deps, now) {
  try {
    const r = await ingestSource(s, { ...deps, now });
    Object.assign(s, { status: 'done', from: r.from, packetCount: r.result.packetCount, excludedCount: r.result.excluded.length, keyParts: r.keyParts, reason: null });
    auditSource(s,'done',now,{questions:r.result.packetCount,excluded:r.result.excluded.length});
    return null;
  } catch (e) {
    const code = e instanceof IngestError ? e.code : 'INGEST_FAILED';
    // 取り込み中に公式PDFが差し替わったときと、経路Aで分解結果がまだ届いていないときは、やり直せるので待ちに戻す
    const retry = code === 'PDF_CHANGED_DURING_INGEST' || code === 'AWAITING_UPLOAD';
    Object.assign(s, { status: retry ? 'pending' : 'failed', reason: code });
    auditSource(s,retry?'pending':'failed',now,{reason:code});
    return code;
  }
}

async function saveJob(store, job, now) {
  const pending = job.sources.filter((s) => s.status === 'pending').length;
  const done = job.sources.filter((s) => s.status === 'done').length;
  job.state = pending ? 'running' : done ? 'done' : 'failed';
  job.updatedAt = now;
  await store.put(jobKey(job.qualificationId), JSON.stringify(job), job.persistent ? {} : { expirationTtl: 26 * 60 * 60 });
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

export const SOURCE_EST_MS = 80 * 1000; // 公式PDF1年度分の分解にかかる目安（測量士補R8で実測 約70秒）

/** 取り込みの進み具合を、利用者に見せる1〜2行にする（棒グラフと残り時間の目安）。 */
export function progressText(job, now) {
  if (job.state !== 'running') return null;
  // 先に直近3年度を取り込み（そろったら出題を始める）、残りの年度は裏で続ける
  const recent = new Set([...new Set(job.sources.map((s) => s.year))].sort((a, b) => b - a).slice(0, 3));
  const first = job.sources.filter((s) => recent.has(s.year));
  const firstPhase = first.some((s) => s.status === 'pending');
  const list = firstPhase ? first : job.sources;
  const total = list.length;
  const done = list.filter((s) => s.status !== 'pending').length;
  const cur = list.find((s) => s.status === 'pending' && s.startedAt);
  const partial = cur ? Math.min(0.9, (now - cur.startedAt) / SOURCE_EST_MS) : 0;
  const filled = Math.round(((done + partial) / total) * 10);
  const leftMs = Math.max(15000, (total - done) * SOURCE_EST_MS - (cur ? now - cur.startedAt : 0));
  const left = leftMs < 60000 ? '1分以内' : `約${Math.round(leftMs / 60000)}分`;
  const bar = `${'■'.repeat(filled)}${'□'.repeat(10 - filled)}`;
  const years = (xs) => new Set(xs.map((s) => s.year)).size;
  const yearsDone = (xs) => [...new Set(xs.map((s) => s.year))].filter((y) => xs.every((s) => s.year !== y || s.status !== 'pending')).length;
  if (firstPhase) return `📥 直近${years(first)}年度の過去問を取り込み中：${bar} ${yearsDone(first)}/${years(first)}年度（残り${left}）\nそろったら出題を始めます。それより前の年度は、学習しながら裏で取り込みます。`;
  return `📥 それより前の年度を裏で取り込み中：${bar} ${yearsDone(job.sources)}/${years(job.sources)}年度（学習はそのまま続けられます）`;
}

export function withNotice(job, now) {
  const slow = job.state === 'running' && now - job.startedAt >= SLOW_AFTER_MS;
  return { ...job, notice: slow ? '過去問の取り込みに時間がかかっています。取り込みが済んだ問題から出題します。' : null, progress: progressText(job, now) };
}
