// v176: qualification-scoped free-text field entry before initial or resumed study.
// The new resource URI avoids cached mobile widgets that only have list buttons.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v175.js';
export const WIDGET_URI = 'ui://qlp/question-v176.html';
export const WIDGET_VERSION = '2026-11-03.176';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-03.175', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
