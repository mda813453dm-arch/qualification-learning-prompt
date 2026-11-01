// Android ChatGPT WebView may crop tall iframe content when the host scrolls.
// Bound ONLY the Android embedded widget by physical screen height rather
// than iframe viewport height (vh/dvh would cause a resize feedback loop).
// Keep iOS and desktop natural-height layout unchanged.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v168.js';

export const WIDGET_URI = 'ui://qlp/question-v169.html';
export const WIDGET_VERSION = '2026-11-01.169';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-01.168', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  const cssMarker = '</style></head><body>';
  if (html.split(cssMarker).length !== 2) throw new Error('ANDROID_STYLE_ANCHOR_MISSING');
  const css = `</style>
<style id="qlp-android-scroll-guard">
/* Stable, bounded iframe size avoids Android ChatGPT host cropping on scroll. */
html.qlp-android-embedded:not(.study-fullscreen) #app.study-viewport:not(.is-old){
  height:auto !important;
  max-height:var(--qlp-android-panel-height,560px) !important;
  overflow-x:hidden !important;
  overflow-y:auto !important;
  overscroll-behavior-y:contain;
  -webkit-overflow-scrolling:touch;
  scroll-behavior:auto;
}
html.qlp-android-embedded:not(.study-fullscreen) #app.study-viewport:not(.is-old) .latest{
  position:sticky;
  top:0;
  z-index:12;
}
</style></head><body>`;
  html = html.replace(cssMarker, css);

  const scriptMarker = "  var preparedLessons = ";
  if (html.split(scriptMarker).length !== 2) throw new Error('ANDROID_INIT_ANCHOR_MISSING');
  const boot = `  // Android WebView iframe height may shrink as the host scrolls.
  // Use screen.availHeight (not innerHeight, vh or dvh): iframe height must
  // never feed back into the size used for its own bounding rectangle.
  try {
    var ua = String(navigator.userAgent || '');
    if (/Android/i.test(ua) && window.parent !== window) {
      var sh = Number(window.screen && (window.screen.availHeight || window.screen.height));
      if (!Number.isFinite(sh) || sh < 320) sh = 760;
      var panelHeight = Math.min(700, Math.max(420, Math.round(sh * 0.74)));
      document.documentElement.style.setProperty('--qlp-android-panel-height', panelHeight + 'px');
      document.documentElement.classList.add('qlp-android-embedded');
    }
  } catch (e) {}
`;
  html = html.replace(scriptMarker, boot + scriptMarker);
  return html;
}
