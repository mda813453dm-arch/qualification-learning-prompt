// v195: Apply display-only paragraph restoration to registered confirmation
// and remediation questions, alongside v194 official and diagnostic questions.
// The earlier v194 HTML is immutable for cached ChatGPT conversations.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v194.js';
export const WIDGET_URI = 'ui://qlp/question-v195.html';
export const WIDGET_VERSION = '2026-11-16.195';
export { PREPARED_LESSONS, WIDGET_MIME };
export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-15.194', WIDGET_VERSION);
  if (html === previous) throw new Error('V195_VERSION_MARKER_MISSING');
  for (const [before, after] of [
    [`'<div class="stem">' + esc(d.question) + '</div><div class="choices">'`,
     `'<div class="stem">' + stemHtml(d.question) + '</div><div class="choices">'`],
    [`'<div class="stem">' + esc(d.question || '') + '</div><div class="choices" id="remediationChoices">'`,
     `'<div class="stem">' + stemHtml(d.question || '') + '</div><div class="choices" id="remediationChoices">'`],
  ]) {
    if (html.split(before).length !== 2) throw new Error('V195_QUESTION_RENDER_ANCHOR_MISSING');
    html = html.replace(before, after);
  }
  const head = '</head>';
  if (html.split(head).length !== 2) throw new Error('V195_HEAD_ANCHOR_MISSING');
  html = html.replace(head,
    '<meta name="qlp-question-layout" content="all-question-modes-v195">' + head);
  return html;
}
