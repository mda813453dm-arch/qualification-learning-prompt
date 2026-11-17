// v198: 問題画面の読みやすさの修正（2026-11-17、iPhone の ChatGPT での指摘）。
// 1) 本文の a〜e・ア〜オ・1〜5 の列挙を、読み取りで「b . 」のように空白が入っていても1項目ずつ段落に分ける。
// 2) 読み取りで日本語の前後に入った半角空白を、表示のときだけ詰める（本文・選択肢の字や句読点は変えない）。
// 3) 「過去問の追加・登録状況」ボタンを、問題見出しと分野の間から、解答の操作の下へ移す。
// 保存している問題文・選択肢・正答・学習記録には触れない。直前の v197 の HTML は変更しない。
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v197.js';
import { splitInlineQuestionStatementsV198, compactOcrSpacesV198 } from './question-layout-v198.js';
export const WIDGET_URI = 'ui://qlp/question-v198.html';
export const WIDGET_VERSION = '2026-11-17.198';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-17.197', WIDGET_VERSION);
  if (html === previous) throw new Error('V198_VERSION_MARKER_MISSING');
  const once = (before, after) => {
    if (html.split(before).length !== 2) throw new Error('V198_ANCHOR_MISSING:' + before.slice(0, 50));
    html = html.replace(before, after);
  };
  once('  function stemHtml(t){\n    var lines=splitInlineQuestionStatements(t).split(/\\r?\\n/), out=[];',
    '  ' + compactOcrSpacesV198.toString() + '\n  ' + splitInlineQuestionStatementsV198.toString() + '\n' +
    '  function stemHtml(t){\n    var lines=splitInlineQuestionStatementsV198(t).split(/\\r?\\n/), out=[];');
  const choiceBefore = "<b>' + n + '</b><span>' + esc(c) + '</span></label>'; }).join('') + '</div>' + questionSourceHtml(q);";
  if (html.split(choiceBefore).length < 2) throw new Error('V198_CHOICE_ANCHOR_MISSING');
  html = html.replaceAll(choiceBefore, "<b>' + n + '</b><span>' + esc(compactOcrSpacesV198(c)) + '</span></label>'; }).join('') + '</div>' + questionSourceHtml(q);");
  once("    if (!data.restored) h += sourceManagerBar();\n", '');
  once('<div id="answerProgress" class="notice" role="status" aria-live="polite" style="display:none"></div>\';\n',
    '<div id="answerProgress" class="notice" role="status" aria-live="polite" style="display:none"></div>\';\n    if (!data.restored) h += sourceManagerBar();\n');
  once('</head>', '<meta name="qlp-question-layout-v198" content="enumeration-paragraphs+ocr-spacing+source-button-below"></head>');
  return html;
}
