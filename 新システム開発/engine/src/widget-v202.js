// v202: After grading, immediately show a brief, source-bounded correction.
// Answer numbers come only from the program's saved grade. Reasons are never
// fabricated from an answer-key PDF; the optional AI detail remains user-initiated.
// v201 and all earlier UI resources stay immutable for existing conversations.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v201.js';
import { instantFeedbackModel } from './instant-feedback.js';
export const WIDGET_URI = 'ui://qlp/question-v202.html';
export const WIDGET_VERSION = '2026-11-20.202';
export { PREPARED_LESSONS, WIDGET_MIME };

const REPLACEMENT = String.raw`
  function officialAnswerSummary(q, g){
    var f = instantFeedbackModel(q, g);
    if (f.status !== 'ready')
      return '<div class="notice" role="alert">採点した問題と表示中の問題の照合ができません。正答を推測して表示しません。</div>';
    var answerText = f.correctChoices.map(function(c){
      return '<div class="qlp-answer-text"><b>選択肢 ' + esc(c.number) + '</b>　' + esc(c.text) + '</div>';
    }).join('');
    var chosen = f.dontKnow ? '分からない（復習対象として記録）' :
      f.selected ? ('選択肢 ' + esc(f.selected.number) + '　' + esc(f.selected.text)) :
      '回答番号を確認できませんでした';
    var correction = f.dontKnow ?
      'まだ答えを想起できなかったため、後日の復習で再挑戦しましょう。' :
      f.correct ?
      'あなたが選んだ回答は、保存済みの正答と一致しています。' :
      f.selected ?
      'あなたが選んだ選択肢 ' + esc(f.selected.number) + ' は保存済みの正答に含まれません。なぜ誤りとなるかの判断理由は、この正答表だけでは確認できません。' :
      '回答が正答と一致しません。誤りの具体的な理由は未確認です。';
    var source = safeUrl(g.answerPdfUrl)
      ? answerReferenceLink(g) : '正答を照合した資料へのリンクはありません';
    var choices = Array.isArray(q.choices) ? q.choices : [];
    var accepted = g.acceptedAnswers || [g.correctAnswer];
    var all = choices.map(function(c,i){
      var n=i+1;
      var isCorrect=accepted.some(function(a){ return String(a) === String(n); });
      var isSelected=f.selected && f.selected.number === n;
      return '<li><b>' + esc(n) + '</b>　' + esc(c) +
        (isCorrect ? '　<b>【正答】</b>' : '') +
        (isSelected ? '　【あなたの回答】' : '') + '</li>';
    }).join('');
    return '<section class="stem official-answer-summary qlp-instant-feedback" aria-label="採点直後の短い訂正">' +
      '<b>■採点直後の確認（AIの生成待ちなし）</b>' +
      '<p><b>正答：</b>' + esc(f.correctLabel) + '</p>' +
      answerText +
      '<p><b>あなたの回答：</b>' + chosen + '</p>' +
      '<p><b>答え合わせ：</b>' + correction + '</p>' +
      '<p><b>判断理由：</b>原本の正答番号との照合は完了していますが、法律上・計算上の理由までの検証は未完了です。確認したいときだけ「AIの詳しい解説を追加」を選んでください。</p>' +
      '<p><b>正答番号の出典：</b>' + source + '</p>' +
      (all ? '<details class="qlp-answer-details"><summary>全選択肢と正答の位置を確認する</summary><ol class="ov-l">' + all + '</ol></details>' : '') +
      '</section>';
  }
`;

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-19.201', WIDGET_VERSION);
  if (html === previous) throw new Error('V202_VERSION_MARKER_MISSING');
  const startAnchor = '  function officialAnswerSummary(q, g){';
  const endAnchor = '\n  function gradeBanner(g, label){';
  const start = html.indexOf(startAnchor);
  const end = html.indexOf(endAnchor, start);
  if (start < 0 || end < 0 || html.indexOf(startAnchor, start + 1) >= 0)
    throw new Error('V202_FEEDBACK_ANCHOR_MISSING');
  const replacement = '  ' + instantFeedbackModel.toString() + '\n' + REPLACEMENT;
  html = html.slice(0, start) + replacement + html.slice(end);
  // A key of answers verifies the answer number, NOT the legal/technical reasoning.
  html = html.replaceAll('解答の根拠：', '正答番号の出典：');
  if (html.split('</head>').length !== 2) throw new Error('V202_HEAD_ANCHOR_MISSING');
  html = html.replace('</head>',
    '<style id="qlp-v202-instant-feedback">' +
    '.qlp-instant-feedback p{margin:8px 0;line-height:1.7}' +
    '.qlp-instant-feedback .qlp-answer-text{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.qlp-instant-feedback .qlp-answer-details{margin-top:10px}' +
    '.qlp-instant-feedback .qlp-answer-details summary{cursor:pointer}' +
    '</style><meta name="qlp-feedback-v202" content="immediate-program-graded-source-bounded"></head>');
  return html;
}
