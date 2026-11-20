// v203: Reduce perceived AI explanation latency without bypassing the program's
// official answer verification or regrading. Send the model request and start
// publication observation concurrently. Poll rapidly at first, back off later.
// Prior widget versions remain immutable for already open ChatGPT conversations.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v202.js';
export const WIDGET_URI = 'ui://qlp/question-v203.html';
export const WIDGET_VERSION = '2026-11-20.203';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const oldHtml = previousHtml();
  let html = oldHtml.replaceAll('2026-11-20.202', WIDGET_VERSION);
  if (html === oldHtml) throw new Error('V203_VERSION_MARKER_MISSING');

  const swap = (before, after, error) => {
    if (html.split(before).length !== 2) throw new Error(error);
    html = html.replace(before, after);
  };

  swap(
    "var visible=label+'の各選択肢の判断根拠を、公式資料に基づいて解説してください。（照合番号：'+ctx.explanationRef+'）';",
    "var visible=label+'の正解理由と私が選んだ回答の誤り・混同点を、照合済みの公式問題と正答に基づいて簡潔に説明してください。必要な法令条件や計算過程は省略しないでください。（照合番号：'+ctx.explanationRef+'）';",
    'V203_EXPLANATION_REQUEST_ANCHOR_MISSING'
  );

  const pollBegin = '  async function waitForPublishedExplanation(sessionId, questionId){';
  const pollEnd = '\n  async function loadExplanation(questionId, requestAi){';
  const pollStart = html.indexOf(pollBegin), pollStop = html.indexOf(pollEnd, pollStart);
  if (pollStart < 0 || pollStop < pollStart) throw new Error('V203_POLL_SECTION_MISSING');
  let poll = html.slice(pollStart, pollStop);
  const pollChanges = [
    [
      'async function waitForPublishedExplanation(sessionId, questionId){',
      'async function waitForPublishedExplanation(sessionId, questionId, shouldCancel){'
    ],
    [
      '    var deadline = Date.now() + (window.__qlpTestExplanationWaitMs || 75000);',
      '    var deadline = Date.now() + (window.__qlpTestExplanationWaitMs || 75000);\n    var attempt = 0;'
    ],
    [
      '    while (Date.now() < deadline) {',
      '    while (Date.now() < deadline) {\n      if (shouldCancel && shouldCancel()) return;'
    ],
    [
      "      await new Promise(function(done){ setTimeout(done, 3000); });",
      "      // Try frequently during the first seconds, then back off to reduce traffic.\n" +
      "      var delay = attempt < 6 ? 500 : attempt < 16 ? 900 : 1600;\n" +
      "      attempt += 1;\n" +
      "      await new Promise(function(done){ setTimeout(done, Math.min(delay, Math.max(0, deadline - Date.now()))); });"
    ],
    [
      "    if (!locked && state.sessionId === sessionId && state.question?.questionId === questionId)\n      throw new Error('EXPLANATION_PUBLISH_TIMEOUT');",
      "    if (!shouldCancel?.() && !locked && state.sessionId === sessionId && state.question?.questionId === questionId)\n      throw new Error('EXPLANATION_PUBLISH_TIMEOUT');"
    ]
  ];
  for (const [before, after] of pollChanges) {
    if (poll.split(before).length !== 2) throw new Error('V203_POLL_ANCHOR_MISSING: ' + before.slice(0,30));
    poll = poll.replace(before, after);
  }
  html = html.slice(0, pollStart) + poll + html.slice(pollStop);

  swap(
    "      try {\n        await requestAdaptiveExplanation(ctx);\n        await waitForPublishedExplanation(ctx.sessionId, ctx.question.questionId);\n      } finally {",
    "      var startedAt = Date.now();\n" +
    "      var stopPolling = false;\n" +
    "      // The host ACK can arrive after the model has already published. Observe\n" +
    "      // the saved result immediately rather than waiting for the ACK first.\n" +
    "      var sending = requestAdaptiveExplanation(ctx);\n" +
    "      var publication = waitForPublishedExplanation(ctx.sessionId, ctx.question.questionId,\n" +
    "        function(){ return stopPolling; });\n" +
    "      publication.catch(function(){}); // suppress abandoned async rejection\n" +
    "      try {\n" +
    "        await sending;\n" +
    "        await publication;\n" +
    "        console.info(JSON.stringify({event:'qlp_explanation_ready',elapsedMs:Date.now()-startedAt}));\n" +
    "      } catch (e) {\n" +
    "        stopPolling = true;\n" +
    "        console.info(JSON.stringify({event:'qlp_explanation_error',elapsedMs:Date.now()-startedAt}));\n" +
    "        throw e;\n" +
    "      } finally {",
    'V203_REQUEST_CONCURRENCY_ANCHOR_MISSING'
  );

  if (html.split('</head>').length !== 2) throw new Error('V203_HEAD_ANCHOR_MISSING');
  html = html.replace('</head>',
    '<meta name="qlp-ai-latency-v203" content="parallel-publish-polling-fast-first-concise"></head>');
  return html;
}
