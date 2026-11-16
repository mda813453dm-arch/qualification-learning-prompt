// v196: 図表分離（全資格共通）。エンジンが「図表だけ」と判定した画像だけを本文と選択肢の間に出し、
// 問題1問分（問番号・本文・選択肢入り）の切り出しは「原本の問題画像（照合用）」として選択肢の後に畳んで出す。
// 選択肢を文字にできない問は、選択肢の原本画像を選択肢の直前に出す。図表分離未検証の問は、その旨を図の位置に示す。
// 直前のv195のHTMLは、キャッシュ済みの会話のため変更しない。
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v195.js';
export const WIDGET_URI = 'ui://qlp/question-v196.html';
export const WIDGET_VERSION = '2026-11-16.196';
export { PREPARED_LESSONS, WIDGET_MIME };

const NEW_FIGURE_FUNCTIONS = [
  "function figureRole(q, i){ var f = (q.figures || [])[i]; return (f && f.role) || 'figure'; }",
  // 図表だけの画像を本文の直後に出す。選択肢の原本画像は選択肢の直前に、名前を付けて出す
  "function questionFigureHtml(q){",
  "  if (!q || !q.figureSeparation) return legacyQuestionFigureHtml(q);",
  "  var out = '', choiceOut = '';",
  "  (q.figureUrls || []).forEach(function(u, i){",
  "    if (!safeUrl(u)) return;",
  "    var role = figureRole(q, i);",
  "    if (role === 'choice_image') choiceOut += '<div class=\"notice\">選択肢は原本の画像で示します（文字にすると記号が欠けるおそれがあるため）。</div>' + figureHtml(u, i);",
  "    else if (role === 'choice_source') choiceOut += '<div class=\"notice\" role=\"note\"><b>図表分離未検証：</b>選択肢を文字にできないため、問題全体の原本画像で選択肢を確認してください。</div>' + figureHtml(u, i);",
  "    else out += figureHtml(u, i);",
  "  });",
  "  if (q.figureSeparation.status === 'unverified' && (q.sourceImageUrls || []).length && !(q.figures || []).some(function(f){ return f && f.role === 'figure'; }))",
  "    out += '<div class=\"notice qlp-separation\" role=\"note\"><b>図表分離未検証：</b>この問題の図表は、まだ図表だけを切り出せていません。選択肢の後の「原本の問題画像」で確認してください。</div>';",
  "  return out + choiceOut;",
  "}",
  // 原本の問題画像（問題全体）は照合用。選択肢の後に畳んで出す
  "function questionSourceHtml(q){",
  "  var src = ((q && q.sourceImageUrls) || []).filter(function(u){ return !!safeUrl(u); });",
  "  if (!src.length) return '';",
  "  return '<details class=\"descriptive-source-image qlp-source\"><summary>原本の問題画像を確認する（照合用・問題全体）</summary>' + src.map(function(u, i){ return figureHtml(u, i); }).join('') + '</details>';",
  "}",
  "function visibleNotices(q){ return ((q && q.notices) || []).filter(function(t){ return !(q.figureSeparation && /^図表分離未検証/.test(String(t))); }); }",
  "function legacyQuestionFigureHtml(q){",
].join('\n  ');

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-16.195', WIDGET_VERSION);
  if (html === previous) throw new Error('V196_VERSION_MARKER_MISSING');
  const once = (before, after) => {
    if (html.split(before).length !== 2) throw new Error('V196_ANCHOR_MISSING:' + before.slice(0, 40));
    html = html.replace(before, after);
  };
  const all = (before, after, count) => {
    if (html.split(before).length - 1 !== count) throw new Error('V196_ANCHOR_COUNT:' + before.slice(0, 40));
    html = html.split(before).join(after);
  };
  once('function questionFigureHtml(q){', NEW_FIGURE_FUNCTIONS);
  // 選択肢の直後（回答操作の前）に照合用の原本画像
  all(`return '<label class="opt" data-n="' + n + '"><input type="radio" name="ans" value="' + n + '"><b>' + n + '</b><span>' + esc(c) + '</span></label>'; }).join('') + '</div>';`,
    `return '<label class="opt" data-n="' + n + '"><input type="radio" name="ans" value="' + n + '"><b>' + n + '</b><span>' + esc(c) + '</span></label>'; }).join('') + '</div>' + questionSourceHtml(q);`, 2);
  all('(q.notices || [])', 'visibleNotices(q)', 2);
  // 選択肢の中の改行（ア：…／複数行の選択肢）を保つ
  once('</head>', '<style>.qlp-source{margin:8px 0}</style><meta name="qlp-figure-separation" content="v196">' + '</head>');
  return html;
}
