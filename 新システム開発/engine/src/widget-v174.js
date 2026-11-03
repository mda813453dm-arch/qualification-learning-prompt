// v174: Initial plan start is single-flight, errors are deduplicated and a
// successful but response-lost start is recovered through a read-only snapshot.
// A new URI prevents mobile ChatGPT from reusing the older broken v173 frame.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v173.js';
export const WIDGET_URI = 'ui://qlp/question-v174.html';
export const WIDGET_VERSION = '2026-11-03.174';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-02.173', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
