// v209: a partial host needPlan is not a completed study view. Keep the
// v207 strict same-session restore and v208 official no-option presentation.
import {
  PREPARED_LESSONS, WIDGET_MIME, WIDGET_VERSION as PREVIOUS_VERSION,
  widgetHtml as previousHtml,
} from './widget-v208.js';
export const WIDGET_URI = 'ui://qlp/question-v209.html';
export const WIDGET_VERSION = '2026-11-24.209';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const before = previousHtml();
  let html = before.replaceAll(PREVIOUS_VERSION, WIDGET_VERSION);
  if (html === before) throw new Error('V209_VERSION_MARKER_MISSING');
  function replaceOnce(from, to) {
    if (html.split(from).length !== 2) throw new Error('V209_PARTIAL_PLAN_ANCHOR_MISMATCH');
    html = html.replace(from, () => to);
  }
  const saved = '  var pendingStartupNeedPlan = null, startupNeedPlanCheck = null, startupBridgeFailed = false;';
  replaceOnce(saved, saved + '\n  var startupPartialNeedPlan = false;');
  const host = '  function renderHostUpdate(data){';
  replaceOnce(host, String.raw`  function isPartialStartupNeedPlan(data){
    return data?.status === 'needPlan' && !data.planReady && !isStartupOnboarding(data) &&
      !data.error && !data.menu && !data.question && !data.grade &&
      !data.screen && !data.notice && !data.display;
  }
  function showPartialStartupNotice(message, failed){
    // This is not a completed view. Do not stamp, save, or set hasView, so
    // later authoritative onboarding, plan, question, or saved detail can display.
    app.innerHTML = '<div class="notice" role="' + (failed ? 'alert' : 'status') + '">' + esc(message) + '</div>';
    fit();
  }
  function partialStartupUnavailable(){
    showPartialStartupNotice('試験概要を受信できませんでした。学習記録は変更していません。元の会話から同じ学習画面を再表示してください。', true);
  }
` + host + String.raw`
    if (isPartialStartupNeedPlan(data)) {
      if (!hasView && !locked && !pendingStartupNeedPlan && !startupNeedPlanCheck) {
        if (startupBridgeFailed) {
          startupPartialNeedPlan = true;
          partialStartupUnavailable();
        } else if (!startupPartialNeedPlan) {
          startupPartialNeedPlan = true;
          showPartialStartupNotice('試験概要・学習状況の情報を待っています。', false);
          // Start this from actual arrival, including a late placeholder after
          // the generic bootstrap watchdog already fired. No automatic RPC.
          setTimeout(function(){
            if (!hasView && !locked && !pendingStartupNeedPlan && !startupNeedPlanCheck)
              partialStartupUnavailable();
          }, 10000);
        }
      }
      return true;
    }
`);
  // A bare placeholder, even with an ID, is not authorization for broad restore.
  replaceOnce('    if (!hasView && window.openai) renderHostUpdate(initial);',
    '    if (!hasView && window.openai && renderHostUpdate(initial)) return;');
  replaceOnce('    if (isStartupOnboarding(failedStartup) && renderHostUpdate(failedStartup)) return;',
    '    if ((isStartupOnboarding(failedStartup) || isPartialStartupNeedPlan(failedStartup)) && renderHostUpdate(failedStartup)) return;');
  replaceOnce('  if (isStartupOnboarding(warmOutput)) renderHostUpdate(warmOutput);',
    '  if (isStartupOnboarding(warmOutput) || isPartialStartupNeedPlan(warmOutput)) renderHostUpdate(warmOutput);');
  replaceOnce('    if (!hasView && !restoring && !startupNeedPlanCheck && !pendingStartupNeedPlan) {',
    '    if (!hasView && !restoring && !startupNeedPlanCheck && !pendingStartupNeedPlan && !startupPartialNeedPlan) {');
  return html;
}
