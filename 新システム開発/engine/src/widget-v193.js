// v193: remove the Android scroll diagnostics menu.
// The Android scroll issue was resolved with v192 (natural height like iPhone),
// confirmed on the real Android ChatGPT app on 2026-11-14. The user asked to
// remove the "📏 スクロール診断" button, so v193 drops the diagnostics style and
// script (and with them the automatic android_scroll_diag report). The study
// screen itself is v192 unchanged: Android and iPhone both report the full
// content height. v192 and earlier stay immutable for cached sessions.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v192.js';
export const WIDGET_URI = 'ui://qlp/question-v193.html';
export const WIDGET_VERSION = '2026-11-14.193';
export { PREPARED_LESSONS, WIDGET_MIME };

function cutBlock(html, start, end, code) {
  const i = html.indexOf(start);
  if (i < 0 || html.indexOf(start, i + 1) >= 0) throw new Error(code + '_START');
  const j = html.indexOf(end, i);
  if (j < 0) throw new Error(code + '_END');
  return html.slice(0, i) + html.slice(j + end.length);
}

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-12.192', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  // 1) Diagnostics style (pill, panel, close button).
  html = cutBlock(html, '\n<style id="qlp-v191-scroll-diag-style">', '</style>', 'V193_DIAG_STYLE');
  // 2) Diagnostics script (measurement, panel, automatic report).
  html = cutBlock(html, '<script id="qlp-v191-scroll-diag">', '</script>', 'V193_DIAG_SCRIPT');
  if (/qlpScrollDiag|qlp-v191-scroll-diag|android_scroll_diag/.test(html)) throw new Error('V193_DIAG_LEFTOVER');
  if (!html.includes('qlp-v192-natural-height')) throw new Error('V193_NATURAL_HEIGHT_MISSING');
  if (html.split('</head>').length !== 2) throw new Error('V193_HEAD_ANCHOR_MISSING');
  html = html.replace('</head>', '<meta name="qlp-build" content="qlp-v193-no-scroll-diag"></head>');
  return html;
}
