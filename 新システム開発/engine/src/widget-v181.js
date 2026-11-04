// v181: show source-backed morning descriptive answers, with visible nonofficial
// provenance, and prevent incorrect AI explanation reuse across years.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v180.js';
export const WIDGET_URI = 'ui://qlp/question-v181.html';
export const WIDGET_VERSION = '2026-11-04.181';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-04.180', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
