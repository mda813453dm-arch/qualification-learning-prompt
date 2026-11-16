// v197: 図の画像を取得できなかったときの代わりの表示。
// 図（本文と選択肢の間の図表・選択肢の原本画像・照合用の原本の問題画像）が読み込めなかったら、
// 1回だけ自動で読み込み直し、それでも取れなければ壊れた画像の代わりに
// 「図を表示できませんでした」と「もう一度読み込む」ボタン、原本の問題画像・公式の問題PDFへの案内を出す。
// 直前のv196のHTMLは、キャッシュ済みの会話のため変更しない。
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v196.js';
export const WIDGET_URI = 'ui://qlp/question-v197.html';
export const WIDGET_VERSION = '2026-11-17.197';
export { PREPARED_LESSONS, WIDGET_MIME };

const FIGURE_FALLBACK = [
  '  // v197: 図の画像を取得できなかったときの代わりの表示（img の error はバブリングしないため捕捉段階で受ける）',
  "  function figureRetryUrl(u, n){",
  "    var s = String(u || ''); if (s.indexOf('/v1/') < 0) return '';",
  "    var hash = s.indexOf('#'), tail = hash >= 0 ? s.slice(hash) : ''; if (hash >= 0) s = s.slice(0, hash);",
  "    s = s.replace(/[?&]qlpRetry=\\d+/, '');",
  "    return s + (s.indexOf('?') >= 0 ? '&' : '?') + 'qlpRetry=' + n + tail;",
  "  }",
  "  function figureFallbackHtml(inSource){",
  "    var source = !inSource && app.querySelector('details.qlp-source');",
  "    var pdf = Array.prototype.filter.call(app.querySelectorAll('.notice a[href]'), function(a){ return /PDF/.test(a.textContent || ''); })[0];",
  "    var guide = [];",
  "    if (source) guide.push('選択肢の後の「原本の問題画像」を開いて確認してください（下に開いておきました）。');",
  "    if (pdf && safeUrl(pdf.getAttribute('href'))) guide.push('<a href=\"' + esc(safeUrl(pdf.getAttribute('href'))) + '\" target=\"_blank\" rel=\"noopener\">公式の問題PDF</a>でも原本を確認できます。');",
  "    return '<div class=\"notice qlp-fig-error\" role=\"alert\"><b>図を表示できませんでした。</b>通信が一時的に不安定な可能性があります。学習の記録はそのまま残っています。' +",
  "      (guide.length ? '<br>' + guide.join('<br>') : '') +",
  "      '<div><button type=\"button\" class=\"qlp-fig-reload\">もう一度読み込む</button></div></div>';",
  "  }",
  "  function showFigureFallback(img){",
  "    var fig = img.closest('.fig'); if (!fig || fig.querySelector('.qlp-fig-error')) return;",
  "    var inSource = !!img.closest('details.qlp-source');",
  "    var original = img.getAttribute('data-qlp-src') || img.getAttribute('src');",
  "    var open = fig.querySelector('.fig-open'), hint = fig.querySelector('.fig-hint');",
  "    if (open) open.style.display = 'none'; if (hint) hint.style.display = 'none';",
  "    fig.insertAdjacentHTML('beforeend', figureFallbackHtml(inSource));",
  "    var box = fig.querySelector('.qlp-fig-error');",
  "    box.querySelector('.qlp-fig-reload').onclick = function(){",
  "      box.remove(); if (open) open.style.display = ''; if (hint) hint.style.display = '';",
  "      var n = Number(img.getAttribute('data-qlp-reload') || 0) + 1;",
  "      img.setAttribute('data-qlp-reload', String(n)); img.setAttribute('data-qlp-tries', '1');",
  "      img.src = figureRetryUrl(original, 10 + n) || original;",
  "      fit();",
  "    };",
  "    if (!inSource) { var details = app.querySelector('details.qlp-source'); if (details) details.open = true; }",
  "    fit();",
  "  }",
  "  document.addEventListener('error', function(e){",
  "    var img = e.target; if (!img || img.tagName !== 'IMG') return;",
  "    if (img.closest('.fig-scroll')) { var sc = img.closest('.fig-scroll'); if (!sc.querySelector('.qlp-fig-error')) sc.insertAdjacentHTML('afterbegin', '<div class=\"notice qlp-fig-error\" role=\"alert\"><b>図を表示できませんでした。</b>「閉じる」を押して、問題の画面の「もう一度読み込む」を使ってください。</div>'); return; }",
  "    if (!img.closest('.fig')) return;",
  "    if (!img.getAttribute('data-qlp-src')) img.setAttribute('data-qlp-src', img.getAttribute('src') || '');",
  "    var tries = Number(img.getAttribute('data-qlp-tries') || 0);",
  "    var retry = tries < 1 && figureRetryUrl(img.getAttribute('data-qlp-src'), 1);",
  "    if (retry) { img.setAttribute('data-qlp-tries', String(tries + 1)); setTimeout(function(){ img.src = retry; }, 800); return; }",
  "    showFigureFallback(img);",
  "  }, true);",
  '',
].join('\n');

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-16.196', WIDGET_VERSION);
  if (html === previous) throw new Error('V197_VERSION_MARKER_MISSING');
  const once = (before, after) => {
    if (html.split(before).length !== 2) throw new Error('V197_ANCHOR_MISSING:' + before.slice(0, 40));
    html = html.replace(before, after);
  };
  once('})();\n</script></body></html>', FIGURE_FALLBACK + '})();\n</script></body></html>');
  once('</head>', '<style>.qlp-fig-error{margin:6px 0;padding:10px;border:1px solid var(--line);border-radius:6px}.qlp-fig-error button{margin-top:8px;padding:8px 14px;font-size:15px;border-radius:8px}</style><meta name="qlp-figure-fallback" content="v197"></head>');
  return html;
}
