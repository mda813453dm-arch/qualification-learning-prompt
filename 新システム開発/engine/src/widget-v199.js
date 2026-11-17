// v199: 擬似言語のプログラムを原本どおりの字下げで表示する（2026-11-17、基本情報技術者 科目B の文字化）。
// 1) 本文の ``` で囲んだ部分を、等幅・空白をそのまま保つ整形済みの枠で出す（字下げ・記号を変えない）。
//    長い行は枠の中で横に動かして読む。高さは固定しない（枠内の縦スクロールにはしない）。
// 2) 選択肢の中の改行（2行の文からなる選択肢）は、v198 までの pre-wrap のまま改行して表示する（変更なし）。
// 保存している問題文・選択肢・正答・学習記録には触れない。直前の v198 の HTML は変更しない。
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v198.js';
export const WIDGET_URI = 'ui://qlp/question-v199.html';
export const WIDGET_VERSION = '2026-11-17.199';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-17.198', WIDGET_VERSION);
  if (html === previous) throw new Error('V199_VERSION_MARKER_MISSING');
  const once = (before, after) => {
    if (html.split(before).length !== 2) throw new Error('V199_ANCHOR_MISSING:' + before.slice(0, 50));
    html = html.replace(before, after);
  };
  once('  function stemHtml(t){\n    var lines=splitInlineQuestionStatementsV198(t)',
    '  function stemHtml(t){\n' +
    '    var src=String(t==null?\'\':t), out=[], re=/```[^\\n]*\\n([\\s\\S]*?)\\n```/g, last=0, m;\n' +
    '    while((m=re.exec(src))){ out.push(stemHtmlV198(src.slice(last,m.index))); out.push(\'<pre class="qlp-code" tabindex="0">\'+esc(m[1])+\'</pre>\'); last=re.lastIndex; }\n' +
    '    out.push(stemHtmlV198(src.slice(last)));\n' +
    '    return out.join(\'\');\n' +
    '  }\n' +
    '  function stemHtmlV198(t){\n    var lines=splitInlineQuestionStatementsV198(t)');
  once('</head>', '<style>.qlp-code{margin:8px 0;padding:8px 10px;background:var(--btn);border:1px solid var(--line);border-radius:6px;' +
    'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Hiragino Kaku Gothic ProN","Noto Sans Mono CJK JP",monospace;font-size:13px;line-height:1.5;' +
    'white-space:pre;overflow-x:auto;max-width:100%;box-sizing:border-box;-webkit-overflow-scrolling:touch;tab-size:2}' +
    '</style>' +
    '<meta name="qlp-question-layout-v199" content="pseudo-code-preformatted"></head>');
  return html;
}
