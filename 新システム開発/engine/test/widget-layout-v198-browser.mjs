// 実ブラウザ（375px、Chromium と WebKit）で、v198 の問題画面を確かめる。
// 2024年度測量士補 問1（iPhone の ChatGPT で a〜e が1段落に詰まっていた問）の読み取り本文で、
// 1) 問いの文と a〜e が別々の段落になる、2)「過去問の追加・登録状況」は見出しと分野の間に無く、解答の操作の下にある。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-current.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const stem = '次の a ~ e の文は , 測量法 ( 昭和 24 年法律第 188 号 ) について述べたものである。明らかに間違っているものだけの組合せはどれか。次の 1 ~ 5 の中から選べ。a. 公共測量とは , 基本測量以外の測量で , その実施に要する費用の全部又は一部について国又は公共団体が負担して実施する測量をいう。ただし , 国又は公共団体からの補助を受けて行う測量を除く。b . 基本測量とは , すべての測量の基礎となる測量であり , 国土地理院の行うものをいう。c. 測量計画機関が自ら計画を実施する場合には , 測量作業機関となることができる。d. 基本測量の測量成果を使用して基本測量以外の測量を実施しようとする者は , あらかじめ ,国土地理院長の承認を得なければならない。e. 測量計画機関は , 公共測量を実施しようとするときは , 当該公共測量に関し作業規程を定め、あらかじめ、国土地理院長の承認を得なければならない。';
const sessionId = 'layout-v198-browser';
const output = { status: 'question', sessionId, at: 1000, question: {
  questionId: 'q063:7da3c3792182:1', kind: 'new', year: 2024, section: 'main', questionNumber: 1, fieldName: '測量に関する法規',
  stem, stemMode: 'ocr', choices: ['a, c', 'a, e', 'b, c', 'b, d', 'd, e'], choiceMode: 'ocr', figures: [], figureUrls: [], sourceImageUrls: [],
  notices: [], progress: { position: 1, total: 28, done: 0, fieldIndex: 1, fieldTotal: 9 } } };

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://qlp.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>' }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, output, sessionId }) => {
      const frame = document.createElement('iframe');
      frame.id = 'w'; frame.style.cssText = 'width:100%;height:660px;border:0';
      const boot = { toolInput: { sessionId }, toolOutput: output, displayMode: 'inline' };
      const injection = '<script>window.openai=' + JSON.stringify(boot) + ';window.openai.notifyIntrinsicHeight=function(h){if(window.frameElement)window.frameElement.style.height=Math.ceil(h)+"px"};<\/script><script>';
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
    await w.locator('.stem p').first().waitFor();
    const s = await w.locator('body').evaluate((body) => {
      const ps = Array.from(body.querySelectorAll('.stem p')).map((p) => p.innerText);
      const h2 = body.querySelector('h2'), field = body.querySelector('.field'), btn = body.querySelector('#sourceManagerBtn'), choices = body.querySelector('.choices'), dk = body.querySelector('#dk');
      const between = [];
      for (let n = h2.nextElementSibling; n && n !== field; n = n.nextElementSibling) between.push(n.outerHTML.slice(0, 60));
      return { ps, between, btnAfterChoices: !!(btn && (choices.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) && (dk.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING)), wide: document.documentElement.scrollWidth <= 375 };
    });
    assert.equal(s.ps.length, 6, `${name}: 問いの文と a〜e が別の段落 ${JSON.stringify(s.ps)}`);
    assert.deepEqual(s.ps.slice(1).map((t) => t.slice(0, 2)), ['a.', 'b.', 'c.', 'd.', 'e.'], name);
    assert.match(s.ps[0], /文は，測量法（昭和24年法律第188号）について/, `${name}: 読み取りの空白を詰め、全角の句読点で表示`);
    assert.deepEqual(s.between, [], `${name}: 見出しと分野の間にボタンを置かない`);
    assert.ok(s.btnAfterChoices, `${name}: 過去問の追加・登録状況は解答の操作の下`);
    assert.ok(s.wide, `${name}: 横にはみ出さない`);
    if (process.env.QLP_SCREENSHOT_DIR && name === 'chromium') await page.screenshot({ path: `${process.env.QLP_SCREENSHOT_DIR}/layout-v198.png`, fullPage: true });
    assert.deepEqual(errors, [], `${name}: 画面のエラー`);
    console.log(name, 'ok');
  } finally { await browser.close(); }
}
