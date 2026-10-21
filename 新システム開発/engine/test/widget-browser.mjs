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
      window.calls = []; window.followups = []; window.internal = []; window.protocolErrors = []; window.failNextCalls = 2;
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
          else if (op === 'nextQuestion') {
            if (window.failNextCalls > 0) {
              window.failNextCalls--;
              reply({ structuredContent: { status: 'error', error: 'TEMPORARY_UNAVAILABLE' } });
            } else reply({ structuredContent: question });
          }
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
          if (window.rejectContext) {
            iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unsupported context' } }, '*');
            return;
          }
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
    await ui.getByRole('button', { name: '4 過去問演習中' }).click();
    // 押下結果が同じ位置に可視表示され、直後の二度押しも旧画面では無視される。
    await ui.locator('#stageAck').waitFor();
    assert.match(await ui.locator('#stageAck').innerText(), /もう一度押す必要はありません/);
    assert.equal(await ui.getByRole('button', { name: '4 過去問演習中' }).isDisabled(), true);
    await ui.locator('[data-n="4"]').evaluate(b => b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    await ui.getByRole('button', { name: /この学習計画で始める/ }).waitFor();
    assert.match(await ui.locator('#app').innerText(), /画面は「学習計画」に切り替わりました/);
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
    // 最初の2回はエンジン呼び出し失敗。再表示専用APIでなく同じnextQuestionで復旧する。
    await ui.locator('#nextHere:not([disabled])').waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'nextQuestion').length), 1);
    assert.equal(await ui.locator('#nextStatus').count(), 1);
    await ui.getByRole('button', { name: '再試行' }).click();
    await ui.locator('#nextHere:not([disabled])').waitFor();
    assert.equal(await ui.locator('#nextStatus').count(), 1, '2回失敗しても表示は1つ');
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'nextQuestion').length), 2);
    await ui.getByRole('button', { name: '再試行' }).click();
    await ui.locator('input[name=ans][value="3"]').waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'nextQuestion').length), 3);
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'redisplayQuestion').length), 0);
    assert.deepEqual(await page.evaluate(() => window.followups), [], '実践問題の出題はChatGPT依存ではない');
    await ui.locator('input[name=ans][value="3"]').check();
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length), 0);
    await ui.getByRole('button', { name: '解答する' }).click();
    await ui.locator('#exp').waitFor();
    assert.match(await ui.locator('#app').innerText(), /正解です。/);
    const answer = await page.evaluate(() => window.calls.find(m => m.params?.name === 'submitAnswer').params.arguments);
    assert.deepEqual(answer, { sessionId, questionId: question.question.questionId, value: '3', confidence: 'sure' });
    await ui.getByRole('button', { name: '2 解説を見る' }).click();
    await page.waitForFunction(() => window.followups.length === 1);
    await ui.getByRole('button', { name: /再表示/ }).click();
    await page.waitForFunction(() => window.followups.length === 2);
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length), 1, '再表示で再採点しない');
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'nextQuestion').length), 3, '解説の再表示で次問へ進めない');
    assert.ok((await page.evaluate(() => window.followups)).every(x => x === '2025年度 問1の解説を見る'), '会話には問題を識別できる操作名だけを送る');
    const contexts = await page.evaluate(() => window.internal);
    assert.equal(contexts[0], contexts[1], '再表示は同じ問題と採点結果を送る');
    const payload = JSON.parse(contexts[0].split('\nQLP_EXPLANATION_CONTEXT=')[1]);
    assert.equal(payload.sessionId, sessionId);
    assert.equal(payload.studyId, 'test-study');
    assert.deepEqual(payload.question, question.question, '画面内で出題した問題本文・選択肢・IDを渡す');
    assert.deepEqual(payload.grade, { correct: true, selected: '3', correctAnswer: '3' });
    await page.evaluate(() => { window.rejectContext = true; });
    await ui.getByRole('button', { name: /再表示/ }).click();
    await ui.locator('#requestError').waitFor();
    await ui.getByRole('button', { name: /再表示/ }).click();
    await ui.locator('#retryDisplay:not([disabled])').waitFor();
    assert.equal(await ui.locator('#requestError').count(), 1, '通信失敗の表示を重複追加しない');
    assert.equal(await page.evaluate(() => window.followups.length), 2, '文脈送信失敗時に操作名だけ送って再起動しない');
    assert.equal(await ui.getByRole('button', { name: '今日はここまで（学習を終了）' }).count(), 1, '失敗しても終了操作を残す');
    await page.evaluate(() => { window.rejectContext = false; });
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
    await ui.getByRole('button', { name: '2 免除を利用しない' }).click();
    await ui.getByRole('button', { name: '4 過去問演習中' }).click();
    await ui.getByRole('button', { name: '4 今は学習しない' }).click();
    // 間違えて計画の4を押しても、学習計画を即座に破棄せず戻れる。
    assert.match(await ui.locator('#app').innerText(), /学習計画の確認画面から離れますか/);
    assert.doesNotMatch(await ui.locator('#app').innerText(), /学習は開始していません。/);
    await ui.getByRole('button', { name: '1 学習計画に戻る' }).click();
    await ui.getByRole('button', { name: '4 今は学習しない' }).click();
    await ui.getByRole('button', { name: '2 今は学習しない（終了を確認）' }).click();
    assert.match(await ui.locator('#app').innerText(), /学習は開始していません。/);
    assert.deepEqual(await page.evaluate(() => window.protocolErrors), []);
    assert.deepEqual(errors, []);
    console.log(`${name}: PASS onboarding, exact answer, retry, private model context, full handoff, locked AI confirmation (375px)`);
  } finally { await browser.close(); }
}
