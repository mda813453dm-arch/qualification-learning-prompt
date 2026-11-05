// v185: Android users scroll the bounded study panel by swiping inside it.
// Preserve v184 study-plan behavior and the iOS natural-height layout.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v184.js';

export const WIDGET_URI = 'ui://qlp/question-v185.html';
export const WIDGET_VERSION = '2026-11-05.185';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-05.184', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');

  // v170 disabled native swipes and exposed up/down buttons. Android WebView
  // may not deliver its custom touchmove handler reliably. Let the browser
  // perform native vertical panning, retaining the existing JS fallback.
  const previousTouch = '  touch-action:none;\n  -webkit-overflow-scrolling:auto;';
  if (!html.includes(previousTouch)) throw new Error('ANDROID_TOUCH_STYLE_MISSING');
  html = html.replace(previousTouch,
    '  touch-action:pan-y;\n  -webkit-overflow-scrolling:touch;');

  // The panel is the primary scroll surface. The v170 toolbar must not cover
  // the screen or introduce a second way of navigating on Android.
  const toolbarStyle = '#qlpAndroidScrollTools {display:none;}';
  if (!html.includes(toolbarStyle)) throw new Error('ANDROID_TOOLBAR_STYLE_MISSING');
  html = html.replace(toolbarStyle,
    '#qlpAndroidScrollTools {display:none !important;}');

  // Make the bounded panel keyboard-scrollable too without touching the host.
  const androidBoot = "      document.documentElement.classList.add('qlp-android-embedded');";
  if (!html.includes(androidBoot)) throw new Error('ANDROID_SCROLL_BOOT_MISSING');
  html = html.replace(androidBoot, androidBoot + "\n      app.setAttribute('tabindex', '0');\n      app.setAttribute('role', 'region');\n      app.setAttribute('aria-label', '学習画面（枠内を上下にスワイプ）');");
  return html;
}
