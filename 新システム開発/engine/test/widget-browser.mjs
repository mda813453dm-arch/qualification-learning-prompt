// 375px の実DOM回帰。ホストは模擬であり ChatGPT iOS 実機の合格を意味しない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const learnerId = 'testlearner';
const sessionId = 'test-session';
const onboarding = { status: 'needPlan', learnerId, sessionId,
  overview: { name: '測量士補', title: '測量士補', fields: ['測量に関する法規'] },
  onboarding: [
    { kind: 'exempt', prompt: '免除制度を利用しますか？', choices: ['免除を利用する', '免除を利用しない'] },
    { kind: 'status', prompt: '現在の学習状況を選んでください。', choices: ['未着手', '基礎学習中', '応用学習中', '過去問演習中'] },
  ] };
const question = { status: 'question', sessionId, question: {
  questionId: 'test:2025:main:1', year: 2025, questionNumber: 1, fieldName: '測量に関する法規',
  stem: '試験用の問題文', choices: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
} };
const nextQuestion = { status: 'question', sessionId, question: {
  ...question.question, questionId: 'test:2025:main:2', questionNumber: 2,
} };
const result = (body) => ({ _meta: { qlp: body }, structuredContent: { status: body.status } });
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://qlp.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, first, question, nextQuestion }) => {
      window.calls = []; window.followups = []; window.internal = []; window.protocolErrors = [];
      let ready = false;
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:600px;border:0';
      window.deliver = params => iframe.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params }, '*');
      window.addEventListener('message', event => {
        if (event.source !== iframe.contentWindow) return;
        const m = event.data; if (!m || m.jsonrpc !== '2.0') return;
        window.calls.push(m);
        const reply = data => iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result: data }, '*');
        if (m.method === 'ui/initialize') {
          if (m.params.protocolVersion !== '2026-01-26') window.protocolErrors.push('invalid UI version');
          reply({ protocolVersion: '2026-01-26', hostCapabilities: {} });
        } else if (m.method === 'ui/notifications/initialized') {
          ready = true; window.deliver(first);
        } else if (m.method === 'tools/call') {
          if (!ready) window.protocolErrors.push('tool before initialized');
          const op = m.params.name;
          if (op === 'reportUiEvent' || op === 'saveProfile' || op === 'chooseItem') reply({ structuredContent: { status: 'recorded' } });
          else if (op === 'saveStudyPlan') reply({ structuredContent: { status: 'planSaved' } });
          else if (op === 'startStudy') reply({ structuredContent: { status: 'study', learnerId: 'testlearner', studyId: 'test-study', display: '学習を開始しました' } });
          else if (op === 'submitAnswer') reply({ structuredContent: { grade: { correct: true, selected: '3', correctAnswer: '3' }, next: nextQuestion } });
          else if (op === 'endStudy') reply({ structuredContent: { log: '試験用の終了ログ', handoff: '引継ぎID：test-id\n省略しない全文', display: '終了' } });
          else if (op === 'redisplayQuestion') reply({ structuredContent: nextQuestion });
          else if (op === 'completeRemediation') {
            const answer = m.params.arguments.selected;
            reply({ structuredContent: answer === '2'
              ? { status: 'remediation_complete', sessionId: 'test-session', notice: '正解。実践問題へ戻れます。' }
              : { status: 'remediation_retry', sessionId: 'test-session', correctAnswer: '2', notice: '不正解。再確認してください。' } });
          }
          else window.protocolErrors.push('unexpected tool ' + op);
        } else if (m.method === 'ui/update-model-context') {
          window.internal.push(m.params.content[0].text);
          reply({});
        } else if (m.method === 'ui/message') {
          window.followups.push(m.params.content[0].text);
          reply({});
        }
      });
      iframe.srcdoc = html.replace('<script>', '<script>window.openai={toolOutput:{status:"needPlan"}};<\/script><script>');
      document.body.appendChild(iframe);
    }, { html: widgetHtml(), first: result(onboarding), question, nextQuestion });
    const ui = page.frameLocator('iframe');
    await ui.getByRole('button', { name: '2 免除を利用しない' }).click();
    await ui.locator('body').evaluate(() => {
      window.__stageEvents = [];
      ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(type => document.addEventListener(type, e => {
        if (window.__stageEvents.length < 24) window.__stageEvents.push({
          type, text: e.target.closest('button')?.textContent?.trim().slice(0, 45),
          detail: e.detail, trusted: e.isTrusted
        });
      }, true));
    });
    await ui.getByRole('button', { name: '4 過去問演習中' }).tap();
    console.log(name + ': AFTER stage tap: ' + (await ui.locator('#app').innerText()).slice(-500));
    console.log(name + ': EVENT TRACE ' + JSON.stringify(await ui.locator('body').evaluate(() => window.__stageEvents)));
    await ui.getByRole('button', { name: /この学習計画で始める/ }).waitFor();
    // 実機の回帰：学習段階4の1タップが、描画し直した計画の「4 今は学習しない」を
    // 触っていないのに押した扱いになって学習計画を閉じないようにする。
    await ui.locator('#notNow').evaluate(b => {
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    });
    assert.match(await ui.locator('#app').innerText(), /学習計画/);
    assert.equal(await ui.getByRole('button', { name: /この学習計画で始める/ }).count(), 1);
    assert.doesNotMatch(await ui.locator('#app').innerText(), /学習は開始していません。/);
    await ui.getByRole('button', { name: /この学習計画で始める/ }).click();
    await ui.getByRole('button', { name: /実践問題から/ }).click();
    await page.waitForFunction(() => window.followups.length >= 1);
    assert.deepEqual(await page.evaluate(() => window.followups), ['学習画面の操作を続ける']);
    assert.match((await page.evaluate(() => window.internal[0])) || '', /実践問題から始めます/);
    await page.evaluate(r => window.deliver(r), result(question));
    await ui.locator('input[name=ans][value="3"]').check();
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length), 0);
    await ui.getByRole('button', { name: '解答する' }).click();
    await ui.locator('#exp').waitFor();
    assert.match(await ui.locator('#app').innerText(), /正解です。/);
    const answer = await page.evaluate(() => window.calls.find(m => m.params?.name === 'submitAnswer').params.arguments);
    assert.deepEqual(answer, { sessionId, questionId: question.question.questionId, value: '3', confidence: 'sure' });
    await ui.getByRole('button', { name: '1 解説を見る' }).click();
    await page.waitForFunction(() => window.followups.length === 2);
    await ui.getByRole('button', { name: /再表示/ }).click();
    await page.waitForFunction(() => window.followups.length === 3);
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length), 1, '再表示で再採点しない');
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'nextQuestion').length), 0, '再表示で次問へ進めない');
    assert.ok((await page.evaluate(() => window.followups)).every(x => x === '学習画面の操作を続ける'), '内部文をチャットへ送らない');
    await page.evaluate(r => window.deliver(r), result({ status: 'menu', menu: { kind: 'next', prompt: '次はどうしますか？', choices: ['次の問題へ', '復習する'], studyId: 'test-study', sessionId } }));
    await ui.getByRole('button', { name: '今日はここまで（学習を終了）' }).click();
    assert.equal(await ui.locator('#ho').inputValue(), '引継ぎID：test-id\n省略しない全文');
    assert.equal(await ui.getByRole('button', { name: '引継ぎデータをコピー' }).count(), 1);
    // 強制補強のAI作成問題でも正答を利用者の回答に混ぜないことを模擬ホストで検証する。
    await page.evaluate(r => window.deliver(r), result({
      status: 'remediation_question', sessionId, challengeId: 'test-check-1',
      question: 'この分野の基本事項として適切な説明はどれですか。',
      choices: ['不適切な説明', '適切な説明', '無関係な説明'],
    }));
    await ui.getByText('AI作成確認問題', { exact: true }).waitFor();
    await ui.locator('input[name=remediationAnswer][value="1"]').check();
    await ui.getByRole('button', { name: '解答する' }).click();
    await ui.getByText('不正解', { exact: true }).waitFor();
    const wrongCheck = await page.evaluate(() => window.calls.filter(x => x.params?.name === 'completeRemediation').at(-1).params.arguments);
    assert.deepEqual(wrongCheck, { sessionId, challengeId: 'test-check-1', selected: '1' }, '回答に正答・問題本文を混ぜない');
    await page.evaluate(r => window.deliver(r), result({
      status: 'remediation_question', sessionId, challengeId: 'test-check-2',
      question: 'もう一度同じ分野の理解を確かめます。適切な説明はどれですか。',
      choices: ['不適切な説明', '適切な説明', '無関係な説明'],
    }));
    await ui.locator('input[name=remediationAnswer][value="2"]').check();
    await ui.getByRole('button', { name: '解答する' }).click();
    await ui.getByRole('button', { name: '同じ分野の公式過去問に戻る' }).waitFor();
    const rightCheck = await page.evaluate(() => window.calls.filter(x => x.params?.name === 'completeRemediation').at(-1).params.arguments);
    assert.deepEqual(rightCheck, { sessionId, challengeId: 'test-check-2', selected: '2' });
    // 「今は学習しない」を本当にタップした場合の従来動作は維持する。
    await page.evaluate(r => window.deliver(r), result(onboarding));
    await ui.getByRole('button', { name: '2 免除を利用しない' }).tap();
    await ui.getByRole('button', { name: '4 過去問演習中' }).tap();
    await ui.getByRole('button', { name: '4 今は学習しない' }).tap();
    assert.match(await ui.locator('#app').innerText(), /学習は開始していません。/);
    assert.deepEqual(await page.evaluate(() => window.protocolErrors), []);
    assert.deepEqual(errors, []);
    console.log(`${name}: PASS onboarding, exact answer, retry, private model context, full handoff, locked AI confirmation (375px)`);
  } finally { await browser.close(); }
}