// v194: Restore visible paragraph boundaries in concatenated OCR statement runs.
// The parser, official question text, choice indices and grading data are untouched.
// v193 and earlier HTML are preserved for existing conversations.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v193.js';
import { splitInlineQuestionStatements } from './question-layout.js';
export const WIDGET_URI = 'ui://qlp/question-v194.html';
export const WIDGET_VERSION = '2026-11-15.194';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-14.193', WIDGET_VERSION);
  if (html === previous) throw new Error('V194_VERSION_MARKER_MISSING');
  const target = String.raw`  function stemHtml(t){
    var lines=String(t == null ? '' : t).split(/\r?\n/), out=[];`;
  const replacement = '  ' + splitInlineQuestionStatements.toString() + '\n' +
    String.raw`  function stemHtml(t){
    var lines=splitInlineQuestionStatements(t).split(/\r?\n/), out=[];`;
  if (html.split(target).length !== 2) throw new Error('V194_STEM_ANCHOR_MISSING');
  html = html.replace(target, replacement);
  const head = '</head>';
  if (html.split(head).length !== 2) throw new Error('V194_HEAD_ANCHOR_MISSING');
  html = html.replace(head, '<style id="qlp-v194-question-layout">.choices .opt span{white-space:pre-wrap;overflow-wrap:anywhere}</style>' +
    '<meta name="qlp-question-layout" content="inline-statement-paragraphs-v194">' + head);
  return html;
}
