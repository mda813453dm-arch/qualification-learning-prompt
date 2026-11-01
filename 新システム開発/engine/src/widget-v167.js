// Version-specific resource URI: adaptive practice by 50% of verifiable questions per field.
// Existing versions remain readable for previously opened ChatGPT learning frames.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v166.js';
export const WIDGET_URI = 'ui://qlp/question-v167.html';
export const WIDGET_VERSION = '2026-11-01.167';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const original = previousHtml();
  const updated = original.replaceAll('2026-11-01.166', WIDGET_VERSION);
  if(updated === original) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return updated;
}
