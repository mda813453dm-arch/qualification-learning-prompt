// MCP UI compatibility layer until the large legacy widget module is split.
// Exact-match guards make source drift fail tests rather than silently omit fixes.
export const MANKAN_CONFIRMATION = {
  intro: [
    '総会・理事会・監事の役割を区別します。令和7年改正マンション標準管理規約（単棟型）に基づく入門教材です。',
    '理事長は通常総会で前会計年度の業務執行を報告します。',
    '会計担当理事は会計業務を行い、監事は業務の執行と財産の状況を監査します。',
  ],
  example: '会計担当理事が会計業務を行い、監事が業務の執行と財産の状況を監査するという役割分担を考えます。',
  pitfall: '標準管理規約は国土交通省のひな型です。各管理組合の実際の管理規約と同一ではありません。',
  sourceUrl: 'https://www.mlit.go.jp/jutakukentiku/house/mansionkiyaku.html',
  questions: [
    {
      question: '令和7年改正マンション標準管理規約（単棟型）において、監事の職務として適切なものはどれか。',
      choices: ['理事長に代わって管理規約を単独で改定すること。',
        '管理組合の業務の執行と財産の状況を監査し、結果を総会に報告すること。',
        '管理費の支出を他の役員の関与なく全て決定すること。'],
      correctAnswer: 2,
      explanation: '同標準管理規約第41条では、監事が業務執行と財産の状況を監査し総会に結果を報告すると定めています。会計担当理事とは役割が異なります。',
    },
    {
      question: '令和7年改正マンション標準管理規約（単棟型）で、管理費等の収納・保管・支出などの会計業務を担当するのは誰か。',
      choices: ['監事', '組合員でない第三者だけ', '会計担当理事'],
      correctAnswer: 3,
      explanation: '同標準管理規約第40条第3項では会計担当理事が管理費等の会計業務を行います。監事は財産状況を監査する役割です。',
    },
    {
      question: '令和7年改正マンション標準管理規約（単棟型）で、理事長が通常総会で報告しなければならない事項はどれか。',
      choices: ['前会計年度における管理組合の業務の執行に関する報告',
        '個々の組合員の私生活の調査結果', '監事による監査の無条件の省略'],
      correctAnswer: 1,
      explanation: '同標準管理規約第38条第3項は、理事長が通常総会で前会計年度の管理組合の業務執行を報告することを定めています。',
    },
  ],
};

function replaceOnce(source, needle, replacement, label) {
  const at = source.indexOf(needle);
  if (at < 0 || source.indexOf(needle, at + needle.length) >= 0)
    throw new Error('WIDGET_COMPAT_ANCHOR_CHANGED:' + label);
  return source.slice(0, at) + replacement + source.slice(at + needle.length);
}

export function confirmationWidgetHtml(originalHtml) {
  let html = String(originalHtml);
  const declaration = '  var preparedLessons = ';
  const at = html.indexOf(declaration);
  if (at < 0 || html.indexOf(declaration, at + declaration.length) >= 0)
    throw new Error('WIDGET_COMPAT_ANCHOR_CHANGED:preparedLessons');
  const end = html.indexOf(';\n', at + declaration.length);
  if (end < 0 || end - at < 100)
    throw new Error('WIDGET_COMPAT_ANCHOR_CHANGED:preparedLessonsEnd');
  html = html.slice(0, end + 2) +
    '  preparedLessons[' + JSON.stringify('管理組合の運営の円滑化') + '] = ' +
    JSON.stringify(MANKAN_CONFIRMATION) + ';\n' + html.slice(end + 2);

  // Both modes must leave a recoverable, same-frame waiting screen. Prepared
  // questions are immediately registered using the engine's verified answers.
  html = replaceOnce(html,
`      if (preparedLessons[field]) {
        render({status:'confirmation_pending',sessionId:chosen?.sessionId || learner,
          fieldName:field,position:1,total:3,journey:j,notice:'第1問をエンジンから直接表示します。'});
        return;
      }
      app.innerHTML = journeyBar(j.fieldIndex, j.fieldTotal, 'check1', field) +
        localBar('この分野の確認問題', 1, 3) +
        '<div class="notice"><b>' + esc(field) + '：確認問題から</b>進めます。確認問題は全3問です。</div>' +
        '<div class="row"><button id="retryCheckStart" type="button">確認問題の第1問を表示する</button></div>';
      scrollUp(true);
      document.getElementById('retryCheckStart').onclick = function(){
        this.disabled = true;
        ask(field + 'の確認問題・第1問へ進む').then(function(reply){
          var btn = document.getElementById('retryCheckStart');
          if (btn && btn.isConnected) btn.disabled = false;
        });
      };
      ask(field + 'を確認問題から始めます。');`,
`      render({status:'confirmation_pending',sessionId:chosen?.sessionId || learner,
        fieldName:field,position:1,total:3,journey:j,
        notice:preparedLessons[field] ? '第1問を同じ学習枠に表示します。' : '第1問の登録待ちです。'});
      if (!preparedLessons[field])
        ask(field + 'の確認問題・第1問を作成して学習画面に登録してください。');`,
    'itemMenu-check');

  html = replaceOnce(html,
`          if (preparedLessons[name]) {
            render({status:'confirmation_pending',sessionId:state.sessionId,fieldName:name,
              position:1,total:3,journey:chosen.journey});
          } else {
            app.innerHTML = journeyBar(chosen.journey && chosen.journey.fieldIndex, chosen.journey && chosen.journey.fieldTotal, 'check1', name) +
              localBar('この分野のAI作成確認問題', 1, 3) +
              '<div class="notice">AIが作成する問題です。公式過去問ではありません。</div>' + endBar();
            bindEnd();
            ask(name + 'を確認問題から始めます。');
          }`,
`          render({status:'confirmation_pending',sessionId:state.sessionId,fieldName:name,
            position:1,total:3,journey:chosen.journey});
          if (!preparedLessons[name])
            ask(name + 'の確認問題・第1問を作成して学習画面に登録してください。');`,
    'sourceAiCheck');

  // The model receives just the action label in ask(text, actionLabel),
  // so use one concise, complete user-visible instruction per registration.
  html = replaceOnce(html,
`          else await ask(data.fieldName + 'の確認問題第' + position + '問をregisterConfirmationQuestionに登録して画面に表示してください。',
            data.fieldName + 'の確認問題・第' + position + '問を作成して学習画面に登録する');`,
`          else await ask(data.fieldName + 'の確認問題・第' + position +
            '問を作成し、本文・選択肢・正答・簡易解説を学習画面に登録してください。');`,
    'confirmation-pending-retry');

  html = replaceOnce(html,
`        if (index >= checkDelays.length || checkPollId !== confirmationPollGeneration) return;`,
`        if (checkPollId !== confirmationPollGeneration) return;
        if (index >= checkDelays.length) {
          var stalled = document.getElementById('preparedCheckStatus');
          if (stalled) stalled.textContent = '確認問題は未登録です。問題を登録するボタンから再試行してください。';
          return;
        }`,
    'pending-timeout');

  // After each grading show exactly the next registered question or pending.
  html = replaceOnce(html,
`        ask(d.fieldName + 'の確認問題の次の1問を作成し、registerConfirmationQuestionに本文・選択肢・固定した正答を登録してください。画面に第' + nextPosition + '問/全3問が出るまで待ってください。',
          d.fieldName + 'の確認問題・第' + nextPosition + '問を作成して学習画面に登録する');`,
`        ask(d.fieldName + 'の確認問題・第' + nextPosition +
          '問を作成し、本文・選択肢・正答・簡易解説を学習画面に登録してください。');`,
    'confirmation-next');
  return html;
}
