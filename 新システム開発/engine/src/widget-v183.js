// v183: reliable iPhone topic tap, complete field reorder UI, readable math.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v182.js';
export const WIDGET_URI = 'ui://qlp/question-v183.html';
export const WIDGET_VERSION = '2026-11-04.183';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-04.182', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
