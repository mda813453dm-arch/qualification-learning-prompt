/**
 * 運営者が添付した公式PDFの控え（公式サイトがクラウドからの取得を断る資格のため。ITパスポート：2026-10-17 確認）。
 * 控えは Cloud Storage の src/<公式URLのSHA-256>.pdf に置く（GitHub Actions の「公式PDFの控えを置く」で入れる）。
 * 控えがあればそれを読み、無ければ公式サイトから取る。出典のURLは公式のURLのまま扱う。
 */
import { sha256Hex } from './store.js';

export const SOURCE_PREFIX = 'src/';

export async function sourceKey(url) {
  return `${SOURCE_PREFIX}${await sha256Hex(url)}.pdf`;
}

export function withStoredSources(store, fetchPdf) {
  return async (url) => {
    const saved = store ? await store.get(await sourceKey(url), 'arrayBuffer').catch(() => null) : null;
    if (saved && saved.byteLength) return new Uint8Array(saved);
    return fetchPdf(url);
  };
}
