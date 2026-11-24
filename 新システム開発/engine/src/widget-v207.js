// v207: 保存済みAI詳説を再表示するとき、ホストの古い試験概要で巻き戻さない。
import { widgetHtml as previousHtml, WIDGET_VERSION as previousVersion, PREPARED_LESSONS, WIDGET_MIME } from './widget-v205.js';
export const WIDGET_URI = 'ui://qlp/question-v207.html';
export const WIDGET_VERSION = '2026-11-24.207';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const before = previousHtml();
  let html = before.replaceAll(previousVersion, WIDGET_VERSION);
  if (html === before) throw new Error('V207_VERSION_MARKER_MISSING');
  function replaceOnce(from, to) {
    if (html.split(from).length !== 2) throw Error('Exact v205 startup anchor missing: ' + from);
    html=html.replace(from,to);
  }
  const controller=String.raw`
  // A stale host initial tool result is not authoritative for the same active study.
  // Check only a literal current session ID; don't look up learner/session aliases.
  var pendingStartupNeedPlan = null, startupNeedPlanCheck = null, startupBridgeFailed = false;
  function startupRestorePaused(){
    if (hasView) return;
    hasView = true;
    app.innerHTML = '<div class="notice" role="alert">現在の学習画面を照合できませんでした。学習記録を変更せず、表示を止めています。</div>';
    scrollUp(); fit();
  }
  function isStartupOnboarding(data){
    return data?.status === 'needPlan' && !data.planReady &&
      Array.isArray(data.onboarding) && data.onboarding.length > 0;
  }
  function renderHostUpdate(data){
    if (!isStartupOnboarding(data)) {
      render(data);
      return false;
    }
    // A delayed initial payload must not replace an already meaningful view.
    if (hasView) return true;
    var sid = data?.sessionId;
    var hostSid = input()?.sessionId;
    if ((startupNeedPlanCheck && startupNeedPlanCheck.sid !== sid) ||
        (pendingStartupNeedPlan && pendingStartupNeedPlan.sessionId !== sid)) {
      startupRestorePaused();
      return true;
    }
    if (!/^[0-9a-f-]{36}$/.test(sid || '') || (hostSid && hostSid !== sid) ||
        (state.sessionId && state.sessionId !== sid)) {
      startupRestorePaused();
      return true;
    }
    if (startupBridgeFailed && !(window.openai && typeof window.openai.callTool === 'function')) {
      startupRestorePaused();
      return true;
    }
    if (!bridgeReady && !startupBridgeFailed) {
      pendingStartupNeedPlan = data;
      return true;
    }
    if (startupNeedPlanCheck) return true;
    var check = {sid:sid, turn:renderFocusTurn};
    startupNeedPlanCheck = check;
    function stillCurrent(){
      var inputSid = input()?.sessionId;
      return startupNeedPlanCheck === check && !hasView && !locked &&
        renderFocusTurn === check.turn &&
        (!inputSid || inputSid === sid) && (!state.sessionId || state.sessionId === sid);
    }
    Promise.resolve().then(function(){
      return callTool('getStudySnapshot', {sessionId:sid, publishedExplanationOnly:true});
    }).then(function(view){
      if (!stillCurrent()) {
        if (startupNeedPlanCheck === check && !hasView && !locked) startupRestorePaused();
        return;
      }
      if (view?.sessionId !== sid) { startupRestorePaused(); return; }
      if (view?.status === 'menu' && view?.explanationQuestionId &&
          view?.menu?.kind === 'next' && view.menu.sessionId === sid && view.menu.body) {
        render(view);
      } else if (view?.status === 'noPublishedExplanation') {
        render(data);  // Genuine onboarding on the exact same existing session is unchanged.
      } else startupRestorePaused();
    }).catch(function(){
      if (startupNeedPlanCheck === check && !hasView && !locked) startupRestorePaused();
    }).finally(function(){
      if (startupNeedPlanCheck === check) startupNeedPlanCheck = null;
    });
    return true;
  }
`;
  const messageStart = "  window.addEventListener('message', function(e){\n    if (e.source !== window.parent)";
  replaceOnce(messageStart, controller + messageStart);
  replaceOnce("if (m.method === 'ui/notifications/tool-result' && m.params) render(full(m.params));",
    "if (m.method === 'ui/notifications/tool-result' && m.params) renderHostUpdate(full(m.params));");
  replaceOnce("if (window.openai && !hasView) render(latest);",
    "if (window.openai && !hasView) renderHostUpdate(latest);");
  replaceOnce("    if (!hasView && window.openai) render(initial);",
    "    if (pendingStartupNeedPlan || isStartupOnboarding(initial)) {\n" +
    "      renderHostUpdate(pendingStartupNeedPlan || initial);\n" +
    "      pendingStartupNeedPlan = null;\n" +
    "      return;\n" +
    "    }\n" +
    "    if (!hasView && window.openai) renderHostUpdate(initial);");
  replaceOnce("    if (window.openai) { render(openaiOutput()); diag('legacy_ready'); }",
    "    startupBridgeFailed = true;\n" +
    "    var failedStartup = pendingStartupNeedPlan || openaiOutput();\n" +
    "    pendingStartupNeedPlan = null;\n" +
    "    if (isStartupOnboarding(failedStartup) && renderHostUpdate(failedStartup)) return;\n" +
    "    if (window.openai) { renderHostUpdate(failedStartup); diag('legacy_ready'); }");
  replaceOnce("  if (useCachedPreview && showRecentPreview(warmSession)) restoreFromServer(false);\n  else if (window.openai) render(warmOutput);",
    "  if (isStartupOnboarding(warmOutput)) renderHostUpdate(warmOutput);\n" +
    "  else if (!warmOutput.status && useCachedPreview && isStartupOnboarding(warmCached)) renderHostUpdate(warmCached);\n" +
    "  else if (useCachedPreview && showRecentPreview(warmSession)) restoreFromServer(false);\n" +
    "  else if (window.openai) renderHostUpdate(warmOutput);");
  replaceOnce("    if (!hasView && !restoring) {\n      // toolOutput",
    "    if (!hasView && !restoring && !startupNeedPlanCheck && !pendingStartupNeedPlan) {\n      // toolOutput");
  return html;
}
