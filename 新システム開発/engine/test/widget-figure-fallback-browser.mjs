// 実ブラウザ（375px、Chromium と WebKit）で、図の画像を取得できないときの代わりの表示（v197）を確かめる。
// 2025年度測量士補・問6の表6の画像を、最初は取得失敗（503）にする。
// 1) 1回だけ自動で読み込み直す（?qlpRetry=1）。
// 2) それでも取れなければ、壊れた画像の代わりに「図を表示できませんでした」「もう一度読み込む」と、
//    原本の問題画像・公式の問題PDFへの案内を出し、照合用の原本の問題画像を開いておく。
// 3) 通信が戻ってから「もう一度読み込む」を押すと、表6の画像が表示され、案内が消える。
// 4) 本文・選択肢の文字は図の取得失敗の影響を受けない。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { present } from '../src/engine.js';
import { widgetHtml } from '../src/widget-current.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const PACKETS = JSON.parse(fs.readFileSync(new URL('./fixtures/figure-separation-packets.json', import.meta.url)));
const packet = PACKETS.find((p) => p.questionPdfSha256.startsWith('561692b95a4f') && p.questionNumber === 6);
const shown = present({ packet, keyParts: { owner: '_shared', parserVersion: '0.8.2' } }, 'new', 'https://qlp.test/v1/figure');
const sessionId = 'figure-fallback-browser';
const output = { status: 'question', sessionId, at: 1000,
  question: { ...shown, fieldName: '地図編集', questionPdfUrl: 'https://www.gsi.go.jp/test/q.pdf', figureUrls: shown.figures.map((f) => f.url) } };
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAQ0lEQVR42u3PMQ0AAAgDIG1g/5Y20sQDGtA5VXWVJk2aNGnSpEmTJk2aNGnSpEmTJk2aNGnSpEmTJk2aNGnSpEmTJk1aZcsBDhYqnkMAAAAASUVORK5CYII=', 'base64');
const FIG = 'q063-2025-561692b95a4f-q6-p7-s0.png';

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let failing = true;
    const figRequests = [];
    await page.route('https://qlp.test/**', (route) => {
      const url = route.request().url();
      if (url.includes('/v1/figure/')) {
        const path = url.split('?')[0];
        const file = decodeURIComponent(path.split('/').pop());
        if (file === FIG) figRequests.push(url);
        if (file === FIG && failing) return route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
        return route.fulfill({ contentType: 'image/png', body: tinyPng });
      }
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>' });
    });
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, output, sessionId }) => {
      const frame = document.createElement('iframe');
      frame.id = 'w'; frame.style.cssText = 'width:100%;height:660px;border:0';
      const boot = { toolInput: { sessionId }, toolOutput: output, displayMode: 'inline' };
      const injection = '<script>window.openai=' + JSON.stringify(boot) +
        ';window.openai.notifyIntrinsicHeight=function(h){if(window.frameElement)window.frameElement.style.height=Math.ceil(h)+"px"};<\/script><script>';
      window.addEventListener('message', (e) => {
        if (e.source !== frame.contentWindow || !e.data || e.data.jsonrpc !== '2.0') return;
        const m = e.data;
        const reply = (result) => frame.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result }, '*');
        if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
        else if (m.method === 'tools/call') reply({ structuredContent: m.params.name === 'getStudySnapshot' ? output : { status: 'recorded' } });
      });
      frame.srcdoc = html.replace('<script>', injection);
      document.body.appendChild(frame);
    }, { html: widgetHtml(), output, sessionId });
    const w = page.frameLocator('#w');
    await w.locator('.stem').first().waitFor();
    const box = w.locator('.qlp-fig-error').first();
    await box.waitFor({ timeout: 15000 });
    assert.ok(figRequests.length >= 2, `${name}: 1回は自動で読み込み直す ${JSON.stringify(figRequests)}`);
    assert.ok(figRequests.some((u) => /[?&]qlpRetry=1(?:$|[&#])/.test(u)), `${name}: 読み込み直しは別のURL（?qlpRetry=1）で ${JSON.stringify(figRequests)}`);
    const shownState = await w.locator('body').evaluate((body) => {
      const err = body.querySelector('.qlp-fig-error');
      const fig = err.closest('.fig');
      const stem = body.querySelector('.stem'), choices = body.querySelector('.choices');
      return {
        text: err.innerText,
        pdf: err.querySelector('a') && err.querySelector('a').href,
        brokenHidden: getComputedStyle(fig.querySelector('.fig-open')).display === 'none',
        betweenStemAndChoices: !!(stem.compareDocumentPosition(err) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(err.compareDocumentPosition(choices) & Node.DOCUMENT_POSITION_FOLLOWING),
        sourceOpen: body.querySelector('details.qlp-source').open,
        stem: stem.innerText, choices: choices.innerText,
      };
    });
    assert.match(shownState.text, /図を表示できませんでした/, `${name}: 代わりの表示`);
    assert.match(shownState.text, /もう一度読み込む/, `${name}: 読み込み直しボタン`);
    assert.match(shownState.text, /原本の問題画像/, `${name}: 原本の問題画像への案内`);
    assert.equal(shownState.pdf, 'https://www.gsi.go.jp/test/q.pdf', `${name}: 公式の問題PDFへの案内`);
    assert.equal(shownState.brokenHidden, true, `${name}: 壊れた画像の枠は隠す`);
    assert.ok(shownState.betweenStemAndChoices, `${name}: 図があった位置（本文と選択肢の間）に出す`);
    assert.equal(shownState.sourceOpen, true, `${name}: 照合用の原本の問題画像を開いておく`);
    assert.match(shownState.stem, /北緯44° 00′ 00″\.0000/, `${name}: 本文は文字のまま`);
    assert.match(shownState.choices, /0\.999901/, `${name}: 選択肢は文字のまま`);
    if (process.env.QLP_SCREENSHOT_DIR && name === 'chromium') await page.screenshot({ path: `${process.env.QLP_SCREENSHOT_DIR}/fallback-error.png`, fullPage: true });
    // 通信が戻ってから読み込み直す
    failing = false;
    await w.getByRole('button', { name: 'もう一度読み込む' }).click();
    await w.locator('.qlp-fig-error').waitFor({ state: 'detached', timeout: 15000 });
    const loaded = await w.locator('.stem ~ .fig img, .fig img').first().evaluate(async (img) => {
      for (let i = 0; i < 50 && !(img.complete && img.naturalWidth); i++) await new Promise((r) => setTimeout(r, 100));
      return { ok: img.complete && img.naturalWidth > 0, visible: getComputedStyle(img.closest('.fig-open')).display !== 'none', src: img.src };
    });
    assert.ok(loaded.ok && loaded.visible, `${name}: 読み込み直すと表6が表示される ${JSON.stringify(loaded)}`);
    assert.match(decodeURIComponent(loaded.src), new RegExp(FIG.replace(/\./g, '\\.')), `${name}: 同じ表6の画像`);
    assert.deepEqual(errors, [], `${name}: 画面のエラー`);
    await page.close();
    console.log(name, 'ok');
  } finally {
    await browser.close();
  }
}
