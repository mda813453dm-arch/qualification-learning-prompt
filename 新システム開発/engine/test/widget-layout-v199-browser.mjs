// 実ブラウザ（375px、Chromium と WebKit）で、v199 の問題画面を確かめる。
// 基本情報技術者 2023 科目B 問1（擬似言語のプログラム）：1) プログラムが等幅の整形済みの枠に入り、字下げの空白がそのまま残る、
// 2) 枠の外の本文は段落のまま、3) ページは横にはみ出さず、枠の高さは固定しない、4) 2行の選択肢は改行して出す。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-current.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const stem = "次のプログラム中の［a］と［b］に入れる正しい答えの組合せを，解答群の中から選べ。ここで，配列の要素番号は1 から始まる。\n関数findPrimeNumbers は，引数で与えられた整数以下の，全ての素数だけを格納した配列を返す関数である。ここで，引数に与える整数は2 以上である。\n〔プログラム〕\n```\n○整数型の配列: findPrimeNumbers(整数型: maxNum)\n  整数型の配列: pnList ← {}  // 要素数0の配列\n  整数型: i, j\n  論理型: divideFlag\n  for (i を 2 から ［a］ まで 1 ずつ増やす)\n    divideFlag ← true\n\n    /* iの正の平方根の整数部分が2未満のときは，繰返し処理を実行しない */\n    for (j を 2 から iの正の平方根の整数部分 まで 1 ずつ増やす)  // α\n      if ( ［b］ )\n          divideFlag ← false\n          αの行から始まる繰返し処理を終了する\n      endif\n    endfor\n    if (divideFlag が true と等しい)\n      pnListの末尾 に iの値 を追加する\n    endif\n  endfor\n  return pnList\n```";
const sessionId = 'layout-v199-browser';
const output = { status: 'question', sessionId, at: 1000, question: {
  questionId: 'fe:04fc7d8dbeed:1', kind: 'new', year: 2023, section: '科目B', questionNumber: 1, fieldName: 'アルゴリズムとプログラミング',
  stem, stemMode: 'text', choices: ['a：maxNum　b：i ÷ j の余り が 0 と等しい', 'adjMatrix[u, u] ← 1\nadjMatrix[v, v] ← 1', 'c', 'd'], choiceMode: 'text', figures: [], figureUrls: [], sourceImageUrls: [],
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
    await w.locator('.stem pre.qlp-code').first().waitFor();
    const s = await w.locator('body').evaluate((body) => {
      const pre = body.querySelector('.stem pre.qlp-code');
      const cs = pre && getComputedStyle(pre);
      const opt = body.querySelectorAll('.choices .opt span')[1];
      return { pre: pre && pre.textContent, ws: cs && cs.whiteSpace, ox: cs && cs.overflowX, mh: cs && cs.maxHeight, fullH: pre && pre.scrollHeight <= pre.clientHeight + 2,
        ps: Array.from(body.querySelectorAll('.stem p')).map((p) => p.innerText), optLines: opt && opt.getClientRects().length, optH: opt && opt.offsetHeight,
        wide: document.documentElement.scrollWidth <= 375 };
    });
    assert.ok(s.pre, `${name}: プログラムの枠がある`);
    assert.match(s.pre, /^○整数型の配列: findPrimeNumbers\(整数型: maxNum\)\n  整数型の配列: pnList ← \{\}  \/\/ 要素数0の配列\n/, `${name}: 字下げの空白を保つ`);
    assert.match(s.pre, /\n      if \( ［b］ \)\n          divideFlag ← false\n/, name);
    assert.equal(s.ws, 'pre', name); assert.equal(s.ox, 'auto', name); assert.equal(s.mh, 'none', `${name}: 高さを固定しない`);
    assert.ok(s.fullH, `${name}: 枠の中で縦にスクロールさせない`);
    assert.deepEqual(s.ps.slice(-1), ['〔プログラム〕'], `${name}: 本文は段落のまま ${JSON.stringify(s.ps)}`);
    assert.ok(!s.ps.some((p) => /divideFlag/.test(p)), `${name}: プログラムを段落に崩さない`);
    assert.ok(s.optH > 30, `${name}: 2行の選択肢を改行して出す ${s.optH}`);
    assert.ok(s.wide, `${name}: ページは横にはみ出さない`);
    if (process.env.QLP_SCREENSHOT_DIR && name === 'chromium') await page.screenshot({ path: `${process.env.QLP_SCREENSHOT_DIR}/layout-v199.png`, fullPage: true });
    assert.deepEqual(errors, [], `${name}: 画面のエラー`);
    console.log(name, 'ok');
  } finally { await browser.close(); }
}
