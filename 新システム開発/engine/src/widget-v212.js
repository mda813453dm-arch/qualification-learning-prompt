// Keep a newer interaction from being moved by an older view's delayed alignment.
import {
  PREPARED_LESSONS, WIDGET_MIME, WIDGET_VERSION as PREVIOUS_VERSION,
  widgetHtml as previousHtml,
} from './widget-v211.js';

export const WIDGET_URI = 'ui://qlp/question-v212.html';
export const WIDGET_VERSION = '2026-11-25.212';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const before = previousHtml();
  let html = before.replaceAll(PREVIOUS_VERSION, WIDGET_VERSION);
  if (html === before) throw new Error('V212_VERSION_MARKER_MISSING');
  function replaceOnce(oldBlock, newBlock) {
    if (html.split(oldBlock).length !== 2) throw new Error('V212_INTERACTION_ALIGN_ANCHOR_MISSING');
    html = html.replace(oldBlock, newBlock);
  }
  replaceOnce(
    '  function qlpOnUserAction(){',
    '  var qlpUserActionTurn = 0;\n  function qlpOnUserAction(){\n    qlpUserActionTurn++;',
  );
  replaceOnce(`    var turn = ++latestFocusTurn;
    function align(){
      if (turn !== latestFocusTurn || locked || !latest.isConnected) return;`,
  `    var turn = ++latestFocusTurn;
    var actionTurn = qlpUserActionTurn;
    function align(){
      // A new click, tap or keyboard action supersedes this render's alignment.
      if (turn !== latestFocusTurn || actionTurn !== qlpUserActionTurn || locked || !latest.isConnected) return;`);
  return html;
}
