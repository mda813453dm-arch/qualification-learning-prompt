// v190: Give Android embedded study content a single bounded inner scroll owner.
// New URI prevents reuse of cached v189 HTML. Legacy resources remain unchanged.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v189.js';
export const WIDGET_URI = 'ui://qlp/question-v190.html';
export const WIDGET_VERSION = '2026-11-11.190';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-11.189', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  const anchor = '</style></head><body>';
  if (html.split(anchor).length !== 2) throw new Error('V190_STYLE_ANCHOR_MISSING');
  html = html.replace(anchor, `</style>
<style id="qlp-android-v190-inner-scroll">
html.qlp-android-embedded:not(.study-fullscreen),
html.qlp-android-embedded:not(.study-fullscreen) body{
  height:100% !important;min-height:0 !important;overflow:hidden !important;
}
html.qlp-android-embedded:not(.study-fullscreen) #app.study-viewport:not(.is-old){
  height:100% !important;max-height:100% !important;min-height:0 !important;
  overflow-y:auto !important;overflow-x:hidden !important;
  touch-action:pan-y !important;overscroll-behavior-y:contain !important;
  -webkit-overflow-scrolling:touch;box-sizing:border-box;
}
</style></head><body>`);
  return html;
}
