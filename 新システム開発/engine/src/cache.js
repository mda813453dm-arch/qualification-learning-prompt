/**
 * 共有分解結果は永続保存、個人別分解結果も保存。
 *
 * - owner がない（共有）：資格・年度ごとの過去問分解結果。新規入手の度に蓄積される。
 * - owner がある（個人）：引き継ぎID付き。その学習者だけが使う保存（2026-10-15 方針4の改定）。
 * - 保存するのは分解結果（パケットJSON）・図のPNG・公式PDFのSHA-256の控え。PDF本体は保存しない。
 */
import { sha256Hex } from './store.js';

export const TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_TTL_S = 26 * 60 * 60;

/**
 * owner（引継ぎID）付きのものは、その学習者だけが使う保存（2026-10-15 方針4の改定）。
 * 実施済みの試験の問題は変わらないので、期限なしで持ち続ける。
 */
export function resultKey({ qualificationId, year, section, questionSha256, answerSha256, parserVersion, owner }) {
  const head = owner ? ['own', owner] : [];
  return ['pkt', ...head, qualificationId, year, section, questionSha256, answerSha256, parserVersion].map(encodeURIComponent).join('/');
}

export function figureKey(questionSha256, parserVersion, file, owner = null) {
  const head = owner ? ['own', owner] : [];
  return ['fig', ...head, questionSha256, parserVersion, file].map(encodeURIComponent).join('/');
}

async function sourceKey(url) {
  return 'src/' + (await sha256Hex(url));
}

const fresh = (savedAt, now) => Number.isFinite(savedAt) && now - savedAt < TTL_MS;

/** 公式PDFのURLごとの SHA-256 の控え（24時間以内なら取得し直さずに使う）。 */
export async function readSource(store, url, now) {
  const v = await store.get(await sourceKey(url), 'json');
  if (!v || !fresh(v.savedAt, now)) return null;
  return v;
}

export async function writeSource(store, url, sha256, now) {
  await store.put(await sourceKey(url), JSON.stringify({ url, sha256, savedAt: now }), { expirationTtl: CLEANUP_TTL_S });
}

export async function readResult(store, keyParts, now) {
  const v = await store.get(resultKey(keyParts), 'json');
  if (!v) return { hit: false, reason: 'MISS' };
  if (!keyParts.owner && !fresh(v.savedAt, now)) return { hit: false, reason: 'EXPIRED' };
  return { hit: true, result: v.result, savedAt: v.savedAt };
}

/** 図を先に書き、最後にパケットを書く（途中で止まっても、図の欠けたパケットが見えないように）。 */
export async function writeResult(store, keyParts, result, assets, now) {
  const opts = {};
  for (const [file, bytes] of Object.entries(assets)) {
    await store.put(figureKey(keyParts.questionSha256, keyParts.parserVersion, file, keyParts.owner), bytes, opts);
  }
  await store.put(resultKey(keyParts), JSON.stringify({ savedAt: now, result }), opts);
}

export async function readFigure(store, questionSha256, parserVersion, file, owner = null) {
  return store.get(figureKey(questionSha256, parserVersion, file, owner), 'arrayBuffer');
}
