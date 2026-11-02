// v173: Recheck explicit upload permission after ten files, before the next PDF batch.
// Refreshes the mobile widget resource URI so iPhone does not reuse the cached v172 frame.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v172.js';
export const WIDGET_URI = 'ui://qlp/question-v173.html';
export const WIDGET_VERSION = '2026-11-02.173';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-02.172', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
