// v179: persist the user-selected free-text topic across every practice question.
// New URI refreshes the iPhone widget so explicit scope resets reach the engine.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v178.js';
export const WIDGET_URI = 'ui://qlp/question-v179.html';
export const WIDGET_VERSION = '2026-11-04.179';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-03.178', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
