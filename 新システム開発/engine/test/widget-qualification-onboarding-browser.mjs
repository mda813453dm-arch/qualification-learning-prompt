// Real v-current Widget + MCP + engine, isolated 375px synthetic host.
// No external official PDFs, Cloud Run, native ChatGPT host, or AI generation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { CATALOG } from '../src/catalog.js';
import { WIDGET_URI } from '../src/widget-current.js';
import { T0 } from './helpers.js';

const { chromium, webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const engines = { chromium, webkit };
const entries = Object.entries(CATALOG);
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(engines);
const selected = process.env.QLP_QUALIFICATIONS?.split(',');
const cases = selected ? entries.filter(([slug]) => selected.includes(slug)) : entries;
assert.ok(cases.length);
if (selected) assert.equal(cases.length, new Set(selected).size, 'Unknown qualification slug');

async function verify(browser, slug, c) {
  const env = { STORE: new MemoryStore(), API_TOKEN: 'browser-test', clock: () => T0,
    fetchPdf: async () => { throw new Error('OFFLINE_PDF_UNAVAILABLE'); },
    fetchText: async () => { throw new Error('OFFLINE_TEXT_UNAVAILABLE'); } };
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(6000);
  try {
    const pageErrors = [];
    const toolNames = [];
    let id = 0;
    async function rpc(method, params) {
      const res = await handle(new Request('https://engine.example/app', {
        method: 'POST', headers: { authorization: 'Bearer browser-test', 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      }), env);
      assert.equal(res.status, 200, method);
      const body = await res.json();
      assert.equal(body.error, undefined, JSON.stringify(body.error));
      return body.result;
    }
    async function tool(name, args) {
      toolNames.push(name);
      return rpc('tools/call', { name, arguments: args });
    }
    const initial = await tool('startSession', { qualificationId: c.aliases[0], sources: [] });
    assert.ok(!initial.isError, JSON.stringify(initial.structuredContent));
    const view = initial._meta?.qlp;
    assert.ok(view?.sessionId && view.onboarding?.length, 'Missing onboarding result');
    const [resource] = (await rpc('resources/read', { uri: WIDGET_URI })).contents;
    assert.equal(resource.uri, WIDGET_URI);
    assert.ok(resource.text?.includes('<html'));
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.exposeFunction('matrixTool', tool);
    await page.route('https://qlp.test/', r => r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"></body>',
    }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, result }) => {
      window.bridgeErrors = [];
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:block;width:100%;height:650px;border:0';
      function send(message) { iframe.contentWindow.postMessage({ jsonrpc: '2.0', ...message }, '*'); }
      addEventListener('message', async event => {
        if (event.source !== iframe.contentWindow || event.data?.jsonrpc !== '2.0') return;
        const m = event.data;
        const reply = result => send({ id: m.id, result });
        try {
          if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
          else if (m.method === 'ui/notifications/initialized') send({ method: 'ui/notifications/tool-result', params: result });
          else if (m.method === 'ui/notifications/size-changed' && Number.isFinite(m.params?.height)) iframe.style.height = Math.ceil(m.params.height) + 'px';
          else if (m.method === 'tools/call') reply(await window.matrixTool(m.params.name, m.params.arguments));
          else if (m.id != null) reply({});
        } catch (e) { window.bridgeErrors.push(e.message); }
      });
      iframe.srcdoc = html;
      document.body.append(iframe);
    }, { html: resource.text, result: initial });
    const ui = page.frameLocator('iframe');
    await ui.locator('.ov-h').filter({ hasText: '試験概要' }).waitFor();
    const qualificationRow = ui.locator('.ov-r').filter({ has: ui.locator('.ov-k').getByText('資格名', { exact: true }) });
    assert.equal(await qualificationRow.locator('.ov-v').innerText(), c.name);
    const officialLink = ui.getByRole('link', { name: '公式ページを開く ›' });
    const source = c.overviewSource ?? c.officialSite;
    if (/^https?:\/\//.test(source ?? '')) assert.equal(await officialLink.getAttribute('href'), source);
    assert.equal(await ui.locator('input[name=ans]').count(), 0, 'no question before study setup');
    for (const step of view.onboarding) {
      await ui.getByRole('heading', { name: step.prompt, exact: true }).waitFor();
      const choice = step.kind === 'exempt' ? 2 : 1;
      const button = ui.locator('.choices button[data-n="' + choice + '"]');
      assert.equal(await button.locator('span').innerText(), step.choices[choice - 1]);
      await button.click();
    }
    await ui.getByRole('heading', { name: '学習計画', exact: true }).waitFor();
    assert.ok(await ui.locator('#startStudy').isEnabled());
    assert.equal(await ui.locator('#diag').isDisabled(), Boolean(c.overviewOnly), 'diagnosis unavailable without an official question library');
    assert.ok(await ui.locator('#app').evaluate(e => e.ownerDocument.documentElement.scrollWidth <= 375), '375px without horizontal overflow');
    assert.deepEqual(await ui.locator('#app .stem').filter({ hasText: '学習する分野の順' }).locator('ol > li').allInnerTexts(), Object.values(c.fields));
    await ui.getByRole('button', { name: '特定の分野・間違えた問題から始める', exact: true }).click();
    await ui.getByRole('heading', { name: '学習する分野を選択', exact: true }).waitFor();
    const eligibleOptions = await ui.locator('#studyScopeChoices option').allInnerTexts();
    assert.match(eligibleOptions[0], /^おまかせ/);
    assert.match(eligibleOptions[1], /^間違えた問題を復習/);
    assert.deepEqual(eligibleOptions.slice(2), Object.values(c.fields));
    assert.ok(await ui.locator('#studyScopeFreeField').isEditable());
    assert.equal(toolNames.filter(n => n === 'saveProfile').length, 1);
    assert.ok(!toolNames.some(n => ['startStudy', 'nextQuestion', 'submitAnswer'].includes(n)), 'rendering a plan must not begin or grade a question');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(await page.evaluate(() => window.bridgeErrors), []);
  } finally {
    await page.close();
  }
}

let failed = 0;
for (const name of names) {
  assert.ok(engines[name], 'Expected chromium or webkit');
  const executablePath = name === 'webkit' ? process.env.QLP_WEBKIT_EXECUTABLE : undefined;
  const browser = await engines[name].launch(executablePath ? { executablePath } : {});
  try {
    const results = await Promise.allSettled(Array.from({ length: 4 }, async (_, worker) => {
      for (let i = worker; i < cases.length; i += 4) {
        const [slug, c] = cases[i];
        try {
          await verify(browser, slug, c);
          console.log(`PASS ${name} ${slug} ${c.name}`);
        } catch (e) {
          failed++;
          console.error(`FAIL ${name} ${slug} ${c.name}: ${e.stack}`);
        }
      }
    }));
    assert.ok(results.every(r => r.status === 'fulfilled'));
  } finally {
    await browser.close();
  }
}
console.log(`Qualification screen matrix: ${cases.length * names.length - failed}/${cases.length * names.length} passed`);
if (failed) process.exitCode = 1;
