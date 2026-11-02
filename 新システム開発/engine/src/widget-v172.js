// v172: Mandatory remediation uses the original learning session and registers
// verified Takken basics directly; model generation is only a fallback.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v171.js';
export const WIDGET_URI = 'ui://qlp/question-v172.html';
export const WIDGET_VERSION = '2026-11-02.172';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-02.171', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
