/**
 * 分解の呼び出し口（設計計画§1）。どちらの経路でも、届いた結果は ingest.js の validateResult で検査してから保存する。
 *
 * 経路A：AIアプリ側で分解した結果を送ってもらう（uploadedParse）。
 * 経路B：Cloud Run の分解サーバーに公式PDFを渡して分解してもらう（httpParser）。
 *   POST {endpoint}/v1/parse
 *     {adapter, year, section, question:{url, sha256, base64}, answer:{url, sha256, base64}|null}
 *   → {result, assets:{<file>: <base64 PNG>}}
 */
import { IngestError } from './ingest.js';

const MAX_ASSET_BYTES = 5 * 1024 * 1024; // 航空写真の問（測量士補R8問21）で約2.1MB
const MAX_ASSETS = 200;

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const MAX_SVG_BYTES = 60000; // 本文に入れる図。AIが一字一句写せる長さまで

/** 分解サーバーが作った図のSVG（線と白い背景だけ。スクリプトや外部参照は受け取らない）。 */
function isFigureSvg(bytes) {
  if (bytes.length > MAX_SVG_BYTES) return false;
  const t = new TextDecoder().decode(bytes);
  return t.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && t.endsWith('</svg>') && !/<script|<foreignObject|href=|\son[a-z]+=/i.test(t);
}

/** 図の base64 を PNG（本文用の図は SVG）のバイト列に戻す。PNG でないもの・大きすぎるものは受け取らない。 */
export function decodeAssets(assets) {
  if (assets == null) return {};
  if (typeof assets !== 'object' || Array.isArray(assets)) throw new IngestError('ASSETS_INVALID');
  const entries = Object.entries(assets);
  if (entries.length > MAX_ASSETS) throw new IngestError('ASSETS_INVALID');
  const out = {};
  for (const [file, b64] of entries) {
    if (!/^[A-Za-z0-9._-]{1,100}\.(png|svg)$/.test(file) || typeof b64 !== 'string') throw new IngestError('ASSETS_INVALID', { file });
    let bytes;
    try {
      bytes = fromBase64(b64);
    } catch {
      throw new IngestError('ASSETS_INVALID', { file });
    }
    if (file.endsWith('.svg')) {
      if (!isFigureSvg(bytes)) continue; // 本文用の図は無くてもよい（PNGで出す）
    } else if (bytes.length > MAX_ASSET_BYTES || !PNG_MAGIC.every((b, i) => bytes[i] === b)) {
      throw new IngestError('ASSETS_INVALID', { file });
    }
    out[file] = bytes;
  }
  return out;
}

/** 経路A：アプリから届いた分解結果を、分解関数の形にして返す（公式PDFの取得と照合はエンジン側で行う）。 */
export function uploadedParse(payload) {
  const assets = decodeAssets(payload?.assets);
  const parse = async () => ({ result: payload?.result, assets });
  parse.needsBytes = false;
  return parse;
}

/** 経路A：分解サーバーが無いときの分解関数。保存済みなら使い、無ければアプリからの結果を待つ。 */
export function awaitUpload() {
  const parse = async () => {
    throw new IngestError('AWAITING_UPLOAD');
  };
  parse.needsBytes = false;
  return parse;
}

/** 経路B：Cloud Run の分解サーバーを呼ぶ分解関数。 */
export function httpParser({ endpoint, token, fetch: doFetch = fetch, timeoutMs = 300000 }) {
  // https のみ（手元での確認用に localhost の http だけは許す）
  if (!/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$))/.test(endpoint ?? '')) throw new Error('PARSER_URL_INVALID');
  return async (input) => {
    const body = {
      adapter: input.adapter,
      qualificationId: input.qualificationId,
      year: input.year,
      section: input.section,
      question: { url: input.question.url, sha256: input.question.sha256, base64: toBase64(input.question.bytes) },
      answer: input.answer ? { url: input.answer.url, sha256: input.answer.sha256, base64: toBase64(input.answer.bytes) } : null,
    };
    let res;
    try {
      res = await doFetch(`${endpoint.replace(/\/$/, '')}/v1/parse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new IngestError('PARSER_UNREACHABLE', { error: String(e?.message ?? e) });
    }
    if (!res.ok) throw new IngestError('PARSER_FAILED', { status: res.status });
    const v = await res.json();
    return { result: v?.result, assets: decodeAssets(v?.assets) };
  };
}

/** 公式PDFの指定ページを画像にしてもらう（資格を問わない）。返り値: {pageCount, pages:{'p12.png': bytes}} */
export async function renderPages({ endpoint, token, fetch: doFetch = fetch, bytes, pages, find, span, timeoutMs = 120000 }) {
  if (!/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$))/.test(endpoint ?? '')) throw new Error('PARSER_URL_INVALID');
  let res;
  try {
    res = await doFetch(`${endpoint.replace(/\/$/, '')}/v1/pages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ pdf: { base64: toBase64(bytes) }, ...(find ? { find, span } : { pages }) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new IngestError('PARSER_UNREACHABLE', { error: String(e?.message ?? e) });
  }
  if (res.status === 400) {
    const v = await res.json().catch(() => ({}));
    throw new IngestError(v?.error ?? 'PAGES_INVALID');
  }
  if (!res.ok) throw new IngestError('PARSER_FAILED', { status: res.status });
  const v = await res.json();
  let excerpt = null;
  if (typeof v?.excerpt === 'string') {
    try {
      excerpt = fromBase64(v.excerpt);
    } catch {
      excerpt = null;
    }
    if (excerpt && (excerpt.length > 20 * 1024 * 1024 || String.fromCharCode(...excerpt.subarray(0, 5)) !== '%PDF-')) excerpt = null;
  }
  const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
  const tables = (Array.isArray(v?.tables) ? v.tables : [])
    .slice(0, 10)
    .map((t) => ({
      page: Number.isInteger(t?.page) ? t.page : null,
      caption: str(t?.caption, 200),
      rows: (Array.isArray(t?.rows) ? t.rows : []).slice(0, 60).map((r) => (Array.isArray(r) ? r.slice(0, 12).map((c) => str(c, 100)) : [])).filter((r) => r.length),
    }))
    .filter((t) => t.rows.length);
  const figures = (Array.isArray(v?.figures) ? v.figures : []).filter((f) => Number.isInteger(f?.page) && Array.isArray(f?.bbox)).slice(0, 10);
  const display = typeof v?.display === 'string' && v.display.length <= 60000 ? v.display : null;
  return { pageCount: v?.pageCount, matchedPage: v?.matchedPage ?? null, pages: decodeAssets(v?.pages), excerpt, tables, figures, display };
}
