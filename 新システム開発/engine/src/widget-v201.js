// v201: Show the ordered study fields as a compact text list instead of a global
// progress bar. Only the active field is bold. Per-field question progress is untouched.
// v200 remains immutable so previously opened ChatGPT conversations keep working.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v200.js';
export const WIDGET_URI = 'ui://qlp/question-v201.html';
export const WIDGET_VERSION = '2026-11-19.201';
export { PREPARED_LESSONS, WIDGET_MIME };

const ROUTE_LIST_JS = String.raw`
  // Keep the server's official learning-plan order. Never infer category names in UI.
  var routeFieldNames = null, routeFieldSession = null;
  function captureRouteFields(d){
    if (!d || typeof d !== 'object') return;
    var sid = d.sessionId || (d.menu && d.menu.sessionId) || null;
    if (sid && routeFieldSession && sid !== routeFieldSession) routeFieldNames = null;
    if (sid) routeFieldSession = sid;
    var candidates = [
      d.question && d.question.progress && d.question.progress.fieldNames,
      d.journey && d.journey.fieldNames,
      d.menu && d.menu.journey && d.menu.journey.fieldNames,
      d.question && d.question.fieldJump && d.question.fieldJump.choices &&
        d.question.fieldJump.choices.map(function(c){ return c.fieldName; }),
      d.grade && d.grade.fieldJump && d.grade.fieldJump.choices &&
        d.grade.fieldJump.choices.map(function(c){ return c.fieldName; }),
      d.fieldJump && d.fieldJump.choices &&
        d.fieldJump.choices.map(function(c){ return c.fieldName; }),
      d.menu && d.menu.fieldJump && d.menu.fieldJump.choices &&
        d.menu.fieldJump.choices.map(function(c){ return c.fieldName; })
    ];
    for (var i=0; i<candidates.length; i++){
      var names = candidates[i];
      if (Array.isArray(names) && names.length &&
          names.every(function(s){ return typeof s === 'string' && !!s.trim(); }) &&
          new Set(names).size === names.length) {
        routeFieldNames = names.slice();
        return;
      }
    }
  }
  function journeyBar(fieldIndex, fieldTotal, stage, fieldName){
    if (!Number.isInteger(fieldIndex) || !Number.isInteger(fieldTotal) ||
        fieldIndex < 1 || fieldTotal < fieldIndex) return '';
    var names = Array.isArray(routeFieldNames) && routeFieldNames.length === fieldTotal
      ? routeFieldNames : null;
    if (!names) {
      // For an older saved response without the ordered list, do not invent fields.
      return '<section class="study-progress qlp-route" aria-label="全分野の学習ルート">' +
        '<div class="progress-head"><span>全分野の学習ルート</span></div>' +
        '<div class="qlp-route-list"><strong>' + esc(fieldName || '現在の分野') + '</strong></div></section>';
    }
    var active = names.indexOf(String(fieldName || ''));
    if (active < 0) active = fieldIndex - 1;
    var list = names.map(function(name, i){
      return '<span class="qlp-route-item"' + (i === active ? ' aria-current="step"' : '') + '>' +
        (i === active ? '<strong>' + esc(name) + '</strong>' : esc(name)) + '</span>';
    }).join('<span class="qlp-route-sep" aria-hidden="true"> ／ </span>');
    return '<section class="study-progress qlp-route" aria-label="全分野の学習ルート">' +
      '<div class="progress-head"><span>全分野の学習ルート</span></div>' +
      '<div class="qlp-route-list" role="list" aria-label="学習計画の分野一覧">' +
      list + '</div></section>';
  }
`;

export function widgetHtml(){
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-18.200', WIDGET_VERSION);
  if (html === previous) throw new Error('V201_VERSION_MARKER_MISSING');
  const before = '  function journeyBar(fieldIndex, fieldTotal, stage, fieldName){';
  const after = '\n  function localBar(';
  const start = html.indexOf(before), end = html.indexOf(after, start);
  if (start < 0 || end < 0 || html.indexOf(before, start+1) >= 0)
    throw new Error('V201_ROUTE_RENDER_ANCHOR_MISSING');
  html = html.slice(0, start) + ROUTE_LIST_JS + html.slice(end);
  const renderBefore = '  function render(data){\n';
  if (html.split(renderBefore).length !== 2) throw new Error('V201_RENDER_ANCHOR_MISSING');
  html = html.replace(renderBefore, renderBefore + '    captureRouteFields(data);\n');
  if (html.split('</head>').length !== 2) throw new Error('V201_HEAD_ANCHOR_MISSING');
  html = html.replace('</head>',
    '<style id="qlp-v201-route-list">' +
    '.qlp-route .qlp-route-list{font-size:14px;line-height:1.9;white-space:normal;overflow-wrap:anywhere;font-weight:400}' +
    '.qlp-route .qlp-route-item{display:inline;font-weight:400}' +
    '.qlp-route .qlp-route-item strong{font-weight:750}' +
    '.qlp-route .qlp-route-sep{white-space:nowrap;opacity:.65;font-weight:400}' +
    '</style><meta name="qlp-route-v201" content="all-fields-text-active-bold"></head>');
  return html;
}
