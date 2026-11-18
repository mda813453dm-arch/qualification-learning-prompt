// 実エンジン＋実MCP（/app）＋実DOM（375px、Chromium と WebKit）で、v200 の「問題分野を選択」を確かめる。
// 測量士補の合成データ：問1・問2＝測量に関する法規、問3・問4＝多角測量、写真測量には問題なし。
// 1) 採点結果に未選択のプルダウンと「この分野の問題へ」が出る。選んだだけでは移動しない。
// 2) 通信失敗では採点結果を残し、同じ選択欄から再試行できる。成功すると先取りした問3（多角測量）ではなく選んだ分野（測量に関する法規）の問2が出る。
// 3) 問題の無い分野はエンジンの案内を出し、他の分野へ切り替えない。
// 4) 未回答の問が残っているときは移動しない。連打しても nextQuestion は1回だけ。
// 5) 「分からない」の結果にも出る。枠の高さは固定せず、ページは横にはみ出さない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { widgetHtml } from '../src/widget-current.js';
import { SRC, T0, assetsB64, fakeParser, fakeWeb, pdf } from './helpers.js';
import { CATALOG } from '../src/catalog.js';
const SOURCE = { adapter: SRC.adapter, year: SRC.year, section: SRC.section, questionUrl: SRC.questionUrl, answerUrl: SRC.answerUrl };
CATALOG.surveyor.sources = [SOURCE];
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const S1 = '測量に関する法規', S2 = '多角測量';

// 新しい学習枠（ChatGPT が下に出す枠）を、エンジンの応答だけで立ち上げる。
async function mount(browser, tool, frameId, payload) {
  // 別の閲覧状態（新しい会話を開いた端末と同じ）で枠を立ち上げ、元の枠の所有権と競合させない。
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  page.on('pageerror', e => { throw e; });
  await page.exposeFunction('engineTool', tool);
  await page.route('https://qlp.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>' }));
  await page.goto('https://qlp.test/');
  await page.evaluate(({ html, frameId, payload }) => {
    const iframe = document.createElement('iframe');
    iframe.id = frameId; iframe.style.cssText = 'width:100%;height:650px;border:0';
    const send = data => iframe.contentWindow.postMessage(data, '*');
    window.addEventListener('message', async event => {
      if (event.source !== iframe.contentWindow) return;
      const m = event.data; if (!m || m.jsonrpc !== '2.0') return;
      const reply = result => send({ jsonrpc: '2.0', id: m.id, result });
      if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
      else if (m.method === 'ui/notifications/initialized') send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { _meta: { qlp: payload } } });
      else if (m.method === 'tools/call') reply(await window.engineTool(m.params.name, m.params.arguments));
      else if (m.id != null) reply({});
    });
    iframe.srcdoc = html.replace('<script>', '<script>window.openai={notifyIntrinsicHeight:function(h){if(window.frameElement)window.frameElement.style.height=Math.ceil(h)+"px"}};<\/script><script>');
    document.body.appendChild(iframe);
  }, { html: widgetHtml(), frameId, payload });
  return page.frameLocator('#' + frameId);
}

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('jump-q'), [SRC.answerUrl]: pdf('jump-a') });
  const parser = fakeParser(web, { src: { ...SRC, qualificationId: 'q063' }, answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's2', 's2'], figureOn: [] });
  const env = { STORE: new MemoryStore(), API_TOKEN: 'browser-test', fetchPdf: web.fetchPdf, fetchText: async () => '', now: T0, PARSER_URL: 'https://parser.example' };
  env.clock = () => env.now;
  env.parserFetch = async (_, init) => {
    const b = JSON.parse(init.body);
    const bytes = x => Uint8Array.from(atob(x.base64), c => c.charCodeAt(0));
    const parsed = await parser({ question: { bytes: bytes(b.question) }, answer: { bytes: bytes(b.answer) } });
    return new Response(JSON.stringify({ result: parsed.result, assets: assetsB64(parsed.assets) }));
  };
  const request = async (path, body, method = 'POST') => {
    const response = await handle(new Request(`https://engine.example${path}`, { method,
      headers: { authorization: 'Bearer browser-test', 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env);
    return response.json();
  };
  let id = 1;
  const calls = [];
  const faults = { failFieldJump: 0, pendingSnapshot: null };
  const tool = async (toolName, args) => {
    calls.push({ name: toolName, args });
    if (toolName === 'nextQuestion' && args.fieldName && faults.failFieldJump > 0) {
      faults.failFieldJump--;
      return { isError: true, structuredContent: { error: 'NETWORK_TEST_FAILURE' } };
    }
    if (toolName === 'getStudySnapshot' && faults.pendingSnapshot) {
      const v = faults.pendingSnapshot; faults.pendingSnapshot = null;
      return { structuredContent: v, _meta: { qlp: v } };
    }
    const response = await request('/app', { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: toolName, arguments: args } });
    assert.equal(response.error, undefined, JSON.stringify(response));
    return response.result;
  };
  const session = await request('/v1/sessions', { qualificationId: '測量士補', sources: [SOURCE] });
  const study = await request('/v1/study/start', { qualificationName: '測量士補', learnerId: session.learnerId });
  const first = await request(`/v1/sessions/${session.sessionId}/next`, { fieldName: S1 });
  assert.equal(first.question?.questionNumber, 1, JSON.stringify({ first, job: first.job, parserUrl: process.env.PARSER_URL ?? null }).slice(0, 1500));
  const jumps = () => calls.filter(c => c.name === 'nextQuestion' && c.args.fieldName);
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('engineTool', tool);
    await page.route('https://qlp.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>' }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, first, study, session }) => {
      const iframe = document.createElement('iframe');
      iframe.id = 'w'; iframe.style.cssText = 'width:100%;height:650px;border:0';
      const send = data => iframe.contentWindow.postMessage(data, '*');
      window.addEventListener('message', async event => {
        if (event.source !== iframe.contentWindow) return;
        const m = event.data; if (!m || m.jsonrpc !== '2.0') return;
        const reply = result => send({ jsonrpc: '2.0', id: m.id, result });
        if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
        else if (m.method === 'ui/notifications/initialized') send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { _meta: { qlp: { ...first, learnerId: session.learnerId, studyId: study.studyId } } } });
        else if (m.method === 'tools/call') reply(await window.engineTool(m.params.name, m.params.arguments));
        else if (m.id != null) reply({});
      });
      iframe.srcdoc = html.replace('<script>', '<script>window.openai={notifyIntrinsicHeight:function(h){if(window.frameElement)window.frameElement.style.height=Math.ceil(h)+"px"}};<\/script><script>');
      document.body.appendChild(iframe);
    }, { html: widgetHtml(), first, study, session });
    const ui = page.frameLocator('#w');
    await ui.getByText('問1の本文', { exact: true }).waitFor();
    assert.equal(await ui.locator('#fieldJumpSelect').count(), 0, '回答前には出さない');
    await ui.locator('input[name=ans][value="3"]').check();
    await ui.getByRole('button', { name: '解答する', exact: true }).click();
    await ui.locator('.result-grade').waitFor();
    const select = ui.locator('#fieldJumpSelect');
    await select.waitFor();
    const afterGrade = JSON.parse(await env.STORE.get('ses/' + session.sessionId)).state.current;
    assert.equal(afterGrade.prefetched, true);
    assert.equal(Number(afterGrade.questionId.split(':').at(-1)), 3, `${name}: 通常の次問は 多角測量 の問3を先取り済み`);
    assert.equal(await select.inputValue(), '', `${name}: 初期は未選択`);
    const labels = await select.locator('option').allInnerTexts();
    assert.equal(labels[0], '分野を選択してください');
    assert.ok(labels.includes(S1) && labels.includes(S2), `${name}: 正式分野 ${labels}`);
    assert.ok(labels.includes('写真測量（出題できる問題がありません）'), `${name}: 問題の無い分野を明示`);
    const layout = await ui.locator('body').evaluate(() => {
      const s = document.getElementById('fieldJumpSelect'), b = document.getElementById('fieldJumpGo');
      const app = document.getElementById('app');
      return { wide: document.documentElement.scrollWidth <= 375, sh: s.offsetHeight, bh: b.offsetHeight,
        noInnerScroll: app.scrollHeight <= app.clientHeight + 2 || getComputedStyle(app).overflowY !== 'auto' && getComputedStyle(app).overflowY !== 'scroll' };
    });
    assert.ok(layout.wide, `${name}: 横にはみ出さない`);
    assert.ok(layout.sh >= 40 && layout.bh >= 40, `${name}: タップできる大きさ ${JSON.stringify(layout)}`);
    assert.ok(layout.noInnerScroll, `${name}: 縦の枠内スクロールにしない`);
    // 未選択のまま押す → 案内だけ
    await ui.locator('#fieldJumpGo').click();
    assert.match(await ui.locator('#fieldJumpStatus').innerText(), /分野を選んでから/);
    assert.equal(jumps().length, 0);
    // 選んだだけでは移動しない
    await select.selectOption({ label: S2 });
    await page.waitForTimeout(300);
    assert.equal(jumps().length, 0, `${name}: 選んだだけでは nextQuestion を呼ばない`);
    // 通信失敗 → 採点結果を残して再試行できる
    faults.failFieldJump = 1;
    await ui.locator('#fieldJumpGo').click();
    await ui.locator('#fieldJumpStatus').filter({ hasText: '移動できませんでした' }).waitFor();
    assert.equal(await ui.locator('.result-grade').count(), 1, `${name}: 採点結果を残す`);
    assert.equal(await select.isDisabled(), false, `${name}: 同じ選択欄から再試行できる`);
    assert.equal(await ui.locator('#next').isDisabled(), false, `${name}: 他のボタンも戻る`);
    // 問題の無い分野
    await select.selectOption({ label: '写真測量（出題できる問題がありません）' });
    await ui.locator('#fieldJumpGo').click();
    await ui.locator('#fieldJumpStatus').filter({ hasText: '出題可能な公式過去問がありません' }).waitFor();
    assert.equal(await ui.locator('.result-grade').count(), 1, `${name}: 他の分野へ切り替えない`);
    // 未回答の問が残っている（別の枠で次の問題を開いた）
    faults.pendingSnapshot = { status: 'question', sessionId: session.sessionId, question: { questionId: 'other-unanswered', fieldName: S1 } };
    const before = jumps().length;
    await select.selectOption({ label: S1 });
    await ui.locator('#fieldJumpGo').click();
    await ui.locator('#fieldJumpStatus').filter({ hasText: '回答していない問題があるため' }).waitFor();
    assert.equal(jumps().length, before, `${name}: 未回答の問を迂回しない`);
    // 再試行で成功（連打しても1回）
    const n0 = jumps().length;
    await ui.locator('#fieldJumpGo').evaluate(b => { b.click(); b.click(); b.click(); });
    await ui.getByText('問2の本文', { exact: true }).waitFor();
    assert.equal(jumps().length, n0 + 1, `${name}: 連打しても nextQuestion は1回`);
    assert.deepEqual(jumps().at(-1).args, { sessionId: session.sessionId, fieldName: S1 }, `${name}: 正式分野名だけを渡す`);
    assert.equal(await ui.getByText('問3の本文', { exact: true }).count(), 0, `${name}: 先取りした問3（別分野）を出さない`);
    assert.equal(await ui.getByText('この項目はどう進めますか', { exact: false }).count(), 0, `${name}: 学習方法の選択を挟まない`);
    assert.equal(calls.filter(c => c.name === 'startSession').length, 0, `${name}: 新しい学習を始めない`);
    // 分からない → 結果に選択欄 → 同じ分野（多角測量）の未出題 問4 へ
    await ui.getByRole('button', { name: '分からない', exact: true }).click();
    await ui.getByText(/分からない（採点には数えません）/).waitFor();
    await ui.locator('#fieldJumpSelect').selectOption({ label: S2 });
    await ui.locator('#fieldJumpGo').click();
    await ui.getByText('問3の本文', { exact: true }).waitFor();
    assert.equal(await ui.getByText('この項目はどう進めますか', { exact: false }).count(), 0, `${name}: 分野が変わっても学習方法の選択を挟まない`);
    // AIの詳しい解説の後の操作（新しい枠）：問3を採点し、解説を登録した画面から 測量に関する法規（全問回答済み→再出題）へ
    await ui.locator('input[name=ans][value="4"]').check();
    await ui.getByRole('button', { name: '解答する', exact: true }).click();
    await ui.locator('.result-grade').waitFor();
    const ctx = (await tool('explainSpec', { sessionId: session.sessionId })).structuredContent;
    assert.equal(ctx.status, 'explanationContext');
    const published = (await tool('showMenu', { kind: 'next', explanationRef: ctx.explanationRef, sessionId: ctx.sessionId, studyId: ctx.studyId, learnerId: ctx.learnerId,
      body: '## AIによる解説（結合試験用）\n\n' + '多角測量の各選択肢の判断根拠を、公式の正答と照らして順に確認します。'.repeat(5) }))._meta.qlp;
    assert.equal(published.status, 'menu');
    assert.ok(published.menu.fieldJump, '解説後の操作に分野の一覧');
    const menu = await mount(browser, tool, 'm', published);
    await menu.getByRole('heading', { name: 'AIによる解説（結合試験用）' }).waitFor({ timeout: 8000 }).catch(async () => { throw new Error('MENU ' + (await menu.locator('body').innerText()).slice(0, 800)); });
    assert.equal(await menu.locator('#fieldJumpSelect').inputValue(), '');
    await menu.locator('#fieldJumpSelect').selectOption({ label: S1 });
    await menu.locator('#fieldJumpGo').click();
    await menu.getByText('問1の本文', { exact: true }).or(menu.getByText('問2の本文', { exact: true })).first().waitFor();
    assert.deepEqual(jumps().at(-1).args, { sessionId: session.sessionId, fieldName: S1 });
    // 確認問題3問の完了画面：実践問題の状態（chooseItem practice）にしてから選んだ分野へ
    await request(`/v1/sessions/${session.sessionId}/item`, { fieldName: S2, mode: 'check' });
    let done;
    for (let n = 1; n <= 3; n++) {
      const reg = await request(`/v1/sessions/${session.sessionId}/confirmation/register`, { question: 'TEST ONLY 確認問題 ' + n + ' の正しい選択肢は？',
        choices: ['一', '二', '三'], correctAnswer: 2, explanation: 'テスト用の固定された正答です。' });
      done = await request(`/v1/sessions/${session.sessionId}/confirmation/answer`, { challengeId: reg.challengeId, selected: '2' });
    }
    assert.equal(done.complete, true);
    const conf = await mount(browser, tool, 'c', { ...done, sessionId: session.sessionId });
    await conf.getByRole('heading', { name: '確認問題 3 / 3問の結果' }).waitFor();
    await conf.locator('#fieldJumpSelect').selectOption({ label: S1 });
    await conf.locator('#fieldJumpGo').click();
    await conf.getByText('問1の本文', { exact: true }).or(conf.getByText('問2の本文', { exact: true })).first().waitFor();
    const lastItem = calls.filter(c => c.name === 'chooseItem').at(-1);
    assert.deepEqual(lastItem.args, { sessionId: session.sessionId, fieldName: S1, mode: 'practice' }, `${name}: 確認問題の完了から実践問題の状態にする`);
    assert.equal(calls.filter(c => c.name === 'startSession').length, 0, `${name}: 新しい学習を始めない`);
    if (process.env.QLP_SCREENSHOT_DIR && name === 'chromium') await page.screenshot({ path: `${process.env.QLP_SCREENSHOT_DIR}/field-jump-v200.png`, fullPage: true });
    assert.deepEqual(errors, [], `${name}: 画面のエラー`);
    console.log(name, 'ok');
  } finally { await browser.close(); }
}
