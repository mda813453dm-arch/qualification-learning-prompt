// v208: display the official no-correct-option exception without marking
// any choice as substantively correct. v205 and its legacy URI are immutable.
import {
  PREPARED_LESSONS, WIDGET_MIME, WIDGET_VERSION as PREVIOUS_VERSION,
  widgetHtml as previousHtml,
} from './widget-v207.js';
export const WIDGET_URI = 'ui://qlp/question-v208.html';
export const WIDGET_VERSION = '2026-11-24.208';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml(){
  const before = previousHtml();
  const versioned = before.replaceAll(PREVIOUS_VERSION, WIDGET_VERSION);
  if (versioned === before) throw new Error('V208_VERSION_MARKER_MISSING');
  return withNoOptionAnswerDisplay(versioned);
}

function withNoOptionAnswerDisplay(input) {
  let html = input;
  function replace(anchor, target, count = 1) {
    if (html.split(anchor).length !== count + 1)
      throw new Error('NO_OPTION_ANSWER_WIDGET_ANCHOR_MISMATCH: ' + anchor);
    html = html.replaceAll(anchor, () => target);
  }
  const verified = '  function renderVerifiedExplanation(ctx){';
  replace(verified, String.raw`  // The official exception is a label, not inferred from the number of accepted answers.
  function hasNoCorrectOption(g){
    return /^正解(?:肢)?(?:が)?(?:ない|なし|無し)(?:$|[ (])/.test(
      String(g.correctAnswerLabel || '').normalize('NFKC').replace(/\s+/g, ''));
  }
  function noOptionNotice(){
    return '公式発表：正解肢なし。全解答を採点上正解として扱います。';
  }
  function highlightedAnswers(g){
    return hasNoCorrectOption(g) ? [] : (g.acceptedAnswers || [g.correctAnswer]);
  }
` + verified);
  const accepted = '(g.acceptedAnswers || [g.correctAnswer])';
  // Exclude the one occurrence in the helper itself.
  for (const use of ['.some', '.forEach'])
    replace(accepted + use, 'highlightedAnswers(g)' + use, use === '.forEach' ? 2 : 1);
  replace('var accepted = g.acceptedAnswers || [g.correctAnswer];', 'var accepted = highlightedAnswers(g);');
  replace('var answerText = f.correctChoices.map', 'var noOption = hasNoCorrectOption(g);\n    var answerText = (noOption ? [] : f.correctChoices).map');
  replace("f.correct ?\n      'あなたが選んだ回答は、保存済みの正答と一致しています。'",
    "noOption && f.correct ? 'あなたの回答は、公式の取り扱いにより採点上正解です。' :\n      f.correct ?\n      'あなたが選んだ回答は、保存済みの正答と一致しています。'");
  replace("'<p><b>正答：</b>' + esc(f.correctLabel) + '</p>'",
    "'<p><b>' + (noOption ? esc(noOptionNotice()) : '正答：</b>' + esc(f.correctLabel)) + (noOption ? '</b>' : '') + '</p>'");
  replace("'<p><b>判断理由：</b>原本の正答番号との照合は完了していますが、法律上・計算上の理由までの検証は未完了です。確認したいときだけ「AIの詳しい解説を追加」を選んでください。</p>'",
    "(noOption ? '<p><b>判断理由：</b>各選択肢の判断理由は、正答表からは確認できません。</p>' : '<p><b>判断理由：</b>原本の正答番号との照合は完了していますが、法律上・計算上の理由までの検証は未完了です。確認したいときだけ「AIの詳しい解説を追加」を選んでください。</p>')");
  replace("'<details class=\"qlp-answer-details\"><summary>全選択肢と正答の位置を確認する</summary><ol class=\"ov-l\">'",
    "'<details class=\"qlp-answer-details\"><summary>' + (noOption ? '全選択肢を確認する' : '全選択肢と正答の位置を確認する') + '</summary><ol class=\"ov-l\">'");
  replace("'<div class=\"stem\"><b>各選択肢の原文と正答</b><ol class=\"ov-l\">'",
    "'<div class=\"stem\"><b>' + (hasNoCorrectOption(g) ? '各選択肢の原文' : '各選択肢の原文と正答') + '</b><ol class=\"ov-l\">'");
  replace("(g.correct ? '✓ 正解' : '✕ 不正解')", "(g.correct ? (hasNoCorrectOption(g) ? '✓ 採点上の正解' : '✓ 正解') : '✕ 不正解')");
  replace("esc(answerStatusName(g)) + '：' + esc(ans)", "(hasNoCorrectOption(g) ? esc(noOptionNotice()) : esc(answerStatusName(g)) + '：' + esc(ans))");
  replace("(correct ? '✓ 正解！' : '✕ 不正解')", "(correct ? (hasNoCorrectOption(g) ? '✓ 採点上の正解' : '✓ 正解！') : '✕ 不正解')");
  replace("(g.correct ? '正解です。' : '不正解です。')",
    "(g.correct ? (hasNoCorrectOption(g) ? '採点上の正解です。' : '正解です。') : '不正解です。')");
  return html;
}
