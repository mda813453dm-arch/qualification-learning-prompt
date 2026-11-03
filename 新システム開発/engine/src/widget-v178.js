// v178: accept iOS click-only events and show immediate field-start feedback.
// New URI makes a refreshed iPhone frame load the new interaction handlers.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v177.js';
export const WIDGET_URI = 'ui://qlp/question-v178.html';
export const WIDGET_VERSION = '2026-11-03.178';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-03.177', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
