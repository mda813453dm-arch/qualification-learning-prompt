/**
 * 運営者が添付した公式PDFの控え（公式サイトがクラウドからの取得を断る資格のため。ITパスポート：2026-10-17 確認）。
 * 控えは Cloud Storage の src/<公式URLのSHA-256>.pdf に置く（GitHub Actions の「公式PDFの控えを置く」で入れる）。
 * 控えがあればそれを読み、無ければ公式サイトから取る。出典のURLは公式のURLのまま扱う。
 */
import { sha256Hex } from './store.js';
import ipaManifest from '../data/ipa-official-source-manifest.json' with { type: 'json' };

export const SOURCE_PREFIX = 'src/';

export async function sourceKey(url) {
  return `${SOURCE_PREFIX}${await sha256Hex(url)}.pdf`;
}

export function withStoredSources(store, fetchPdf) {
  return async (url) => {
    const saved = store ? await store.get(await sourceKey(url), 'arrayBuffer').catch(() => null) : null;
    if (saved && saved.byteLength) return new Uint8Array(saved);
    // 公式原本を保管済みのIPA試験は、公式サイトのアクセス制限を回避するのではなく
    // 自分たちが検証・保存した原本を同じURLに対応付けて再利用する。
    const entry = ipaManifest.items.find((item) => item.sourceVerified &&
      (item.questionUrl === url || item.answerUrl === url));
    if (entry && store) {
      const code = entry.qualification === '基本情報技術者' ? 'fe' : 'ap';
      const section = {
        '科目A':'a', '科目B':'b', '春期午前':'spring-am', '春期午後':'spring-pm',
        '秋期午前':'autumn-am', '秋期午後':'autumn-pm',
        '10月午前':'october-am', '10月午後':'october-pm',
      }[entry.section];
      const kind = entry.questionUrl === url ? 'question' : 'answer';
      const archived = await store.get(`src/ipa/${code}/${entry.year}/${section}/${kind}.pdf`, 'arrayBuffer');
      if (archived?.byteLength) return new Uint8Array(archived);
    }
    return fetchPdf(url);
  };
}
