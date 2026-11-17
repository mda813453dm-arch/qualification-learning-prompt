// 実ブラウザ（375px、Chromium と WebKit）で図表分離の表示順を確かめる。
// 2025年度測量士補・問6：年度・問番号・分野 → 本文（文字） → 表6の画像だけ → 選択肢1〜5（文字） → 回答操作。
// 問題全体の画像は選択肢の後ろの「原本の問題画像を確認する」に畳んであり、開くまで見えない。
// 旧版 v196・v195 の画面も同じ問をエラーなく出せること（旧URIの互換）も確かめる。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { present } from '../src/engine.js';
import { widgetHtml } from '../src/widget-current.js';
import { widgetHtml as v197Html } from '../src/widget-v197.js';
import { widgetHtml as v196Html } from '../src/widget-v196.js';
import { widgetHtml as v195Html } from '../src/widget-v195.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const PACKETS = JSON.parse(fs.readFileSync(new URL('./fixtures/figure-separation-packets.json', import.meta.url)));
const packet = PACKETS.find((p) => p.questionPdfSha256.startsWith('561692b95a4f') && p.questionNumber === 6);
const shown = present({ packet, keyParts: { owner: '_shared', parserVersion: '0.8.2' } }, 'new', 'https://qlp.test/v1/figure');
const sessionId = 'figure-separation-browser';
const output = { status: 'question', sessionId, at: 1000,
  question: { ...shown, fieldName: '地図編集', figureUrls: shown.figures.map((f) => f.url) } };
// 画像：手元に実際の切り出しがあればそれを使う（目視用のスクリーンショット）。無ければ小さなPNG
const LOCAL = process.env.QLP_FIGURE_DIR;
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAQ0lEQVR42u3PMQ0AAAgDIG1g/5Y20sQDGtA5VXWVJk2aNGnSpEmTJk2aNGnSpEmTJk2aNGnSpEmTJk2aNGnSpEmTJk1aZcsBDhYqnkMAAAAASUVORK5CYII=', 'base64');

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const [label, html] of [['v198', widgetHtml()], ['v197', v197Html()], ['v196', v196Html()], ['v195', v195Html()]]) {
      const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('https://qlp.test/**', (route) => {
        const url = route.request().url();
        if (url.includes('/v1/figure/')) {
          const file = decodeURIComponent(url.split('/').pop());
          const body = LOCAL && fs.existsSync(`${LOCAL}/${file}`) ? fs.readFileSync(`${LOCAL}/${file}`) : tinyPng;
          return route.fulfill({ contentType: 'image/png', body });
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
      }, { html, output, sessionId });
      const w = page.frameLocator('#w');
      await w.locator('.stem').first().waitFor();
      const layout = await w.locator('body').evaluate((body) => {
        const stem = body.querySelector('.stem');
        const choices = body.querySelector('.choices');
        const imgs = [...body.querySelectorAll('img')].map((img) => ({
          file: decodeURIComponent(img.src.split('/').pop()), visible: !img.closest('details:not([open])') && !!img.offsetParent,
          afterStem: !!(stem.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING),
          beforeChoices: !!(img.compareDocumentPosition(choices) & Node.DOCUMENT_POSITION_FOLLOWING),
        }));
        return { stem: stem.innerText, choices: choices?.innerText ?? '', imgs, text: body.innerText };
      });
      assert.match(layout.stem, /北緯44° 00′ 00″\.0000/, `${name} ${label}: 本文に北緯・東経の行`);
      assert.match(layout.choices, /0\.999901/, `${name} ${label}: 選択肢が文字`);
      const visible = layout.imgs.filter((i) => i.visible);
      assert.deepEqual(visible.map((i) => i.file), ['q063-2025-561692b95a4f-q6-p7-s0.png'], `${name} ${label}: 見える画像は表6だけ ${JSON.stringify(layout.imgs)}`);
      assert.ok(visible[0].afterStem && visible[0].beforeChoices, `${name} ${label}: 表6は本文と選択肢の間`);
      assert.ok(layout.text.indexOf('2025') < layout.text.indexOf('表6は'), `${name} ${label}: 年度が本文より前`);
      if (label !== 'v195') {
        const src = layout.imgs.find((i) => i.file === 'q063-2025-561692b95a4f-q6-p7.png');
        assert.ok(src && !src.visible && !src.beforeChoices, `${name}: 問題全体の画像は選択肢の後ろに畳む`);
        await w.getByText('原本の問題画像を確認する', { exact: false }).click();
        assert.equal(await w.locator('details.qlp-source').evaluate((d) => d.open), true, `${name}: 開くと原本を見られる`);
        await w.getByText('原本の問題画像を確認する', { exact: false }).click();
        if (process.env.QLP_SCREENSHOT_DIR && name === 'chromium') {
          await page.screenshot({ path: `${process.env.QLP_SCREENSHOT_DIR}/q6-${label}.png`, fullPage: true });
        }
      }
      assert.deepEqual(errors, [], `${name} ${label}: 画面のエラー`);
      await page.close();
    }
    console.log(name, 'ok');
  } finally {
    await browser.close();
  }
}
