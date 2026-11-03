// v176: qualification-scoped free-text field entry before initial or resumed study.
// The new resource URI avoids cached mobile widgets that only have list buttons.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v175.js';
export const WIDGET_URI = 'ui://qlp/question-v176.html';
export const WIDGET_VERSION = '2026-11-03.176';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const html = previousHtml();
  let next = html.replaceAll('2026-11-03.175', WIDGET_VERSION);
  if (next === html) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  // An empty free-text box cannot start studying, so it does not need the
  // stale-tap guard used by the numbered choices. On mobile, a valid second
  // tap after correcting an empty submission can lose its pointerdown event;
  // the guard then swallows the click and leaves the old validation message.
  // Keep the guard for numbered choices, which can overlap prior screen taps.
  const guardedFreeSubmit = '    guardScopeClick(fieldSubmit);\n    fieldSubmit.onclick = selectTypedField;';
  if (!next.includes(guardedFreeSubmit)) throw new Error('FREE_SCOPE_SUBMIT_MARKER_MISSING');
  next = next.replace(guardedFreeSubmit, '    fieldSubmit.onclick = selectTypedField;');
  return next;
}
