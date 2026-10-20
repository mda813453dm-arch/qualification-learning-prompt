// Real DOM/browser test with a strict simulated MCP Apps host.
// This is NOT a test inside the iPhone ChatGPT app.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const onboarding = { status: 'needPlan', onboarding: [
  { kind: 'exempt', prompt: '免除制度を利用しますか？', choices: ['免除を利用する', '免除を利用しない'] },
  { kind: 'status', prompt: '現在の学習状況を選んでください。', choices: ['未着手', '基礎学習中', '応用学習中', '過去問演習中'] },
] };
const question = { status: 'question', sessionId: 'test-session', question: {
  questionId: 'test:2025:main:1', year: 2025, questionNumber: 1, stem: '試験用の問題文', choices: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
} };
const result = (body) => ({ structuredContent: { status: body.status }, _meta: { qlp: body } });
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://qlp.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, first, next }) => {
      window.calls = []; window.followups = []; window.internal = []; window.protocolErrors = [];
      let ready = false;
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:600px;border:0';
      window.deliver = (params) => iframe.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params }, '*');
      window.addEventListener('message', (event) => {
        if (event.source !== iframe.contentWindow) return;
        const m = event.data;
        if (!m || m.jsonrpc !== '2.0') return;
        window.calls.push(m);
        const reply = (result) => iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result }, '*');
        if (m.method === 'ui/initialize') {
          if (m.params.protocolVersion !== '2026-01-26') { window.protocolErrors.push('bad UI version'); return; }
          reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
        } else if (m.method === 'ui/notifications/initialized') {
          ready = true;
          window.deliver(first);
        } else if (m.method === 'tools/call') {
          if (!ready) window.protocolErrors.push('tool before initialized');
          if (m.params.name === 'reportUiEvent') reply({ content: [], structuredContent: { status: 'recorded' } });
          else if (m.params.name === 'submitAnswer') reply({ _meta: { qlp: { grade: { correct: true, selected: '3', correctAnswer: '3' }, next } } });
          else window.protocolErrors.push('unexpected tool');
        } else if (m.method === 'ui/update-model-context') {
          window.internal.push(m.params.content[0].text);
          reply({});
        } else if (m.method === 'ui/message') {
          window.followups.push(m.params.content[0].text);
          reply({});
        }
      });
      // A partial legacy global must not prevent standard bridge initialization.
      iframe.srcdoc = html.replace('<script>', '<script>window.openai={toolOutput:{status:"needPlan"}};<\/script><script>');
      document.body.appendChild(iframe);
    }, { html: widgetHtml(), first: result(onboarding), next: question });
    const ui = page.frameLocator('iframe');
    await ui.getByRole('button', { name: '2 免除を利用しない' }).click();
    assert.equal(await ui.getByRole('button').count(), 4);
    await ui.getByRole('button', { name: '4 過去問演習中' }).click();
    await page.waitForFunction(() => window.followups.length === 1);
    assert.equal(await page.evaluate(() => window.followups[0]), '学習画面の操作を続ける');
    assert.equal(await page.evaluate(() => window.internal[0]), '免除：免除を利用しない／学習状況：過去問演習中');
    await page.evaluate((r) => window.deliver(r), result(question));
    await ui.locator('input[name=ans][value="3"]').check();
    assert.equal(await page.evaluate(() => window.calls.filter((m) => m.params?.name === 'submitAnswer').length), 0);
    await ui.getByRole('button', { name: '解答する' }).click();
    await page.waitForFunction(() => window.followups.length === 2);
    const answer = await page.evaluate(() => window.calls.find((m) => m.params?.name === 'submitAnswer').params.arguments);
    assert.deepEqual(answer, { sessionId: 'test-session', questionId: 'test:2025:main:1', value: '3', confidence: 'sure' });
    assert.match(await ui.locator('#app').innerText(), /正解（あなたの答え 3／正答は 3）/);
    await page.evaluate((r) => window.deliver(r), result({ status: 'menu', menu: { prompt: 'この問題はどうしますか？', choices: ['詳しい解説（法的根拠つき）', '次の問題へ'] } }));
    await ui.getByRole('button', { name: '2 次の問題へ' }).click();
    await page.waitForFunction(() => window.followups.length === 3);
    assert.equal(await page.evaluate(() => window.followups[2]), '学習画面の操作を続ける');
    assert.equal(await page.evaluate(() => window.internal[2]), '2：次の問題へ');
    await page.evaluate((r) => window.deliver(r), result({ log: '試験用の終了ログ', handoff: '引継ぎID：test-id\n省略しない全文', display: '終了' }));
    assert.equal(await ui.locator('#ho').inputValue(), '引継ぎID：test-id\n省略しない全文');
    assert.equal(await ui.getByRole('button', { name: '引継ぎデータをコピー' }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.protocolErrors), []);
    assert.deepEqual(errors, []);
    console.log(`${name}: PASS onboarding, exact follow-up, answer binding, grade, review, full handoff (375px)`);
  } finally { await browser.close(); }
}
