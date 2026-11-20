// v204: Three-stage study explanation: optional pre-answer thinking guidance,
// program-graded correction after submission, and closed-book review on later days.
// No hint may expose a correct answer; v203 and earlier widget resources are immutable.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v203.js';
import { preAnswerHint } from './pre-answer-hint.js';
export const WIDGET_URI = 'ui://qlp/question-v204.html';
export const WIDGET_VERSION = '2026-11-20.204';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml(){
  const before = previousHtml();
  let html = before.replaceAll('2026-11-20.203', WIDGET_VERSION);
  if (html === before) throw new Error('V204_VERSION_MARKER_MISSING');
  function replaceOnce(anchor, target, code) {
    if (html.split(anchor).length !== 2) throw new Error(code);
    html = html.replace(anchor, target);
  }

  // The helper accesses field name and review metadata only, never a grade/key.
  const functionAnchor = '  function officialAnswerSummary(q, g){';
  replaceOnce(functionAnchor,
    '  ' + preAnswerHint.toString() + '\n' + functionAnchor,
    'V204_HINT_HELPER_ANCHOR_MISSING');

  const answerControls = '    h += \'<div class="row"><label><input type="checkbox" id="guess">';
  const hintMarkup = String.raw`
    // Keep the original problem text → figures → options ordering untouched.
    // Strategy is opt-in and always independent of answer/grade/history data.
    var beforeAnswerHint = preAnswerHint(q);
    h += (beforeAnswerHint.isReview
      ? '<div class="notice qlp-recall-notice" role="note"><b>復習・再想起：</b>正答や前の解説は回答するまで表示しません。思い出してから答えてください。</div>'
      : '') +
      '<div class="row qlp-hint-row"><button type="button" id="preAnswerHint" aria-controls="preAnswerHintBody" aria-expanded="false">ヒントを見る（任意・正答は非表示）</button></div>' +
      '<div id="preAnswerHintBody" class="notice qlp-hint-body" role="note" hidden><b>考え方のヒント（正誤の判定なし）</b><p>' +
      esc(beforeAnswerHint.text) + '</p></div>';
`;
  replaceOnce(answerControls, hintMarkup + answerControls, 'V204_QUESTION_CONTROLS_ANCHOR_MISSING');

  const bindAnchor = "    var descButton = document.getElementById('descriptiveMenuStart');";
  const bindHint = String.raw`
    var hintButton = document.getElementById('preAnswerHint');
    if (hintButton) hintButton.onclick = function(){
      // Hint never calls an AI tool or changes the official grading/history.
      if (locked || state.answered || !state.question ||
          state.question.questionId !== q.questionId) return;
      var panel = document.getElementById('preAnswerHintBody');
      if (!panel) return;
      panel.hidden = false;
      hintButton.setAttribute('aria-expanded','true');
      hintButton.textContent = 'ヒントを表示中（正答は非表示）';
      hintButton.disabled = true;
      fit();
    };
`;
  replaceOnce(bindAnchor, bindHint + bindAnchor, 'V204_HINT_BIND_ANCHOR_MISSING');

  const summary = "    return '<section class=\"stem official-answer-summary qlp-instant-feedback\" aria-label=\"採点直後の短い訂正\">' +";
  replaceOnce(summary, String.raw`
    var recallAfterSubmission = q.kind === 'review' || q.progress?.review === true
      ? '<p><b>再想起の答え合わせ：</b>解説を伏せて回答した結果です。復習の正誤と根拠をここで確認します。</p>' : '';
` + summary + "\n      recallAfterSubmission +", 'V204_RECALL_SUMMARY_ANCHOR_MISSING');

  if (html.split('</head>').length !== 2) throw new Error('V204_HEAD_ANCHOR_MISSING');
  html = html.replace('</head>',
    '<style id="qlp-v204-hint">' +
    '.qlp-hint-body[hidden]{display:none!important}' +
    '.qlp-hint-body p{margin:6px 0;line-height:1.7}' +
    '.qlp-recall-notice{line-height:1.75}' +
    '</style><meta name="qlp-study-stages-v204" content="optional-hint-graded-correction-closed-book-review"></head>');
  return html;
}
