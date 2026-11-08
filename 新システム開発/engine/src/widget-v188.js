// v188: All qualifications collapse OCR source-only duplicate images
// when full question and choices are readable, without hiding needed figures.
// New URI prevents stale ChatGPT mobile widget resource caching.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v187.js';
export const WIDGET_URI = 'ui://qlp/question-v188.html';
export const WIDGET_VERSION = '2026-11-08.188';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const previous = previousHtml();
  const html = previous.replaceAll('2026-11-08.187', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return html;
}
