// v180: quarantine the incorrect 2022 morning Q11 AI explanation and show
// the supplied, explicitly nonofficial answer sheet values before retry.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v179.js';
export const WIDGET_URI = 'ui://qlp/question-v180.html';
export const WIDGET_VERSION = '2026-11-04.180';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-04.179', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
