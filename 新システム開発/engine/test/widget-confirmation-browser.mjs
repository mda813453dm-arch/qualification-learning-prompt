// 通常の確認問題3問のUI、全体位置・残り問数・実践問題への遷移を実エンジンと375pxのDOMで検証。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { widgetHtml } from '../src/widget.js';
import { SRC, T0, assetsB64, fakeParser, fakeWeb, pdf } from './helpers.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q'), [SRC.answerUrl]: pdf('a') });
  const parser = fakeParser(web, { answers: [3, 1, 4], fieldIds: ['s1', 's1', 's1'] });
  const env = { STORE: new MemoryStore(), API_TOKEN: 'browser-test', fetchPdf: web.fetchPdf, clock: () => T0, PARSER_URL: 'https://parser.example' };
  env.parserFetch = async (_, init) => {
    const b = JSON.parse(init.body);
    const bytes = x => Uint8Array.from(atob(x.base64), c => c.charCodeAt(0));
    const parsed = await parser({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: parsed.result, assets: assetsB64(parsed.assets) }));
  };
  const request = async (path, b) => (await handle(new Request(`https://engine.example${path}`, { method: 'POST',
    headers: { authorization: 'Bearer browser-test', 'content-type': 'application/json' }, body: JSON.stringify(b) }), env)).json();
  let id = 1;
  const tool = async (name, args) => (await request('/app', { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } })).result;
  const session = await request('/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const study = await request('/v1/study/start', { qualificationName: '測量士補', learnerId: session.learnerId });
  const fieldName = '測量に関する法規';
  const chosen = await tool('chooseItem', { sessionId: session.sessionId, fieldName, mode: 'explain' });
  assert.equal(chosen.structuredContent.mode, 'explain');
  const register = () => tool('registerConfirmationQuestion', { sessionId: session.sessionId,
    question: '同じ分野の確認問題です。正しい選択肢はどれですか。', choices: ['選択肢A', '選択肢B', '選択肢C'], correctAnswer: 2,
     explanation: '正答は選択肢Bです。AとCは条件が異なるため正答になりません。' });
  // まず解説を表示し、利用者が「確認問題へ進む」を押すまでは問題を登録しない。
  const lesson = await tool('showMenu', { kind: 'lesson', sessionId: session.sessionId,
    fieldName, body: '## 測量に関する法規の解説\\n土地の測量に必要な法令の基本を整理します。理解してから確認問題3問に進み、最後に実践問題で確認します。' });
  assert.equal(lesson._meta?.qlp?.menu?.kind, 'lesson');
  const first = lesson;
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('engineTool', tool);
    await page.exposeFunction('registerNext', register);
    await page.route('https://qlp.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, first }) => {
      const iframe = document.createElement('iframe'); iframe.style.cssText = 'width:100%;height:650px;border:0';
      const send = x => iframe.contentWindow.postMessage(x, '*');
      const deliver = result => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
      window.addEventListener('message', async e => {
        if (e.source !== iframe.contentWindow) return;
        const m = e.data; if (!m || m.jsonrpc !== '2.0') return;
        const reply = result => send({ jsonrpc: '2.0', id: m.id, result });
        if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
        else if (m.method === 'ui/notifications/initialized') deliver(first);
        else if (m.method === 'tools/call') reply(await window.engineTool(m.params.name, m.params.arguments));
        else if (m.method === 'ui/update-model-context') reply({});
        else if (m.method === 'ui/message') { reply({}); setTimeout(async () => deliver(await window.registerNext()), 700); }
      });
      iframe.srcdoc = html; document.body.appendChild(iframe);
    }, { html: widgetHtml(), first });
    const ui = page.frameLocator('iframe');
    await ui.getByRole('button', { name: /確認問題へ進む/ }).waitFor();
    assert.equal(await ui.getByRole('heading', { name: /確認問題・第1問/ }).count(), 0,
      '解説の画面では第1問を先に表示しない');
    await ui.getByRole('button', { name: /確認問題へ進む/ }).click();
    for (let i = 1; i <= 3; i++) {
      await ui.getByRole('heading', { name: `${fieldName}｜確認問題・第${i}問` }).waitFor();
      assert.equal(await ui.getByRole('progressbar', { name: '全分野の学習ルートの位置' }).getAttribute('aria-valuenow'), String(1+i));
      assert.equal(await ui.getByRole('progressbar', { name: 'この分野の確認問題の位置' }).getAttribute('aria-valuenow'), String(i));
      assert.match(await ui.locator('.study-progress').last().innerText(), new RegExp(`残り ${4-i}問`));
      await ui.locator('input[name=confirmationAnswer][value="2"]').check();
      await ui.getByRole('button', { name: '解答する' }).click();
      await ui.getByRole('heading', { name: `確認問題 ${i} / 3問の結果` }).waitFor();
      if (i < 3) {
        await ui.getByRole('button', { name: /次の確認問題へ/ }).click();
        await ui.getByRole('heading', { name: new RegExp('確認問題・第' + (i+1) + '問') }).waitFor();
        assert.equal(await ui.locator('iframe').count(), 0, 'the existing widget must not embed another study frame');
      }
    }
    await ui.getByRole('button', { name: /同じ分野の公式過去問を解く/ }).click();
    await ui.getByRole('progressbar', { name: 'この分野の実践問題の位置' }).waitFor();
    assert.equal(await ui.getByRole('progressbar', { name: '全分野の学習ルートの位置' }).getAttribute('aria-valuenow'), '5');
    assert.match(await ui.locator('#app').innerText(), /問1の本文/);
    assert.deepEqual(errors, []);
    console.log(`${name}: PASS confirmation 1–3, global progress, remaining count, same-field practice (375px)`);
  } finally { await browser.close(); }
}
