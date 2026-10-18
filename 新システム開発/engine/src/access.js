/**
 * 利用コードによる利用制限（ChatGPT アプリ用）。noteの記事で購入した人にだけ、記事の中の利用コードを渡す。
 * 設定（コードの有効・無効、1日の回数）はエンジンの保存領域に置き、運営者の操作（admin）で変える。
 * 設定の「required」が false の間は、制限をかけない（今までどおり）。
 */
import { sha256Hex } from './store.js';

export const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;
const DEFAULT_LIMIT = 60;

const cfgKey = 'acc/config';
const codeKey = (h) => `acc/code/${h}`;
const grantKey = (lid) => `acc/grant/${lid}`;
const useKey = (h, day) => `acc/use/${h}/${day}`;
const indexKey = 'acc/index';

export const NEED_CODE = 'この学習アプリは、noteの記事を購入した方の専用です。記事に書かれた利用コードを入力してください。';
export const LIMIT_MSG = '今日の解答の上限に達しました。明日になるとまた使えます。';

export async function codeHash(code) {
  return (await sha256Hex(new TextEncoder().encode(`qlp-access:${String(code ?? '').trim()}`))).slice(0, 32);
}

export async function getConfig(store) {
  const c = (await store.get(cfgKey, 'json')) ?? {};
  return { required: false, defaultLimit: DEFAULT_LIMIT, ...c };
}

async function readCode(store, hash) {
  return hash ? store.get(codeKey(hash), 'json') : null;
}

/** 入力されたコードが有効か。有効なら { hash, rec } */
export async function checkCode(store, code) {
  if (!CODE_RE.test(String(code ?? '').trim())) return null;
  const hash = await codeHash(code);
  const rec = await readCode(store, hash);
  return rec?.active ? { hash, rec } : null;
}

/** 学習者にコードを結びつける（以後は、コードを入力し直さなくてよい） */
export async function grantLearner(store, lid, hash) {
  await store.put(grantKey(lid), hash);
}

/** 学習者の利用が許されているか。許されていれば { hash, rec, limit, used } */
export async function learnerAccess(store, lid, day) {
  const hash = lid ? await store.get(grantKey(lid)) : null;
  const rec = await readCode(store, hash);
  if (!rec?.active) return null;
  const cfg = await getConfig(store);
  const limit = Number.isInteger(rec.dailyLimit) ? rec.dailyLimit : cfg.defaultLimit;
  const used = Number((await store.get(useKey(hash, day))) ?? 0) || 0;
  return { hash, rec, limit, used };
}

export async function countUse(store, hash, day) {
  const used = Number((await store.get(useKey(hash, day))) ?? 0) || 0;
  await store.put(useKey(hash, day), String(used + 1), { expirationTtl: 3 * 24 * 60 * 60 });
}

/** 運営者の操作：config（required・defaultLimit）／add／disable／enable／limit／list */
export async function admin(store, b, day) {
  const idx = (await store.get(indexKey, 'json')) ?? {};
  if (b.action === 'config') {
    const cur = await getConfig(store);
    const next = { ...cur };
    if (typeof b.required === 'boolean') next.required = b.required;
    if (Number.isInteger(b.defaultLimit) && b.defaultLimit >= 0) next.defaultLimit = b.defaultLimit;
    await store.put(cfgKey, JSON.stringify(next));
    return { config: next };
  }
  if (b.action === 'list') {
    const out = [];
    for (const [hash, label] of Object.entries(idx)) {
      const rec = await readCode(store, hash);
      out.push({ label, id: hash.slice(0, 6), active: !!rec?.active, dailyLimit: rec?.dailyLimit ?? null, usedToday: Number((await store.get(useKey(hash, day))) ?? 0) || 0 });
    }
    return { config: await getConfig(store), codes: out };
  }
  const code = String(b.code ?? '').trim();
  if (!CODE_RE.test(code)) return { error: 'CODE_INVALID' };
  const hash = await codeHash(code);
  const rec = await readCode(store, hash);
  if (b.action === 'add') {
    const next = { active: true, dailyLimit: Number.isInteger(b.dailyLimit) && b.dailyLimit >= 0 ? b.dailyLimit : null, label: String(b.label ?? '').slice(0, 40), createdAt: day };
    await store.put(codeKey(hash), JSON.stringify(next));
    await store.put(indexKey, JSON.stringify({ ...idx, [hash]: next.label }));
    return { ok: true, id: hash.slice(0, 6), rec: next };
  }
  if (!rec) return { error: 'CODE_UNKNOWN' };
  if (b.action === 'disable' || b.action === 'enable') {
    await store.put(codeKey(hash), JSON.stringify({ ...rec, active: b.action === 'enable' }));
    return { ok: true, id: hash.slice(0, 6), active: b.action === 'enable' };
  }
  if (b.action === 'limit') {
    const dailyLimit = Number.isInteger(b.dailyLimit) && b.dailyLimit >= 0 ? b.dailyLimit : null;
    await store.put(codeKey(hash), JSON.stringify({ ...rec, dailyLimit }));
    return { ok: true, id: hash.slice(0, 6), dailyLimit };
  }
  return { error: 'ACTION_UNKNOWN' };
}
