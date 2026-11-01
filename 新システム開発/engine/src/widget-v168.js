// Android Brave: prevent an iframe focus/scroll from moving the ChatGPT host
// back to the earlier graded message; reject stale read-only restoration.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v167.js';
export const WIDGET_URI = 'ui://qlp/question-v168.html';
export const WIDGET_VERSION = '2026-11-01.168';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const original = previousHtml();
  const updated = original.replaceAll('2026-11-01.167', WIDGET_VERSION);
  if(updated === original) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return updated;
}
