// Cloud Run 公開後の図表分離の検証（学習記録・採点には触れない。独立した検査用セッションだけを作る）。
// 1) 2025年度測量士補・問6：本文（文字・北緯東経の行あり）→ 表6の画像だけ → 選択肢5つ（文字）。問題全体は照合用。
// 2) 判定表で新しく切り出した全画像が公開経路から取れ、SHA-256 が一致する。
// 3) 新版 v197 と旧版 v196・v195 の画面がそれぞれの URI で取れる。
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { WIDGET_URI, WIDGET_VERSION } from '../engine/src/widget-current.js';
const base = process.env.QLP_BASE_URL;
const token = process.env.QLP_TEST_TOKEN;
assert.ok(base && token, '公開先と認証が必要');
const registry = JSON.parse(fs.readFileSync(new URL('../engine/data/figure-separation.json', import.meta.url)));
let id = 1;
async function rpc(method, params) {
  const r = await fetch(base + '/app', { method: 'POST', signal: AbortSignal.timeout(180000),
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  assert.equal(r.status, 200, method + ' HTTP ' + r.status);
  const m = await r.json();
  assert.equal(m.error, undefined, JSON.stringify(m.error));
  return m.result;
}
const sha = (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
const fileOf = (u) => decodeURIComponent(String(u).split('/').pop());

const started = await rpc('tools/call', { name: 'startSession', arguments: { qualificationId: '測量士補', sources: [],
  requestedQuestion: { year: 2025, questionNumber: 6 } } });
assert.ok(!started.isError, JSON.stringify(started.structuredContent ?? started.content).slice(0, 300));
const q = (started._meta?.qlp ?? started.structuredContent).question;
assert.equal(q.year, 2025); assert.equal(q.questionNumber, 6);
assert.equal(q.correctAnswer, undefined, '回答前に正答を出さない');
assert.match(q.stem, /北緯44° 00′ 00″\.0000　東経140° 15′ 00″\.0000/);
assert.equal(q.choiceMode, 'text');
assert.equal(q.choices.length, 5);
assert.match(q.choices[0], /0\.999901/);
const inline = q.figureUrls ?? q.figures.map((f) => f.url);
assert.equal(inline.length, 1, '本文と選択肢の間の画像は1枚');
assert.match(fileOf(inline[0]), /^q063-2025-[0-9a-f]{12}-q6-p7-s0\.png$/, '表6だけの切り出し');
assert.ok((q.sourceImageUrls ?? []).some((u) => /-q6-p7\.png$/.test(u)), '問題全体は照合用に残す');
assert.equal(q.figureSeparation?.status, 'verified');
const figUrl = inline[0].startsWith('http') ? inline[0] : base + inline[0];
const img = await fetch(figUrl);
assert.equal(img.status, 200, '表6の画像を取れる');
const key = Object.keys(registry.questions).find((k) => k.endsWith(':6') && k.startsWith(q.questionPdfSha256));
const add = registry.questions[key].add[0];
assert.equal(sha(await img.arrayBuffer()), add.sha256, '目視確認した表6の画像と同じ');
console.log('PASS 2025 測量士補 問6', fileOf(inline[0]), q.questionPdfSha256.slice(0, 12));

// 4) 代表ケース：ITパスポートの選択肢画像・未検証・図表なし・図の再判定と本文の訂正、複数の図、土地家屋調査士の畳んだ問
async function open(qualificationId, year, questionNumber, section) {
  const res = await rpc('tools/call', { name: 'startSession', arguments: { qualificationId, sources: [],
    requestedQuestion: { year, questionNumber, ...(section ? { section } : {}) } } });
  assert.ok(!res.isError, `${qualificationId} ${year} ${section ?? ''} 問${questionNumber}: ` + JSON.stringify(res.structuredContent ?? res.content).slice(0, 300));
  const qq = (res._meta?.qlp ?? res.structuredContent).question;
  assert.equal(qq.questionNumber, questionNumber);
  if (section) assert.equal(qq.section, section, '指定した区分の問を開く（同じ年度の別区分にすり替えない）');
  assert.equal(qq.correctAnswer, undefined, '回答前に正答を出さない');
  return qq;
}
const roles = (qq) => (qq.figures ?? []).map((f) => f.role);
async function fetchAll(qq) {
  for (const u of qq.figureUrls ?? qq.figures.map((f) => f.url)) {
    const r = await fetch(u.startsWith('http') ? u : base + u);
    assert.equal(r.status, 200, u);
  }
}
{
  const c2 = await open('ITパスポート', 2016, 2, '春期');
  assert.equal(c2.figureSeparation?.status, 'verified');
  assert.deepEqual(roles(c2), ['choice_image']);
  await fetchAll(c2);
  console.log('PASS ITパスポート 2016春 問2 選択肢だけの画像');
  const u52 = await open('ITパスポート', 2016, 52, '春期');
  assert.equal(u52.figureSeparation?.status, 'verified');
  assert.deepEqual(roles(u52), ['figure'], '目視で範囲を決めた表だけの画像を出す');
  assert.ok((u52.sourceImageUrls ?? []).length >= 1, '原本の問題画像は畳んで出す');
  await fetchAll(u52);
  console.log('PASS ITパスポート 2016春 問52 目視で切り出した表（第5回）');
  const r50 = await open('ITパスポート', 2016, 50, '秋期');
  assert.equal(r50.figureSeparation?.status, 'verified');
  assert.deepEqual(roles(r50), ['choice_image'], '目視で範囲を決め直した選択肢だけの画像（第6回）');
  await fetchAll(r50);
  console.log('PASS ITパスポート 2016秋 問50 目視で決め直した選択肢の画像（第6回）');
  const t80 = await open('ITパスポート', 2016, 80, '秋期');
  assert.equal(t80.figureSeparation?.status, 'not_needed');
  assert.equal(t80.choiceMode, 'text');
  assert.deepEqual(t80.choices, ['シェアウェア', 'ファームウェア', 'マルウェア', 'ミドルウェア'], '文字の選択肢は原本どおり文字で出す');
  assert.equal(roles(t80).length, 0, '図の無い問に画像を出さない');
  console.log('PASS ITパスポート 2016秋 問80 選択肢を原本どおり文字で（第6回）');
  const n3 = await open('ITパスポート', 2016, 3, '春期');
  assert.equal(n3.figureSeparation?.status, 'not_needed');
  assert.equal(roles(n3).length, 0, '図表なしの問は本文と選択肢の間に画像を出さない');
  console.log('PASS ITパスポート 2016春 問3 図表なし');
  const f60 = await open('ITパスポート', 2016, 60, '春期');
  assert.equal(f60.figureSeparation?.status, 'verified');
  assert.deepEqual(roles(f60), ['figure']);
  assert.match(f60.stem, /システム構成a～cについて/);
  assert.match(f60.stem, /─□─は装置を表し/);
  await fetchAll(f60);
  console.log('PASS ITパスポート 2016春 問60 図だけ・本文を原本どおりに訂正');
  const m7 = await open('測量士補', 2022, 7);
  assert.equal(m7.figureSeparation?.status, 'verified');
  assert.ok(roles(m7).filter((r) => r === 'figure').length >= 2, '複数の図');
  await fetchAll(m7);
  console.log('PASS 測量士補 2022 問7 複数の図');
}

let n = 0;
for (const [k, e] of Object.entries(registry.questions)) {
  for (const a of e.add ?? []) {
    const qsha = k.split(':')[0];
    const r = await fetch(`${base}/v1/figure/own/_shared/${qsha}/${a.parserVersion}/${encodeURIComponent(a.file)}`);
    assert.equal(r.status, 200, a.file);
    assert.equal(sha(await r.arrayBuffer()), a.sha256, a.file);
    n++;
  }
}
console.log('PASS 新しい切り出し画像', n);

const cur = await rpc('resources/read', { uri: WIDGET_URI });
assert.ok(cur.contents[0].text.includes(WIDGET_VERSION) && cur.contents[0].text.includes('qlp-figure-separation') && cur.contents[0].text.includes('qlp-figure-fallback'), '新版 v197（図表分離＋図を取得できないときの代わりの表示）');
const v196 = await rpc('resources/read', { uri: 'ui://qlp/question-v196.html' });
assert.ok(v196.contents[0].text.includes('2026-11-16.196') && v196.contents[0].text.includes('qlp-figure-separation') && !v196.contents[0].text.includes('qlp-figure-fallback'), '旧版 v196 を維持');
const old = await rpc('resources/read', { uri: 'ui://qlp/question-v195.html' });
assert.ok(old.contents[0].text.includes('2026-11-16.195') && !old.contents[0].text.includes('qlp-figure-separation'), '旧版 v195 を維持');
for (const version of ['2026-11-16.196', '2026-11-16.195']) {
  const reported = await rpc('tools/call', { name: 'reportUiEvent', arguments: { stage: 'render_other', version } });
  assert.equal(reported.isError, undefined, version + ' の画面も表示状況を報告できる');
}
console.log('PASS 画面', WIDGET_URI, 'と ui://qlp/question-v196.html・question-v195.html');
