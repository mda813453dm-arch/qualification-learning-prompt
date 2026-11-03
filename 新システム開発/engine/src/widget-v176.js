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
  // The old regexp's final "()-－" is parsed as a range from ')' to '－',
  // which includes Japanese characters. It erases the entire typed field and
  // falsely reports that a valid entry is blank. Put '-' first so it is literal.
  const malformedFieldMatcher = ".replace(/[\\s　・･／/、，,（）()-－]/g, '')";
  const literalHyphenFieldMatcher = ".replace(/[-\\s　・･／/、，,（）()－]/g, '')";
  if (!next.includes(malformedFieldMatcher)) throw new Error('FIELD_MATCHER_MARKER_MISSING');
  next = next.replace(malformedFieldMatcher, literalHyphenFieldMatcher);
  return next;
}
