/**
 * 24時間保存（方針4・設計計画§4）。
 *
 * - 期限の判定はプログラム側で行う：保存した時刻から24時間を過ぎたものは「無い」として扱う。
 *   KV の expirationTtl は掃除用の補助（少し長めの26時間）。
 * - キーに利用者IDを入れない（資格単位で共有するかは未決定。共有しないなら利用者IDを足すだけ）。
 * - 保存するのは分解結果（パケットJSON）・図のPNG・公式PDFのSHA-256の控え。PDF本体は保存しない。
 */
import { sha256Hex } from './store.js';

export const TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_TTL_S = 26 * 60 * 60;

export function resultKey({ qualificationId, year, section, questionSha256, answerSha256, parserVersion }) {
  return ['pkt', qualificationId, year, section, questionSha256, answerSha256, parserVersion].map(encodeURIComponent).join('/');
}

export function figureKey(questionSha256, parserVersion, file) {
  return ['fig', questionSha256, parserVersion, file].map(encodeURIComponent).join('/');
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
  if (!fresh(v.savedAt, now)) return { hit: false, reason: 'EXPIRED' };
  return { hit: true, result: v.result, savedAt: v.savedAt };
}

/** 図を先に書き、最後にパケットを書く（途中で止まっても、図の欠けたパケットが見えないように）。 */
export async function writeResult(store, keyParts, result, assets, now) {
  for (const [file, bytes] of Object.entries(assets)) {
    await store.put(figureKey(keyParts.questionSha256, keyParts.parserVersion, file), bytes, { expirationTtl: CLEANUP_TTL_S });
  }
  await store.put(resultKey(keyParts), JSON.stringify({ savedAt: now, result }), { expirationTtl: CLEANUP_TTL_S });
}

export async function readFigure(store, questionSha256, parserVersion, file) {
  return store.get(figureKey(questionSha256, parserVersion, file), 'arrayBuffer');
}
