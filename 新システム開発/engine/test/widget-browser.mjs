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
  stemMode: 'official_image', choiceMode: 'official_image', figures: [{ url: 'https://qlp.test/figure.png' }],
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
    await page.route('https://qlp.test/figure.png', route => route.fulfill({
      contentType: 'image/png', headers: { 'access-control-allow-origin': '*' },
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAWHRFWHRTb3VyY2UAT2ZmaWNpYWwgdGVzdCBpbWFnZSByZWZlcmVuY2U6IHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4d9amawAAABRJREFUeJxj/P//PwMMMDEgAdwcAJZuAwXyJb75AAAAAElFTkSuQmCC', 'base64'),
    }));
    await page.goto('https://qlp.test/');
    await page.evaluate(({ html, first, question, nextQuestion }) => {
      window.calls = []; window.followups = []; window.fullMessages = []; window.internal = []; window.protocolErrors = []; window.failNextCalls = 2;
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
          if (op === 'startSession') {
            const q = String(m.params.arguments.qualificationId || '');
            if (!q.includes('宅建')) reply({ isError: true, structuredContent: { error: 'QUALIFICATION_NOT_SUPPORTED' } });
            else reply({ structuredContent: { ...first._meta.qlp, sessionId: 'test-session-startup-recovered' } });
          }
          else if (op === 'chooseItem') reply({ structuredContent: { status: 'item',
            mode: m.params.arguments.mode, fieldName: m.params.arguments.fieldName,
            journey: { fieldIndex: 1, fieldTotal: 8 } } });
          else if (op === 'reportUiEvent' || op === 'saveProfile') reply({ structuredContent: { status: 'recorded' } });
          else if (op === 'saveStudyPlan') reply({ structuredContent: { status: 'planSaved' } });
          else if (op === 'startStudy') reply({ structuredContent: { status: 'study', learnerId: 'testlearner', studyId: 'test-study', display: '学習を開始しました' } });
          else if (op === 'nextQuestion') {
            if (window.recoverSkipped) reply({ structuredContent: nextQuestion });
            else if (window.failNextCalls > 0) {
              window.failNextCalls--;
              reply({ structuredContent: { status: 'error', error: 'TEMPORARY_UNAVAILABLE' } });
            } else reply({ structuredContent: question });
          }
          else if (op === 'submitAnswer') {
            if (m.params.arguments.value === 'スキップ' && window.dropSkipResponseOnce) {
              window.dropSkipResponseOnce = false;
              window.recoverSkipped = true;
              reply({ structuredContent: { error: 'LOST_ANSWER_RESPONSE' } });
            } else reply({ structuredContent: { grade: m.params.arguments.value === 'スキップ'
              ? { skipped: true } : { correct: true, selected: '3', correctAnswer: '3' }, next: nextQuestion } });
          }
          else if (op === 'openDescriptiveQuestion') {
            const args = m.params.arguments;
            window.restorePayload = null; // 新しい記述式を開いた後は旧択一の復元状態で上書きしない
            window.lastDescriptive = { status: 'descriptiveQuestion', sessionId: args.sessionId,
              question: { questionId: 'land_surveyor:' + args.year + ':' + args.section + ':' + args.number,
                year: args.year, section: args.section, number: args.number, kind: 'descriptive',
                shownAt: ++window.descriptiveCounter,
                gradingMode: 'none', text: '第21問\n観測結果\n器械点  視準点\nT1  T2  0°\n見取図\nA\nB\nC',
                pages: [{ page: 24, url: 'https://qlp.test/original.png' }],
                layout: [
                  { kind: 'text', text: '第21問 観測結果を使って計算する。' },
                  { kind: 'table', caption: '〔測量成果〕', rows: [['点名','X座標(m)','Y座標(m)'], ['A','200.00','199.50']] },
                  { kind: 'figure', file: 'f1.png', page: 24, url: 'https://qlp.test/figure.png' },
                ],
                sourceUrl: 'https://www.moj.go.jp/content/001450011.pdf' } };
            reply({ structuredContent: window.lastDescriptive });
          }
          else if (op === 'verifyCurrentDescriptive') {
            const q=window.lastDescriptive?.question, args=m.params.arguments;
            if (!q || args.questionId!==q.questionId || Number(args.shownAt)!==Number(q.shownAt))
              reply({ structuredContent:{ error:'DESCRIPTIVE_ACTIONS_STALE' } });
            else reply({ structuredContent:{status:'descriptiveCurrentVerified',sessionId:args.sessionId,
              questionId:q.questionId,shownAt:q.shownAt,revealed:window.lastDescriptive.status==='descriptiveReveal'} });
          }
          else if (op === 'revealDescriptiveAnswer') {
            if (m.params.arguments.questionId !== window.lastDescriptive?.question?.questionId)
              reply({ structuredContent: { error:'DESCRIPTIVE_ACTIONS_STALE' } });
            else {
              window.lastDescriptive = { ...window.lastDescriptive, status:'descriptiveReveal' };
              reply({ structuredContent: window.lastDescriptive });
            }
          }
          else if (op === 'getDescriptiveActions') {
            const q=window.lastDescriptive?.question;
            if (window.lastDescriptive?.status !== 'descriptiveReveal' ||
                m.params.arguments.questionId !== q?.questionId)
              reply({ structuredContent:{ error:'DESCRIPTIVE_ACTIONS_STALE' } });
            else reply({ structuredContent:{ status:'descriptiveActions', sessionId:'test-session',
              question:{ questionId:q.questionId,year:q.year,section:q.section,
                number:q.number,shownAt:q.shownAt } } });
          }
          else if (op === 'endStudy') reply({ structuredContent: { log: '試験用の終了ログ', handoff: '引継ぎID：test-id\n省略しない全文', display: '終了' } });
          else if (op === 'redisplayQuestion') reply({ structuredContent: nextQuestion });
          else if (op === 'explainSpec') reply({ structuredContent: {
            status: 'explanationContext', explanationRef: 'E-abcdefghABCDEFGH', sessionId: 'test-session', question: question.question,
            grade: { questionId: question.question.questionId, correct: true, selected: '3', correctAnswer: '3' }
          } });
          else if (op === 'restoreStudyView') reply({ structuredContent: window.restorePayload || window.lastDescriptive || nextQuestion });
           else if (op === 'getOfficialLibrary') reply({ _meta: { qlp: window.privateLibrary || {
             status: 'officialLibrary', sessionId: 'test-session', sharedLibrary: window.sharedLibrary,
           } } });
           else if (op === 'confirmUploadRights') reply({ structuredContent: {
             status: 'uploadPermissionConfirmed', sessionId: 'test-session', year: m.params.arguments.year,
           } });
          else if (op === 'completeRemediation') {
            const answer = m.params.arguments.selected;
            reply({ structuredContent: answer === '2'
              ? { status: 'remediation_complete', sessionId: 'test-session', notice: '正解。実践問題へ戻れます。' }
              : { status: 'remediation_retry', sessionId: 'test-session', correctAnswer: '2', notice: '不正解。再確認してください。' } });
          }
          else window.protocolErrors.push('unexpected tool ' + op);
        } else if (m.method === 'ui/update-model-context') {
          window.internal.push(m.params);
          reply({});
        } else if (m.method === 'ui/message') {
          if (window.rejectMessage) {
            iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unavailable' } }, '*');
            return;
          }
          window.followups.push(m.params.content[0].text);
          window.fullMessages.push(m.params.content);
          reply({});
        }
      });
      window.descriptiveCounter = 0;
      iframe.srcdoc = html.replace('<script>', '<script>window.openai={toolOutput:{status:"needPlan"},displayMode:"inline",notifyIntrinsicHeight(h){if(window.frameElement)window.frameElement.style.height=Math.ceil(h)+"px";}};<\/script><script>');
      document.body.appendChild(iframe);
    }, { html: widgetHtml(), first: result(onboarding), question, nextQuestion });
    const ui = page.frameLocator('iframe');
    await ui.getByRole('button', { name: '2 免除を利用しない' }).waitFor();
    // ラベルなしの注意行は狭い2列グリッドに入れず、横幅をすべて使う。
    await ui.locator('#app').evaluate(el=>{
      const note=document.createElement('div'); note.className='ov-r full';
      note.innerHTML='<span class="ov-v">ここは試験概要の全文表示テストです。'.repeat(8)+'</span>';
      el.querySelector('.ov-b')?.appendChild(note);
    });
    assert.equal(await ui.locator('.ov-r.full').last().evaluate(el=>getComputedStyle(el).display),'block');
    assert.ok(await ui.locator('.ov-r.full').last().evaluate(el=>el.querySelector('.ov-v').getBoundingClientRect().width > 220),
      '概要のラベルなし行を細い列へ押し込まない');
    // 新規資格の導入画面を、起動直後に旧セッションのrestoreIdleで上書きしない。
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.params?.name === 'restoreStudyView').length), 0,
      '新規の資格／初回学習では自動復元APIを呼ばない');
    assert.equal(await ui.getByRole('button', { name: '2 免除を利用しない' }).count(), 1,
      '初回用の免除・学習状況確認画面を維持する');
    await ui.getByRole('button', { name: '2 免除を利用しない' }).click();
    assert.equal(await ui.locator('input[type=radio]').count(),0,'学習状況はラジオではなく番号ボタン');
    assert.equal(await ui.locator('.choices button').count(),4,'学習状況は固定4択');
    await ui.getByRole('button', { name: '4 過去問演習中' }).click();
    // 押下結果が同じ位置に可視表示され、直後の二度押しも旧画面では無視される。
    await ui.locator('#stageAck').waitFor();
    assert.match(await ui.locator('#stageAck').innerText(), /もう一度押す必要はありません/);
    assert.equal(await ui.getByRole('button', { name: '4 過去問演習中' }).isDisabled(), true);
    await ui.locator('[data-n="4"]').evaluate(b => b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    await ui.getByRole('button', { name: /この学習計画で始める/ }).waitFor();
    assert.equal(await ui.getByRole('button', { name: /学習計画を見直す/ }).count(),1);
    assert.equal(await ui.getByRole('button', { name: /初期診断で苦手分野を調べる/ }).count(),1);
    assert.equal(await ui.getByRole('button', { name: '4 今は学習しない' }).count(),1);
    assert.equal(await ui.getByRole('button', { name: /承認して始める|手直しする/ }).count(),0,
      'AIの旧学習計画選択肢を混ぜない');
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
    // 長文は内部の縦スクロールで隠さず、ホストへ自然な高さを通知して全文を表示。
    const longQuestionHeight = await ui.locator('#app').evaluate(el => {
      const filler = document.createElement('div');
      filler.textContent = '長文問題の画面位置テスト '.repeat(180);
      el.insertBefore(filler, el.querySelector('.choices'));
      return { clientHeight:el.clientHeight, scrollHeight:el.scrollHeight,
        overflowY:getComputedStyle(el).overflowY,
        documentHeight:el.ownerDocument.documentElement.scrollHeight };
    });
    assert.equal(longQuestionHeight.overflowY, 'visible', '長文でもアプリ要素自体は縦スクロールしない');
    assert.ok(Math.abs(longQuestionHeight.clientHeight-longQuestionHeight.scrollHeight)<4,'長い問題も全文を表示');
    await page.waitForFunction(() => {
      const iframe=document.querySelector('iframe');
      const app=iframe?.contentDocument?.querySelector('#app');
      return !!app && iframe.getBoundingClientRect().height >= app.scrollHeight-5;
    }, null, {timeout:5000});
    await ui.locator('input[name=ans][value="3"]').check();
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length), 0);
    await ui.getByRole('button', { name: '解答する' }).click();
    await ui.locator('#exp').waitFor();
    await ui.locator('.latest').waitFor();
    assert.equal(await ui.locator('.latest').count(), 1, '採点画面の最新マーカーを重複させない');
    assert.equal(await ui.locator('.latest').evaluate(el => el.ownerDocument.activeElement === el), true,
      '採点後に「ここが最新の表示です」へフォーカスする');
    const gradedLayout=await ui.locator('#app').evaluate(el=>({
      height:el.clientHeight,scrollHeight:el.scrollHeight,overflowY:getComputedStyle(el).overflowY,scrollTop:el.scrollTop
    }));
    assert.equal(gradedLayout.overflowY,'visible','採点・解説画面も内部縦スクロールしない');
    assert.ok(Math.abs(gradedLayout.scrollHeight-gradedLayout.height)<4);
    assert.equal(gradedLayout.scrollTop,0);
    assert.ok(gradedLayout.height < longQuestionHeight.clientHeight,'採点後は古い長い問題が消え、枠高も縮む');
    assert.match(await ui.locator('#app').innerText(), /正解です。/);
    assert.match(await ui.locator('.official-answer-summary').innerText(), /公式正答・簡易解説/);
    assert.match(await ui.locator('.official-answer-summary').innerText(), /各選択肢と正答の位置/);
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'explainSpec').length), 0,
      '回答時にAI解説取得を起動しない');
    const answer = await page.evaluate(() => window.calls.find(m => m.params?.name === 'submitAnswer').params.arguments);
    assert.deepEqual(answer, { sessionId, questionId: question.question.questionId, value: '3', confidence: 'sure' });
    await ui.getByRole('button', { name: '2 AIの詳しい解説を追加' }).click();
    await ui.locator('.official-answer-summary').waitFor();
    await page.waitForFunction(() => window.followups.length === 1);
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'explainSpec').length), 1, '解説は採点記録を読み出す');
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length), 1, '解説で再採点しない');
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'nextQuestion').length), 3, '解説の再表示で次問へ進めない');
    assert.deepEqual(await page.evaluate(() => window.followups),
      ['2025年度 問1の各選択肢の判断根拠を、公式資料に基づいて解説してください。（照合番号：E-abcdefghABCDEFGH）'],
      '会話には照合番号と解説依頼だけを送る');
    assert.deepEqual(await page.evaluate(() => window.internal), [], '不安定な遅延モデル文脈更新に依存しない');
    const full = await page.evaluate(() => window.fullMessages[0]);
    assert.equal(full.length,1,'内部資料のJSONやPNGはiPhoneの会話に送らない');
    assert.equal(full[0].type,'text');
    assert.equal(full[0].text, '2025年度 問1の各選択肢の判断根拠を、公式資料に基づいて解説してください。（照合番号：E-abcdefghABCDEFGH）');
    assert.doesNotMatch(full[0].text,/verifiedOfficialExplanation|MCP app context|correctAnswer|\\?stem/);
    assert.equal(full[0].annotations,undefined,'非表示指定が無視されても原本データが露出しない');
    assert.equal(await ui.getByRole('button', { name: '公式正答を再表示' }).count(), 0, '表示済み正答の再表示ボタンは不要');
    assert.equal(await ui.getByRole('button', { name: 'AI解説を再依頼' }).count(), 0, '解説成功後の重複依頼ボタンは不要');
    assert.equal(await page.evaluate(() => window.followups.length), 1, 'AI解説は一度だけ送信する');
    assert.equal(await ui.getByRole('button', { name: '今日はここまで（学習を終了）' }).count(), 1, '解説後も終了操作を残す');
    await page.evaluate(r => window.deliver(r), result({ status: 'menu', menu: {
      kind:'next', prompt:'次はどうしますか？',
      body:'## 2025年度 問1のAI解説\n\n1. 最初の選択肢の根拠を確認\n2. 次の選択肢と比べる',
      choices:['次の問題へ','今日はここまで（学習を終了）'],
      actions:['next','end'], studyId:'test-study', sessionId,
    } }));
    await ui.getByRole('heading', {name:'2025年度 問1のAI解説'}).waitFor();
    const explained=ui.locator('.md');
    assert.equal(await explained.count(),1,'AI解説本文をボタンと同じ学習画面に描画する');
    const actions=ui.locator('.choices');
    assert.ok(await explained.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('.choices')) & Node.DOCUMENT_POSITION_FOLLOWING)),
      'AI解説がボタンより上にある');
    assert.equal(await actions.locator('button').count(),2,'次問と終了の2ボタンを表示');
    assert.equal(await ui.getByRole('button', {name:'解説を見る'}).count(),0,'解説済みなのに再解説ボタンを表示しない');
    await ui.getByRole('button', { name: '2 今日はここまで（学習を終了）' }).click();
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
    await page.evaluate(r => window.deliver(r), result({ ...question, question: { ...question.question, figureUrls: ['https://qlp.test/figure.png'] } }));
    await ui.getByRole('button', { name: '公式の問題の図1を拡大' }).click();
    await ui.getByRole('dialog', { name: '公式の問題の図1を拡大' }).waitFor();
    assert.ok(await ui.locator('.fig-scroll img').evaluate(x => x.getBoundingClientRect().width > 375), '図を画面幅より大きくできる');
    await ui.getByRole('button', { name: '拡大', exact: true }).click();
    assert.ok(await ui.locator('.fig-scroll img').evaluate(x => x.getBoundingClientRect().width > 750), 'さらに拡大できる');
    await ui.getByRole('button', { name: '閉じる' }).click();
    const beforeSkip = await page.evaluate(() => window.calls.filter(x => x.params?.name === 'submitAnswer').length);
    const beforeSkipNext = await page.evaluate(() => window.calls.filter(x => x.params?.name === 'nextQuestion').length);
    // 採点結果の返答だけが失われ、サーバーはすでに次問へ進んだ状態を再現。
    await page.evaluate(() => { window.dropSkipResponseOnce = true; });
    await ui.getByRole('button', { name: 'スキップ', exact: true }).click();
    await ui.getByRole('heading', { name: '2025年度 問2' }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.filter(x => x.params?.name === 'submitAnswer').length), beforeSkip + 1);
    assert.equal(await page.evaluate(() => window.calls.filter(x => x.params?.name === 'nextQuestion').length), beforeSkipNext + 1, '応答喪失時は保存済みの次問を確認して復旧');
    assert.equal(await ui.getByRole('button', { name: '次の問題へ' }).count(), 0, 'スキップ後に余分なボタンを挟まない');
    // 別画面に移り古い枠が無効化されても、サーバーの同じ採点結果へ戻して終了できる。
    const answersBeforeRestore = await page.evaluate(() => window.calls.filter(x => x.params?.name === 'submitAnswer').length);
    const nextBeforeRestore = await page.evaluate(() => window.calls.filter(x => x.params?.name === 'nextQuestion').length);
    await page.evaluate(({ question, nextQuestion, sessionId }) => {
      window.restorePayload = { status: 'restoredGrade', sessionId, studyId: 'test-study',
        question: question.question, next: nextQuestion,
        grade: { correct: true, selected: '3', correctAnswer: '3' }, at: Date.now() + 12000 };
      window.deliver({ ...nextQuestion, at: Date.now() - 5000 });
    }, { question, nextQuestion, sessionId });
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe');
      return frame && Number(frame.contentWindow.localStorage.getItem('qlp_at')) > 0;
    });
    await ui.locator('#app').evaluate(() => {
      const bc = new BroadcastChannel('qlp-widget');
      bc.postMessage({ at: Date.now() + 1000 });
      bc.close();
    });
    await ui.getByRole('button', { name: 'ここで現在の学習を開く' }).waitFor();
    assert.equal(await ui.locator('.old-screen').count(),1,'旧表示はコンパクトな1行へ移行');
    assert.equal(await ui.locator('.stem').count(),0,'以前の問題文・選択肢・解説をDOMから除去');
    assert.equal(await ui.locator('.study-progress').count(),0,'前の進捗バーも残さない');
    assert.ok(await ui.locator('#app').evaluate(el => el.getBoundingClientRect().height < 95),
      '長い過去問の画面をiPhoneでも高さ95px未満に縮める');
    await ui.getByRole('button', { name: 'ここで現在の学習を開く' }).click();
    await ui.getByRole('button', { name: '2 AIの詳しい解説を追加' }).waitFor();
    assert.equal(await ui.getByRole('button', { name: '今日はここまで（学習を終了）' }).count(), 1);
    assert.equal(await page.evaluate(() => window.calls.filter(x => x.params?.name === 'restoreStudyView').length), 1);
    assert.equal(await page.evaluate(() => window.calls.filter(x => x.params?.name === 'submitAnswer').length), answersBeforeRestore, '復元で再採点しない');
    assert.equal(await page.evaluate(() => window.calls.filter(x => x.params?.name === 'nextQuestion').length), nextBeforeRestore, '復元で次問を出さない');
    await ui.getByRole('button', { name: '今日はここまで（学習を終了）' }).click();
    assert.equal(await ui.locator('#ho').inputValue(), '引継ぎID：test-id\n省略しない全文', '復元後でも学習終了できる');
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
    const library = { supportedYears: [2025, 2024], stored: [],
      missing: [
        { year: 2025, section: '午前の部' }, { year: 2025, section: '午後の部' },
        { year: 2024, section: '午前の部' }, { year: 2024, section: '午後の部' },
      ], totalQuestions: 0, completeYears: [] };
    await page.evaluate(({ library, sessionId }) => {
      window.sharedLibrary = library;
      window.deliver({ _meta: { qlp: { status:'sourceUnavailable', sessionId, fieldName:'午後の部',
        sourceAttachmentSupported:true, sharedLibrary:library, notice:'未保存の公式問題を確認しています。' } } });
    }, { library, sessionId });
    await ui.getByRole('button', { name: /公式問題・正答PDFを登録する/ }).waitFor();
    assert.match(await ui.locator('#app').innerText(), /2025年度/);
    assert.match(await ui.locator('#app').innerText(), /利用できる公式過去問の年度を確認できませんでした/);
    assert.doesNotMatch(await ui.locator('#app').innerText(), /共有保存|共有利用|URL台帳|別リポジトリ/);
    assert.equal(await ui.locator('.choices button').count(),2,'PDF登録とAI確認問題のみを主な選択肢にする');
    const previousMessageCount = await page.evaluate(() => window.followups.length);
    const priorAttachCount = await page.evaluate(() => window.calls.filter(m => m.params?.name === 'attachPdf').length);
    await ui.getByRole('button', { name: /公式問題・正答PDFを登録する/ }).click();
    assert.match(await ui.locator('#app').innerText(), /添付するまで登録は始まりません/);
    assert.equal(await page.evaluate(() => window.followups.length), previousMessageCount,
      '添付がないボタンで新しい会話を送らない');
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'attachPdf').length), priorAttachCount,
      '空のPDFの取り込みを始めない');
    await ui.getByRole('button', { name: /過去問をもう一度確認する/ }).click();
    await page.waitForFunction(() => window.calls.some(m => m.params?.name === 'getOfficialLibrary'));
    assert.equal(await page.evaluate(() => window.followups.length), previousMessageCount,
      '保存済み年度の照会も利用者チャットに内部内容を送信しない');
    // 著作物使用許諾が必要な賃管：年度別チェックでのみ取込可。確認だけではPDFを送らない。
    await page.evaluate(r => window.deliver(r), result({
      status: 'sourceUnavailable', sessionId, permissionedUpload: true,
      qualificationName: '賃貸不動産経営管理士', officialUrl: 'https://www.chintaikanrishi.jp/exam/past/',
      availableUploadYears: [2015, 2016, 2017, 2023, 2025],
      validatedUploadYears: [2015, 2016, 2023, 2025], personalUploadedYears: [],
    }));
    await ui.getByRole('heading', { name: '過去問の年度別取り込み（本人専用）' }).waitFor();
    assert.match(await ui.locator('#app').innerText(), /2017年度：原本検証待ち/);
    await ui.locator('#licensedYear').selectOption('2023');
    const confirm = ui.getByRole('button', { name: 'この年度の取込を許可して添付へ進む' });
    assert.equal(await confirm.isDisabled(), true, '利用許諾が未確認ならボタンは無効');
    const beforePermission = await page.evaluate(() => window.calls.filter(m => m.params?.name === 'confirmUploadRights').length);
    const beforePdf = await page.evaluate(() => window.calls.filter(m => m.params?.name === 'attachPdf').length);
    await ui.locator('#licensedAck').check();
    await confirm.click();
    await ui.getByText('2023年度の確認を受け付けました。', { exact: false }).waitFor();
    const confirmed = await page.evaluate(() => window.calls.filter(m => m.params?.name === 'confirmUploadRights').map(m => m.params.arguments));
    assert.equal(confirmed.length, beforePermission + 1);
    assert.deepEqual(confirmed.at(-1), { sessionId, year: 2023, confirmed: true });
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'attachPdf').length), beforePdf,
      '年度確認だけではPDFの取り込みを始めない');
    await page.evaluate(() => {
      window.privateLibrary = {
        status: 'officialLibrary', permissionedUpload: true, sessionId: 'test-session',
        qualificationName: '賃貸不動産経営管理士', officialUrl: 'https://www.chintaikanrishi.jp/exam/past/',
        availableUploadYears: [2015, 2016, 2017, 2023, 2025],
        validatedUploadYears: [2015, 2016, 2023, 2025], personalUploadedYears: [2023],
      };
    });
    await ui.getByRole('button', { name: '別年度の過去問を取り込む' }).click();
    await ui.getByRole('heading', { name: '過去問の年度別取り込み（本人専用）' }).waitFor();
    assert.match(await ui.locator('#app').innerText(), /2023年度：本人用に取込済み/);
    // 2026-10-23 iPhone: startSession資格名判定失敗を「問題準備中」と偽装せず再開できる。
    await page.evaluate(() => window.deliver({ isError: true,
      structuredContent: { error: 'QUALIFICATION_NOT_SUPPORTED' } }));
    await ui.locator('#retryQualification').waitFor();
    assert.match(await ui.locator('#app').innerText(), /資格名を認識できませんでした/);
    assert.doesNotMatch(await ui.locator('#app').innerText(), /問題を準備しています/);
    assert.equal(await ui.getByRole('button', { name: '総復習（間違えた問題）' }).count(), 0);
    await ui.locator('#retryQualification').fill('宅建');
    await ui.getByRole('button', { name: 'この資格で開始する' }).click();
    await ui.getByRole('button', { name: '2 免除を利用しない' }).waitFor();
    const restarts = await page.evaluate(() => window.calls.filter(x => x.params?.name === 'startSession').map(x => x.params.arguments));
    assert.equal(restarts.at(-1).qualificationId, '宅建');
    assert.deepEqual(restarts.at(-1).sources, []);

    // 未対応状態を正当な待機・終了と混同せず、出題画面へ復旧する。
    await page.evaluate(() => window.deliver({ structuredContent: {
      status: 'unhandled', sessionId: 'test-session-startup-recovered', display: 'incomplete view',
    } }));
    await ui.getByRole('button', { name: '現在の学習画面を再取得する' }).waitFor();
    assert.doesNotMatch(await ui.locator('#app').innerText(), /問題を準備しています/);
    await page.evaluate(() => { window.failNextCalls = 0; });
    await ui.getByRole('button', { name: '現在の学習画面を再取得する' }).click();
    await ui.locator('input[name=ans][value="3"]').waitFor();

    // 引継ぎIDからの再開では初期の試験概要や免除・学習状況を出さない。
    await page.evaluate(() => {
      window.failNextCalls = 0;
      window.recoverSkipped = true;
      window.deliver({ structuredContent: {
        status: 'resumeReady', learnerId: 'testlearner', sessionId: 'test-session',
        qualificationName: '宅地建物取引士（宅建）', answeredCount: 4, wrongCount: 2,
        pendingQuestion: null,
      } });
    });
    await ui.getByRole('heading', { name: '宅地建物取引士（宅建）｜続きから再開' }).waitFor();
    assert.equal(await ui.getByText('■試験概要').count(), 0, '再開時は試験概要を表示しない');
    assert.equal(await ui.getByText('免除制度を利用しますか？').count(), 0, '免除の再質問をしない');
    assert.match(await ui.locator('#app').innerText(), /回答済み：4問.*要復習：2問/);
    const beforeResume = await page.evaluate(() => window.calls.length);
    await ui.getByRole('button', { name: '学習を再開する' }).click();
    await ui.getByText('試験用の問題文').waitFor();
    const resumeCalls = await page.evaluate(i => window.calls.slice(i).filter(m => m.method === 'tools/call').map(m => ({ name: m.params.name, args: m.params.arguments })), beforeResume);
    assert.equal(resumeCalls.filter(x => x.name === 'startStudy').length, 1, '学習時間の開始は利用者の明示操作で1回だけ');
    assert.equal(resumeCalls.filter(x => x.name === 'nextQuestion').length, 1, '次問をエンジンが1回だけ選択');
    assert.equal(resumeCalls.filter(x => x.name === 'startSession').length, 0, '初回の学習セッションを作り直さない');
    assert.equal(resumeCalls.find(x => x.name === 'startStudy').args.learnerId, 'testlearner');

    // iPhone回帰：基礎解説をChatGPT通常本文に書かず、解説と遷移ボタンを同じ枠に表示する。
    const longLesson = '## 必修問題｜基礎解説\n\n**患者安全**を理解しましょう。\n\n' +
      '| 項目 | 考え方 |\n|---|---|\n| 観察 | 客観的な情報を確認 |\n\n' +
      Array.from({length: 26}, (_, i) => '- 重要な学習項目 ' + (i + 1)).join('\n');
    await page.evaluate(r => window.deliver(r), result({status:'menu', sessionId,
      menu:{kind:'lesson', sessionId, studyId:'test-study', learnerId:'testlearner',
        fieldName:'必修問題', body:longLesson,
        prompt:'解説の次は、この分野の確認問題（全3問）へ進みます。',
        choices:['確認問題へ進む','今日はここまで（学習を終了）'],
        actions:['check','end']}}));
    await ui.getByRole('heading',{name:'必修問題｜基礎解説'}).waitFor();
    assert.equal(await ui.locator('.md table').count(),1,'Markdown表を学習枠内に表示');
    assert.equal(await ui.getByRole('button',{name:'確認問題へ進む'}).count(),1);
    const prevFollowups = await page.evaluate(() => window.followups.length);
    const lessonSize=await ui.locator('#app').evaluate(el=>({
      height:el.clientHeight,scrollHeight:el.scrollHeight,scrollTop:el.scrollTop,overflowY:getComputedStyle(el).overflowY
    }));
    assert.equal(lessonSize.overflowY,'visible','長い基礎解説も枠内ではスクロールさせない');
    assert.ok(lessonSize.height > 500,'基礎解説とボタンの全文が長い自然高で表示される');
    assert.ok(Math.abs(lessonSize.height-lessonSize.scrollHeight)<4,'解説本文を切り詰めない');
    await page.waitForFunction(() => {
      const iframe=document.querySelector('iframe');
      const app=iframe?.contentDocument?.querySelector('#app');
      return !!app && iframe.getBoundingClientRect().height >= app.scrollHeight-5;
    },null,{timeout:5000});
    await page.evaluate(r=>window.deliver(r),result({status:'menu',sessionId,
      menu:{kind:'lesson',sessionId,studyId:'test-study',learnerId:'testlearner',
        fieldName:'必修問題',body:longLesson,prompt:'解説の次は、この分野の確認問題（全3問）へ進みます。',
        choices:['確認問題へ進む','今日はここまで（学習を終了）'],actions:['check','end']}}));
    assert.equal(await ui.locator('#app').evaluate(el=>el.scrollTop),0,'解説の再表示でも内側のスクロールは発生しない');
    assert.equal(await ui.locator('.latest').count(),1);
    await ui.getByRole('button',{name:'確認問題へ進む'}).click();
    await ui.getByRole('heading',{name:'この分野の確認問題へ'}).waitFor();
    assert.equal(await ui.locator('.md').count(),0,'確認問題への遷移後は前の基礎解説を消す');
    assert.equal(await ui.getByRole('button',{name:'確認問題へ進む'}).count(),0,'旧ボタンを残さない');
    await page.waitForFunction(n => window.followups.length > n, prevFollowups);
    assert.equal((await page.evaluate(() => window.followups)).at(-1),'必修問題の確認問題・第1問へ進む');
    // 一度の押下で第1問の登録依頼だけを送信する。
    assert.equal(await page.evaluate(n => window.followups.length-n,prevFollowups),1);

    // 土地家屋調査士の記述式は午前11/午後21/22を画像・本文で表示し、採点しない。
    await page.evaluate(() => window.deliver({ structuredContent: {
      status: 'question', sessionId: 'test-session', question: {
        questionId: 'land_surveyor:2025:午後の部:20', year: 2025,
        section: '午後の部', questionNumber: 20, stem: '択一式の本文',
        choices: ['一', '二', '三', '四', '五'], fieldName: '不動産登記',
      }
    } }));
    await ui.getByRole('button', { name: '記述式（午前11・午後21/22）を開く' }).waitFor();
    await ui.getByRole('button', { name: '記述式（午前11・午後21/22）を開く' }).click();
    await ui.getByRole('button', { name: '午後の部・問21（土地）' }).click();
    await ui.getByRole('heading', { name: '2025年度 午後の部 問21' }).waitFor();
    assert.equal(await ui.locator('#descriptiveSource[open]').count(), 1, '最初は原本ページを表示する');
    assert.equal(await ui.locator('#descriptiveSource .question-table').count(), 1, '表はHTML表で表示');
    assert.equal(await ui.locator('#descriptiveSource .fig-open').count(), 1, '図だけが拡大対象');
    assert.equal(await ui.locator('#descriptiveSource .descriptive-page').count(), 0, 'PDFのページ全体は画像として表示しない');
    await ui.locator('#descriptiveSource .fig-open').click();
    assert.equal(await ui.locator('.fig-overlay').count(), 1, '図をタップすると拡大');
    await ui.getByRole('button', { name: '閉じる' }).click();
    assert.doesNotMatch(await ui.locator('#app').innerText(), /器械点  視準点|見取図\s+A\s+B/, '表や図をPDFテキスト層から偽の文章にしない');
    assert.equal(await ui.locator('input[name=ans]').count(), 0, '記述式には択一式の回答ラジオボタンを出さない');
    const beforeDescriptiveGrade = await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length);
    await ui.getByRole('button', { name: '解答・解説を表示（AI参考解答）' }).click();
    await ui.getByText('元の問題を繰り返さず、AI参考解説', { exact: false }).waitFor();
    assert.equal(await ui.locator('#descriptiveSource').count(), 0, '解説前の問題・表・図をDOMへ再出力しない');
    assert.match(await ui.locator('#app').innerText(), /表示されない場合は解説末尾の番号選択肢/,'実際にUIが未表示でも誤案内しない');
    assert.equal(await ui.getByRole('button', { name: '解答・解説を表示（AI参考解答）' }).count(), 0);
    assert.equal(await ui.getByRole('button', { name: '次の記述式へ' }).count(), 0, '解説前の画面に旧ナビゲーションを残さない');
    assert.match(await ui.locator('#app').innerText(), /上に戻って.*ボタンを押して/,'戻る場合の注釈');
    const descCalls = await page.evaluate(() => window.calls.filter(m => m.params?.name === 'revealDescriptiveAnswer').length);
    assert.ok(descCalls >= 1);
    assert.equal(await page.evaluate(() => window.calls.filter(m => m.params?.name === 'submitAnswer').length), beforeDescriptiveGrade,
      '解答ボタンで自動採点しない');
    assert.match((await page.evaluate(() => window.followups)).at(-1), /三角関数と複素数の両方/);

    // AI参考解説と操作ボタンを同じ学習画面内で連続表示。
    await page.evaluate(() => {
      const q = window.lastDescriptive.question;
      window.deliver({ structuredContent: { status:'descriptiveActions', sessionId:'test-session',
        explanationMarkdown: '## 問21の解説\n\n**点A**から求めます。\n\nS=Abs(Imag(A*Conjg(B)))/2\n\n<script>alert(1)</script>',
        question: { questionId:q.questionId, year:q.year,section:q.section,
          number:q.number,shownAt:q.shownAt } } });
    });
    await ui.getByRole('heading', { name:/AI参考解答・解説/ }).waitFor();
    assert.equal(await ui.locator('.descriptive-explanation strong').innerText(),'点A','解説のMarkdownを表示');
    assert.equal(await ui.locator('.descriptive-explanation script').count(),0,'解説に含まれたHTMLを実行しない');
    assert.match(await ui.locator('.descriptive-explanation').innerText(),/<script>alert\(1\)<\/script>/,'HTMLはテキストとして残す');
    assert.ok(await ui.locator('.descriptive-explanation').evaluate(x=>x.compareDocumentPosition(document.querySelector('.descriptive-actions')) & Node.DOCUMENT_POSITION_FOLLOWING),
      '解説の直後に操作ボタンが配置される');
    assert.equal(await ui.locator('#descriptiveSource').count(),0,'操作パネルには原本を再掲しない');
    assert.equal(await ui.getByRole('button', { name:'次の記述式へ' }).count(),1);
    await ui.getByRole('button', { name: '次の記述式へ' }).click();
    await ui.getByRole('heading', { name: '2025年度 午後の部 問22' }).waitFor();
    assert.equal(await ui.locator('.descriptive-explanation').count(),0,'次問へ移ると前の解説とボタンが消える');
    assert.equal(await ui.locator('.descriptive-actions').count(),0,'前の問の操作ボタンを残さない');
    // 別の問を選び直す経路も保つ。
    await ui.getByRole('button', { name: '年度・問題を選び直す' }).click();
    await ui.getByRole('heading', { name: '土地家屋調査士｜記述式問題' }).waitFor();
    await ui.getByRole('button', { name: '午後の部・問21（土地）' }).click();
    await ui.getByRole('heading', { name: '2025年度 午後の部 問21' }).waitFor();
    await ui.getByRole('button', { name: '解答・解説を表示（AI参考解答）' }).click();
    await ui.getByText('元の問題を繰り返さず、AI参考解説', { exact: false }).waitFor();
    await ui.getByRole('button', { name: '解説後の操作パネルを開く（上に戻った場合）' }).click();
    await ui.getByRole('heading', { name:/解説後の操作/ }).waitFor({ timeout: 4000 }).catch(async e => {
      const debug = { view: await ui.locator('#app').innerText(), calls: await page.evaluate(() => window.calls.filter(m => m.params?.name).slice(-8).map(m => ({name:m.params.name,args:m.params.arguments}))), errors: await page.evaluate(() => window.protocolErrors) };
      throw new Error('DESCRIPTIVE_FALLBACK_VIEW: '+JSON.stringify(debug)+' | '+e.message);
    });
    await ui.getByRole('button', { name: '年度・問題を選び直す' }).click();
    await ui.getByRole('heading', { name: '土地家屋調査士｜記述式問題' }).waitFor();
    await ui.getByRole('button', { name: '午後の部・問21（土地）' }).click();
    await ui.getByRole('heading', { name: '2025年度 午後の部 問21' }).waitFor();
    await ui.getByRole('button', { name: '次の記述式へ' }).click();
    await ui.getByRole('heading', { name: '2025年度 午後の部 問22' }).waitFor();
    assert.equal(await ui.locator('input[name=ans]').count(), 0);

    // 明示された問6が別分野でも、解説/確認/実践を選ぶ画面に差し替えず直接表示する。
    const namedQ6 = { status:'question', sessionId,
      explicitQuestion:true, fieldChanged:true,
      fieldNotice:'分野が変わります：測量に関する法規 → 多角測量',
      question:{ questionId:'surveyor:2026:main:6', year:2026, section:'main',
        questionNumber:6, kind:'new', fieldName:'多角測量',
        stem:'問6の公式問題本文（テスト用）',
        choices:['公式選択肢1','公式選択肢2','公式選択肢3','公式選択肢4','公式選択肢5'],
        figures:[] },
    };
    await page.evaluate(r=>window.deliver(r), result(namedQ6));
    await ui.getByRole('heading',{name:'2026年度 問6'}).waitFor();
    assert.equal(await ui.locator('input[name=ans]').count(),5,'直接指定した問6の全選択肢を表示');
    assert.match(await ui.locator('.stem').innerText(),/問6の公式問題本文/);
    assert.equal(await ui.getByRole('button',{name:/解説あり（解説→確認問題→実践問題）/}).count(),0,
      '指定問なのに別分野の学習方法を聞き直さない');
    assert.equal(await ui.getByRole('button',{name:/実践問題から/}).count(),0);
    assert.equal(await ui.getByRole('button',{name:'解答する'}).count(),0,'回答選択前は採点しない');
    await ui.locator('input[name=ans][value="5"]').check();
    await ui.getByRole('button',{name:'解答する'}).waitFor();

    // 通常の自動選題で本当に分野移行するときは従来のメニューを残す。
    await page.evaluate(r=>window.deliver(r),result({...namedQ6,explicitQuestion:false}));
    await ui.getByRole('button',{name:/実践問題から/}).waitFor();
    assert.equal(await ui.getByRole('heading',{name:'2026年度 問6'}).count(),0,
      '通常の分野移行だけは従来どおり開始方法を選べる');

    // 回帰：iOSでMCPブリッジが先にreadyとなり、最初のtoolOutputが後着する順序。
    // 旧実装は !bridgeReady により set_globals 通知を無視し、初回問題が空白になった。
    await page.evaluate(({ html, question }) => {
      const late = document.createElement('iframe');
      late.id = 'lateFirstOutput'; late.style.cssText = 'width:100%;height:400px;border:0';
      window.addEventListener('message', e => {
        if (e.source !== late.contentWindow) return;
        const m = e.data;
        if (!m || m.jsonrpc !== '2.0' || !m.id) return;
        if (m.method === 'ui/initialize') {
          late.contentWindow.postMessage({ jsonrpc:'2.0', id:m.id, result:{ protocolVersion:'2026-01-26', hostCapabilities:{} } }, '*');
        } else if (m.method === 'tools/call') {
          late.contentWindow.postMessage({ jsonrpc:'2.0', id:m.id, result:{ structuredContent:{ status:'recorded' } } }, '*');
        } else {
          late.contentWindow.postMessage({ jsonrpc:'2.0', id:m.id, result:{} }, '*');
        }
      });
      late.srcdoc = html.replace('<script>', '<script>window.openai={toolOutput:null};</script><script>');
      document.body.appendChild(late);
      window.lateQuestion = question;
    }, { html: widgetHtml(), question });
    const lateUi = page.frameLocator('#lateFirstOutput');
    await lateUi.locator('#recoverStudy').waitFor({ state:'hidden', timeout:4000 }).catch(() => {});
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const w = document.getElementById('lateFirstOutput').contentWindow;
      if (!w.openai) w.openai = {};
      w.openai.toolOutput = window.lateQuestion;
      w.dispatchEvent(new w.Event('openai:set_globals'));
    });
    await lateUi.getByText('試験用の問題文').waitFor({ timeout:5000 });
    assert.deepEqual(await page.evaluate(() => window.protocolErrors), []);
    assert.deepEqual(errors, []);
    console.log(`${name}: PASS onboarding, exact answer, retry, private model context, full handoff, locked AI confirmation (375px)`);
  } finally { await browser.close(); }
}
