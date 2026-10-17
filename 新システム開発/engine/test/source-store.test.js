// 公式サイトがクラウドからの取得を断る資格（ITパスポート）：運営者が置いた公式PDFの控えを読む
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { sourceKey, withStoredSources } from '../src/source-store.js';
import { CATALOG } from '../src/catalog.js';

const URL1 = 'https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/2026r08_ip_qs.pdf';

test('控えがあれば控えを読み、公式サイトには取りに行かない', async () => {
  const store = new MemoryStore();
  await store.put(await sourceKey(URL1), new TextEncoder().encode('%PDF-1.4 copy'));
  let fetched = 0;
  const get = withStoredSources(store, async () => { fetched += 1; throw new Error('blocked'); });
  assert.equal(new TextDecoder().decode(await get(URL1)), '%PDF-1.4 copy');
  assert.equal(fetched, 0);
});

test('控えが無ければ公式サイトから取る', async () => {
  const get = withStoredSources(new MemoryStore(), async (u) => new TextEncoder().encode(`%PDF from ${u}`));
  assert.equal(new TextDecoder().decode(await get('https://example.jp/a.pdf')), '%PDF from https://example.jp/a.pdf');
});

test('ITパスポートは、公式の出典URLのまま3分野で登録してある', () => {
  const c = CATALOG.itpass;
  assert.equal(c.qualificationId, 'q006');
  assert.deepEqual(Object.keys(c.fields), ['s', 'm', 't']);
  assert.ok(c.sources.every((s) => s.adapter === 'itpass' && s.questionUrl.startsWith('https://www3.jitec.ipa.go.jp/') && s.answerUrl));
  assert.equal(new Set(c.sources.map((s) => s.year)).size, c.sources.length);
});
