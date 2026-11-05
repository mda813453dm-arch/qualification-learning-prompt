// v184: manually saved full field order starts directly, without a redundant subject chooser.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v183.js';
export const WIDGET_URI = 'ui://qlp/question-v184.html';
export const WIDGET_VERSION = '2026-11-05.184';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-04.183', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
