// v177: native qualification-field dropdown and fixed free-text submission.
// Use a new resource URI so the iPhone ChatGPT host cannot reuse cached v176.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v176.js';
export const WIDGET_URI = 'ui://qlp/question-v177.html';
export const WIDGET_VERSION = '2026-11-03.177';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  const next = html.replaceAll('2026-11-03.176', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return next;
}
