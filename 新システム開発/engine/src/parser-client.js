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

/** 図の base64 を PNG のバイト列に戻す。PNG でないもの・大きすぎるものは受け取らない。 */
export function decodeAssets(assets) {
  if (assets == null) return {};
  if (typeof assets !== 'object' || Array.isArray(assets)) throw new IngestError('ASSETS_INVALID');
  const entries = Object.entries(assets);
  if (entries.length > MAX_ASSETS) throw new IngestError('ASSETS_INVALID');
  const out = {};
  for (const [file, b64] of entries) {
    if (!/^[A-Za-z0-9._-]{1,100}\.png$/.test(file) || typeof b64 !== 'string') throw new IngestError('ASSETS_INVALID', { file });
    let bytes;
    try {
      bytes = fromBase64(b64);
    } catch {
      throw new IngestError('ASSETS_INVALID', { file });
    }
    if (bytes.length > MAX_ASSET_BYTES || !PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new IngestError('ASSETS_INVALID', { file });
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
export function httpParser({ endpoint, token, fetch: doFetch = fetch, timeoutMs = 25000 }) {
  if (!/^https:\/\//.test(endpoint ?? '')) throw new Error('PARSER_URL_INVALID');
  return async (input) => {
    const body = {
      adapter: input.adapter,
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
