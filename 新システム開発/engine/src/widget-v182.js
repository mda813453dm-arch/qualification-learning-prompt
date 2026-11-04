// v182: preserve an explicitly entered study topic through confirmation and
// open the appropriate descriptive question picker instead of looping.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v181.js';
export const WIDGET_URI = 'ui://qlp/question-v182.html';
export const WIDGET_VERSION = '2026-11-04.182';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-04.181', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
