// New resource URI for the mobile navigation, cached-resume and top-focus fixes.
// Keep earlier widget modules intact so existing chats can still render old cards.
import { widgetHtml as priorHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v165.js';
export const WIDGET_URI = 'ui://qlp/question-v166.html';
export const WIDGET_VERSION = '2026-11-01.166';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const prior = priorHtml();
  const html = prior.replaceAll('2026-11-01.165', WIDGET_VERSION);
  if (html === prior) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return html;
}
