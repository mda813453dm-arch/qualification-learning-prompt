// v189: Refresh the MCP widget resource URI after Android iframe touch-scroll fixes.
// ChatGPT may cache HTML for a previously published resource URI, so keep v188
// immutable for already-open sessions and publish corrected markup under v189.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v188.js';
export const WIDGET_URI = 'ui://qlp/question-v189.html';
export const WIDGET_VERSION = '2026-11-11.189';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const previous = previousHtml();
  const html = previous.replaceAll('2026-11-08.188', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return html;
}
