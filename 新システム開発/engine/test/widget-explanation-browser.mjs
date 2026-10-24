// 実エンジン＋実MCP＋実DOMを結合する。モデル役の生成本文だけは固定の試験文。
// ChatGPTホスト・実モデル自体の試験ではない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { widgetHtml } from '../src/widget.js';
import { SRC, T0, assetsB64, fakeParser, fakeWeb, pdf } from './helpers.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const web = fakeWeb({ [SRC.questionUrl]: pdf('q-v1'), [SRC.answerUrl]: pdf('a-v1') });
  const parser = fakeParser(web, { answers: [3, 1, 4, 2], fieldIds: ['s1', 's1', 's1', 's2'] });
  const env = { STORE: new MemoryStore(), API_TOKEN: 'browser-test', fetchPdf: web.fetchPdf, clock: () => T0, PARSER_URL: 'https://parser.example' };
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
  const toolCalls = [];
  const tool = async (name, args) => {
    toolCalls.push({ name, args });
    const response = await request('/app', { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } });
    assert.equal(response.error, undefined, JSON.stringify(response));
    return response.result;
  };
  const session = await request('/v1/sessions', { qualificationId: SRC.qualificationId, sources: [SRC] });
  const knownSessionId = session.sessionId; // AIが最初のstartSessionから知る値。UI文脈からは受け取らない。
  const study = await request('/v1/study/start', { qualificationName: '測量士補', learnerId: session.learnerId });
  const first = await request(`/v1/sessions/${knownSessionId}/next`);
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('engineTool', tool);
    await page.exposeFunction('modelStep', async (message, delivered) => {
      // iOSのホストがassistant-only文脈を全て落とす失敗を再現する。
      assert.match(message, /^2026年度 問1の各選択肢の理由と計算手順を、公式資料に基づいて解説してください。\（照合番号：E-[A-Za-z0-9_-]{16}\）$/);
      assert.equal(delivered.content.length, 1, 'モデルには可視テキストだけを渡す');
      const ref = message.match(/照合番号：(E-[A-Za-z0-9_-]{16})/)[1];
      const before = toolCalls.length;
      const fetched = await tool('nextQuestion', { sessionId: ref });
      assert.equal(fetched.isError, false);
      const context = fetched.structuredContent;
      assert.equal(context.question.questionId, first.question.questionId);
      assert.equal(context.question.year, 2026);
      assert.equal(context.question.questionNumber, 1);
      assert.deepEqual(context.question.choices, first.question.choices);
      assert.equal(context.grade.correctAnswer, 3);
      assert.equal(toolCalls.length, before + 1, 'モデル役は公開済みのnextQuestionツールで公式根拠を読み取る');
      const body = `## AIによる解説（結合試験用）\n\n${context.question.year}年度 問${context.question.questionNumber}の正答は${context.grade.correctAnswer}です。\n\n|番号|選択肢|\n|---|---|\n${context.question.choices.map((choice, i) => `|${i + 1}|${choice}|`).join('\n')}`;
      const menu = await tool('showMenu', { kind:'next',
        explanationRef:ref, sessionId:context.sessionId, studyId:context.studyId,
        learnerId:context.learnerId,
        body:body+'\\n1. 公式本文の前提を照合して選択肢を区別します。\\n2. 正答の選択肢の理由と計算手順を整理し、誤答の理由もすべて説明します。\\n3. 問題の図と条件に適合する結論を示します。',
      });
      assert.equal(menu.isError,undefined,JSON.stringify(menu.structuredContent));
      assert.equal(menu._meta.qlp.status,'menu');
      return { body, view:menu._meta.qlp };
    });
    await page.route('https://qlp.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, first, study, session }) => {
      window.messages = []; window.modelReplies = []; window.hiddenContext = null; window.droppedContext = 0; window.droppedWidgetState = 0;
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:650px;border:0';
      const send = data => iframe.contentWindow.postMessage(data, '*');
      const deliver = result => send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
      window.addEventListener('message', async event => {
        if (event.source !== iframe.contentWindow) return;
        const m = event.data; if (!m || m.jsonrpc !== '2.0') return;
        const reply = result => send({ jsonrpc: '2.0', id: m.id, result });
        if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
        else if (m.method === 'ui/notifications/initialized') deliver({ _meta: { qlp: { ...first, learnerId: session.learnerId, studyId: study.studyId } } });
        else if (m.method === 'tools/call') reply(await window.engineTool(m.params.name, m.params.arguments));
        else if (m.method === 'ui/update-model-context') {
          if (!m.params.content.every(c => c.annotations?.audience?.length === 1 && c.annotations.audience[0] === 'assistant')) window.protocolErrors = (window.protocolErrors || []).concat('non-private context');
          window.hiddenContext = m.params; window.droppedContext++; reply({});
        }
        else if (m.method === 'ui/message') {
          window.messages.push(m.params.content[0].text); reply({});
          // 初回はホストがAIを起動しなかった状態を再現。再表示時に既知のsessionIdだけで復旧する。
          const replyView = await window.modelStep(window.messages.at(-1), {content:[m.params.content[0]]});
          window.modelReplies.push(replyView);
          deliver({ _meta:{ qlp:replyView.view } });
        }
      });
      iframe.srcdoc = html.replace('<script>', '<script>window.openai={setWidgetState:()=>window.parent.droppedWidgetState++};<\/script><script>');
      document.body.appendChild(iframe);
    }, { html: widgetHtml(), first, study, session });
    const ui = page.frameLocator('iframe');
    assert.equal(await ui.getByRole('progressbar', { name: '全分野の学習ルートの位置' }).getAttribute('aria-valuenow'), '5');
    assert.match(await ui.locator('.study-progress').first().innerText(), /実践問題/);
    assert.match(await ui.getByRole('progressbar', { name: 'この分野の実践問題の位置' }).getAttribute('aria-valuenow'), /1/);
    await ui.locator('input[name=ans][value="3"]').check();
    await ui.getByRole('button', { name: '解答する', exact: true }).click();
    await ui.getByRole('button', { name: '2 解説を見る', exact: true }).click();
    await ui.getByRole('heading', { name: '2026年度 問1の公式正答照合' }).waitFor();
    await page.waitForFunction(() => window.messages.length === 1);
    assert.equal(toolCalls.filter(c => c.name === 'explainSpec').length, 1, '保存した採点データを解説前に自動取得');
    assert.match(await ui.locator('#app').innerText(), /公式正答：3/);
    assert.equal(await ui.getByRole('button', { name: 'AI解説を再依頼' }).count(), 0, '成功した解説画面に無意味な再依頼を表示しない');
    assert.equal(await ui.getByRole('button', { name: '公式正答を再表示' }).count(), 0, '正答表示中の無意味な再表示を表示しない');
    await page.waitForFunction(() => window.modelReplies.length === 1);
    assert.match((await page.evaluate(() => window.modelReplies[0].body)), /AIによる解説（結合試験用）/);
    assert.equal(await ui.getByRole('progressbar', { name: '全分野の学習ルートの位置' }).getAttribute('aria-valuenow'), '5', '学習画面の解説にも全体位置を示す');
    await ui.getByRole('heading', {name:'AIによる解説（結合試験用）'}).waitFor();
    assert.equal(await ui.getByRole('button', {name:'次の問題へ'}).count(),1,
      'AI解説と同じ最新の学習画面に次問ボタンを設置');
    assert.ok(await ui.locator('.md').evaluate(el =>
      !!(el.compareDocumentPosition(document.querySelector('.choices')) & Node.DOCUMENT_POSITION_FOLLOWING)),
      '解説本文の直後にボタンを配置する');
    assert.equal(toolCalls.filter(c => c.name === 'explainSpec').length, 1, '解説の重複依頼をしない');
    assert.equal(toolCalls.filter(c => c.name === 'nextQuestion' && /^E-/.test(c.args.sessionId)).length, 1, 'モデルの既存ツールから照合番号で公式根拠を取得');
    assert.equal(toolCalls.filter(c => c.name === 'showMenu').length, 1, '検証済みの解説全文を一度だけ登録し、次問ボタンを生成');
    assert.equal(toolCalls.filter(c => c.name === 'submitAnswer').length, 1);
    assert.equal(toolCalls.filter(c => c.name === 'nextQuestion' && !/^E-/.test(c.args.sessionId)).length, 0, '解説中に通常の次問取得を実行しない');
    assert.equal(await page.evaluate(() => window.droppedContext), 0, '解説は遅延モデル文脈のACKや取落ちに依存しない');
    assert.equal(await page.evaluate(() => window.droppedWidgetState), 0, '入力欄の添付を作らない');
    const messages = await page.evaluate(() => window.messages);
    assert.equal(messages.length, 1);
    assert.ok(messages.every(m => /^2026年度 問1の各選択肢の理由と計算手順を、公式資料に基づいて解説してください。\（照合番号：E-[A-Za-z0-9_-]{16}\）$/.test(m)),
      '会話に表示するのは解説依頼と短い照合番号だけ');
    assert.ok(messages.every(m => !m.includes(knownSessionId) && !m.includes(first.question.questionId)),
      '内部セッションID・問題ID・AI指示をチャットに露出しない');
    await ui.getByRole('button', { name: '次の問題へ', exact: true }).click();
    await ui.getByText('問2の本文', { exact: true }).waitFor();
    assert.ok(toolCalls.filter(c => c.name === 'nextQuestion' && !/^E-/.test(c.args.sessionId)).length <= 1, '通常の次問取得は学習画面だけが管理する');
    assert.equal(await page.evaluate(() => window.messages.length), 1, '解説後の次問表示はAIへの依頼に依存しない');
    for (const [number, answer] of [[2, '1'], [3, '4']]) {
      await ui.locator(`input[name=ans][value="${answer}"]`).check();
      await ui.getByRole('button', { name: '解答する', exact: true }).click();
      await ui.locator('.result-grade .grade-detail').filter({ hasText: 'あなたの答え：' + answer }).waitFor();
      if (number === 2) {
        assert.equal(await ui.locator('#review').count(), 0);
        await ui.locator('#next').click();
        await ui.getByText('問3の本文', { exact: true }).waitFor();
      }
    }
    assert.deepEqual(await ui.locator('.choices button span').allInnerTexts(),
      ['次の分野の問題へ', '解説を見る', 'この分野の実践問題を続ける', '総復習（間違えた問題）', '今日はここまで（学習を終了）']);
    assert.equal(await ui.getByRole('progressbar', { name: '全分野の学習ルートの位置' }).getAttribute('aria-valuenow'), '7');
    await ui.locator('#review').click();
    await ui.getByText('間違えた問題はまだありません。', { exact: false }).waitFor();
    assert.equal(await ui.locator('#next').count(), 1, '復習対象がなくても次の分野への選択を保持する');
    await ui.locator('#next').click();
    // 新分野では既存仕様の「この項目の進め方」を選ぶ。実践問題を選ぶと先取り済みの問4を表示する。
    await ui.locator('#itemModes button[data-mode="practice"]').click();
    await ui.getByText('問4の本文', { exact: true }).waitFor();
    assert.equal(await ui.getByRole('progressbar', { name: '全分野の学習ルートの位置' }).getAttribute('aria-valuenow'), '12');
    assert.deepEqual(errors, []);
    console.log(`${name}: PASS real engine/MCP/DOM, dropped hidden context, retry, exact explanation, next question (375px; fixed model fixture)`);
  } finally { await browser.close(); }
}
