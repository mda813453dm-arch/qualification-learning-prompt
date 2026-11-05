// v186: Android ChatGPT WebView scrolls the iframe document itself, instead
// of an independently scrolling #app. The outer iframe remains bounded.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v185.js';

export const WIDGET_URI = 'ui://qlp/question-v186.html';
export const WIDGET_VERSION = '2026-11-05.186';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-05.185', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');

  // The native scroll owner should be the iframe's document, not the inner
  // #app element. Prevent overscroll from chaining into ChatGPT's host page.
  // No modification of iOS/desktop or Android fullscreen layout.
  const styleAnchor = '</style></head><body>';
  if (html.split(styleAnchor).length !== 2) throw new Error('ANDROID_DOCUMENT_SCROLL_STYLE_ANCHOR_MISSING');
  html = html.replace(styleAnchor, `</style>
<style id="qlp-android-document-scroll">
html.qlp-android-embedded:not(.study-fullscreen){
  height:auto !important;
  min-height:0 !important;
  overflow-x:hidden !important;
  overflow-y:auto !important;
  overscroll-behavior-y:contain;
  touch-action:pan-y;
}
html.qlp-android-embedded:not(.study-fullscreen) body{
  height:auto !important;
  min-height:0 !important;
  overflow:visible !important;
  overscroll-behavior-y:contain;
  touch-action:pan-y;
}
html.qlp-android-embedded:not(.study-fullscreen) #app.study-viewport:not(.is-old){
  height:auto !important;
  max-height:none !important;
  overflow:visible !important;
  touch-action:pan-y;
}
html.qlp-android-embedded #qlpAndroidScrollTools {display:none !important;}
</style></head><body>`);

  // A naturally tall #app must not cause its iframe to grow beyond the stable
  // phone-screen-sized viewport. Only the inner document becomes scrollable.
  const heightAnchor = '    var h = Math.ceil(app.offsetHeight + busyHeight + navHeight) + 2;';
  if (html.split(heightAnchor).length !== 2) throw new Error('ANDROID_DOCUMENT_SCROLL_HEIGHT_ANCHOR_MISSING');
  html = html.replace(heightAnchor, `    var contentHeight = app.offsetHeight + busyHeight + navHeight;
    if (document.documentElement.classList.contains('qlp-android-embedded') &&
        !document.documentElement.classList.contains('study-fullscreen') &&
        !app.classList.contains('is-old')) {
      var cappedHeight = parseFloat(document.documentElement.style.getPropertyValue('--qlp-android-panel-height')) || 560;
      contentHeight = Math.min(contentHeight, cappedHeight);
    }
    var h = Math.ceil(contentHeight) + 2;`);
  return html;
}
