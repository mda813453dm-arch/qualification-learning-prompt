// v175: Before first study or resume, choose auto, a specific field, or wrong-answer review.
// A fresh URI prevents mobile ChatGPT from reusing v174 cached HTML.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v174.js';
export const WIDGET_URI = 'ui://qlp/question-v175.html';
export const WIDGET_VERSION = '2026-11-03.175';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-03.174', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
