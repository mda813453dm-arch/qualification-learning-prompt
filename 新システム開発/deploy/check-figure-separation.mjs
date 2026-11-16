// Cloud Run 公開後の図表分離の検証（学習記録・採点には触れない。独立した検査用セッションだけを作る）。
// 1) 2025年度測量士補・問6：本文（文字・北緯東経の行あり）→ 表6の画像だけ → 選択肢5つ（文字）。問題全体は照合用。
// 2) 判定表で新しく切り出した全画像が公開経路から取れ、SHA-256 が一致する。
// 3) 新版 v196 と旧版 v195 の画面が両方の URI で取れる。
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
assert.ok(cur.contents[0].text.includes(WIDGET_VERSION) && cur.contents[0].text.includes('qlp-figure-separation'), '新版 v196');
const old = await rpc('resources/read', { uri: 'ui://qlp/question-v195.html' });
assert.ok(old.contents[0].text.includes('2026-11-16.195') && !old.contents[0].text.includes('qlp-figure-separation'), '旧版 v195 を維持');
const reported = await rpc('tools/call', { name: 'reportUiEvent', arguments: { stage: 'render_other', version: '2026-11-16.195' } });
assert.equal(reported.isError, undefined, 'v195 の画面も表示状況を報告できる');
console.log('PASS 画面', WIDGET_URI, 'と ui://qlp/question-v195.html');
