// v171: Keep iPhone's current unanswered official question on background restoration,
// and make remediation start an explicit action with read-only registration verification.
// Android touch navigation remains inherited from v170 unchanged.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v170.js';
export const WIDGET_URI = 'ui://qlp/question-v171.html';
export const WIDGET_VERSION = '2026-11-02.171';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const original = previousHtml();
  const updated = original.replaceAll('2026-11-02.170', WIDGET_VERSION);
  if (updated === original) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return updated;
}
