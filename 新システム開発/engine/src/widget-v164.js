// Versioned MCP presentation of the legacy widget without rewriting the
// monolithic legacy widget source. This is the single production entry point.
import { widgetHtml as baseHtml, PREPARED_LESSONS as BASE,
  WIDGET_MIME } from './widget.js';
import { confirmationWidgetHtml, MANKAN_CONFIRMATION } from './confirmation-widget-compat.js';

export const WIDGET_URI = 'ui://qlp/question-v164.html';
export const WIDGET_VERSION = '2026-11-01.164';
export { WIDGET_MIME };
export const PREPARED_LESSONS = Object.freeze({
  ...BASE, '管理組合の運営の円滑化': MANKAN_CONFIRMATION,
});

export function widgetHtml() {
  const base = confirmationWidgetHtml(baseHtml());
  const versioned = base.replaceAll('2026-11-01.163', WIDGET_VERSION);
  if (versioned === base) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  return versioned;
}
