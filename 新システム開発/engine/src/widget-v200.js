// v200: 解答表示後の「問題分野を選択」（2026-11-18、全資格共通）。
// 1) 実践問題の採点結果（正解・不正解・分からない）、公式正答との照合画面、AIの詳しい解説の後の操作、
//    確認問題3問の完了画面に、ネイティブの選択欄「問題分野を選択」と「この分野の問題へ」ボタンを出す。
// 2) 分野の一覧はエンジンの応答（fieldJump：免除後の正式分野と、出題できる問題があるか）だけを使う。
//    出題できる問題が無い分野はその旨を書き、押してもエンジンの案内を出すだけで、他の分野へは切り替えない。
// 3) 選んだだけでは移動しない。「この分野の問題へ」で nextQuestion({sessionId, fieldName}) を呼び、
//    返った問題の分野が選んだ分野と一致したときだけ表示する。先取りした通常の次問（state.next）は使わない。
// 4) 押す前に保存済みの学習状態を読み（getStudySnapshot）、未回答の公式問・必須補強・確認問題の途中なら移動しない。
// 5) 通信失敗・連打では採点結果の画面を残し、同じ選択欄から再試行できる。新しい学習（startSession）は呼ばない。
// 必須補強の画面・スキップの自動次問・記述式の画面は変えない。直前の v199 の HTML は変更しない。
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v199.js';
export const WIDGET_URI = 'ui://qlp/question-v200.html';
export const WIDGET_VERSION = '2026-11-18.200';
export { PREPARED_LESSONS, WIDGET_MIME };

const HELPERS = `  // v200: 解答表示後の「問題分野を選択」。一覧はエンジンの fieldJump だけを使い、画面で分野を推測しない。
  var fieldJumpBusy = false;
  function fieldJumpList(fj){
    return fj && Array.isArray(fj.choices) ? fj.choices.filter(function(c){
      return c && typeof c.fieldName === 'string' && c.fieldName.trim(); }) : [];
  }
  function fieldJumpHtml(fj){
    var list = fieldJumpList(fj);
    if (!list.length) return '';
    return '<section class="stem field-jump" aria-label="問題分野を選択">' +
      '<label for="fieldJumpSelect"><b>問題分野を選択</b></label>' +
      '<div class="notice">選んだ分野の問題へ直接進みます。選んだだけでは移動しません。</div>' +
      '<select id="fieldJumpSelect" class="field-jump-select" aria-label="問題分野を選択">' +
      '<option value="" selected>分野を選択してください</option>' +
      list.map(function(c, i){ return '<option value="' + i + '">' + esc(c.fieldName) +
        (c.available === false ? '（出題できる問題がありません）' : '') + '</option>'; }).join('') +
      '</select><div class="row"><button type="button" id="fieldJumpGo">この分野の問題へ</button></div>' +
      '<div id="fieldJumpStatus" class="field-jump-status" role="status" aria-live="polite"></div></section>';
  }
  function bindFieldJump(fj, opts){
    opts = opts || {};
    var sel = document.getElementById('fieldJumpSelect'), go = document.getElementById('fieldJumpGo'),
      st = document.getElementById('fieldJumpStatus'), list = fieldJumpList(fj);
    if (!sel || !go || !st || !list.length) return;
    sel.onchange = function(){ st.textContent = ''; };
    go.onclick = async function(){
      if (fieldJumpBusy || locked) return;
      var choice = sel.value === '' ? null : list[Number(sel.value)];
      if (!choice) { st.setAttribute('role','alert'); st.textContent = '分野を選んでから「この分野の問題へ」を押してください。'; return; }
      var sid = opts.sessionId || state.sessionId;
      if (!sid) { st.setAttribute('role','alert'); st.textContent = '学習の記録を確認できませんでした。'; return; }
      fieldJumpBusy = true;
      // 押している間は、この画面の他のボタン（次の問題へ等）も止め、新旧の応答の競合を防ぐ。
      var others = Array.prototype.slice.call(app.querySelectorAll('button,select')).filter(function(b){ return b !== go && b !== sel && !b.disabled; });
      sel.disabled = true; go.disabled = true;
      others.forEach(function(b){ b.disabled = true; });
      st.setAttribute('role','status');
      st.textContent = '「' + choice.fieldName + '」の問題を取得しています…';
      var release = function(message){
        fieldJumpBusy = false;
        if (!sel.isConnected) return;
        sel.disabled = false; go.disabled = false;
        others.forEach(function(b){ if (b.isConnected) b.disabled = false; });
        st.setAttribute('role','alert');
        st.textContent = message;
      };
      foregroundTransitionStarted();
      try {
        var graded = fj.gradedQuestionId || null;
        if (graded) {
          var snap = await callTool('getStudySnapshot', { sessionId: sid });
          if (!snap || snap.error) throw new Error('SNAPSHOT_UNAVAILABLE');
          var pendingOther = snap.status === 'question' && snap.question && !snap.grade &&
            snap.question.questionId && snap.question.questionId !== graded;
          if (pendingOther) { release('回答していない問題があるため、分野を移動できません。その問題に回答してから選んでください。'); return; }
          if (/^(remediation|remediation_question|confirmation_question|confirmation_pending)$/.test(String(snap.status || ''))) {
            release('確認問題の途中のため、分野を移動できません。確認問題の画面から続けてください。'); return;
          }
        }
        if (typeof opts.prepare === 'function') await opts.prepare(choice.fieldName, sid);
        var r = await callTool('nextQuestion', { sessionId: sid, fieldName: choice.fieldName });
        if (!sel.isConnected) { fieldJumpBusy = false; return; }
        if (r && /^(fieldExhausted|formatUnavailable|topicUnavailable|no_matching_review)$/.test(String(r.status || ''))) {
          release(r.notice || '「' + choice.fieldName + '」には出題できる問題がありません。ほかの分野を選んでください。'); return;
        }
        if (!r || r.error) throw new Error('FIELD_JUMP_FAILED');
        if (r.status === 'question') {
          // 選んだ分野と違う問題・採点した問題の先取り残りは表示しない。全問回答済みの分野の再出題（review）だけ同じ問を許す。
          if (!r.question || r.question.fieldName !== choice.fieldName ||
              (graded && r.question.questionId === graded && r.question.kind !== 'review'))
            throw new Error('FIELD_JUMP_MISMATCH');
        } else if (['remediation','waiting','sourceUnavailable','confirmation_pending'].indexOf(r.status) < 0) {
          throw new Error('FIELD_JUMP_FAILED');
        }
        fieldJumpBusy = false;
        state.sessionId = sid;
        state.next = null;
        // 選んだ分野の問題へ直接進む：分野が変わっても「この項目はどう進めますか？」（学習方法の選択）を挟まない。
        var shown = r.status === 'question' ? Object.assign({}, r, { itemAsked: true }) : r;
        render(shown);
        if (r.status === 'question') saveRecentView(shown);
      } catch (e) {
        release('「' + choice.fieldName + '」の問題へ移動できませんでした。採点結果と学習記録はそのままです。同じ選択欄から再試行できます。');
      } finally { foregroundTransitionEnded(); }
    };
  }
`;

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-17.199', WIDGET_VERSION);
  if (html === previous) throw new Error('V200_VERSION_MARKER_MISSING');
  const once = (before, after) => {
    if (html.split(before).length !== 2) throw new Error('V200_ANCHOR_MISSING:' + before.slice(0, 60));
    html = html.replace(before, after);
  };
  once('  function showGrade(g){\n', HELPERS + '  function showGrade(g){\n');
  // 通常の採点結果（正解・不正解）：「次の選択」の下
  once("'<button id=\"endStudy\"><b>' + (fieldChange ? '5' : '3') + '</b><span>学習を終了する</span></button></div>' + sourceManagerBar();",
    "'<button id=\"endStudy\"><b>' + (fieldChange ? '5' : '3') + '</b><span>学習を終了する</span></button></div>' + fieldJumpHtml(g.fieldJump) + sourceManagerBar();");
  once('    scrollUp();\n    nextBtn(); bindEnd();\n    var sendDisplay',
    '    scrollUp();\n    nextBtn(); bindEnd(); bindFieldJump(g.fieldJump);\n    var sendDisplay');
  // 分からない
  once("'<div class=\"row\"><button id=\"dkExp\">AIの詳しい解説を追加</button><button id=\"next\">次の問題へ</button></div>' +\n        sourceManagerBar();\n      nextBtn(); bindSourceManager();",
    "'<div class=\"row\"><button id=\"dkExp\">AIの詳しい解説を追加</button><button id=\"next\">次の問題へ</button></div>' +\n        fieldJumpHtml(g.fieldJump) + sourceManagerBar();\n      nextBtn(); bindSourceManager(); bindFieldJump(g.fieldJump);");
  // 公式正答との照合画面
  once("'<div class=\"row\"><button id=\"explanationNext\">次の問題へ</button></div>' + endBar();\n    scrollUp(true); bindEnd();",
    "'<div class=\"row\"><button id=\"explanationNext\">次の問題へ</button></div>' + fieldJumpHtml(ctx.fieldJump) + endBar();\n    scrollUp(true); bindEnd(); bindFieldJump(ctx.fieldJump, { sessionId: ctx.sessionId });");
  // AIの詳しい解説の後の操作
  once("    if (m.kind === 'next') {\n      h += '<div class=\"notice\">この区切りで",
    "    if (m.kind === 'next' && m.body && m.fieldJump) h += fieldJumpHtml(m.fieldJump);\n    if (m.kind === 'next') {\n      h += '<div class=\"notice\">この区切りで");
  once('    app.innerHTML = h;\n    scrollUp();\n    bindSourceManager();\n    var endAction',
    "    app.innerHTML = h;\n    scrollUp();\n    bindSourceManager();\n    if (m.kind === 'next' && m.body && m.fieldJump) bindFieldJump(m.fieldJump, { sessionId: m.sessionId });\n    var endAction");
  // 確認問題3問の完了画面：既存の「同じ分野の公式過去問を解く」と同じく、実践問題の状態にしてから出題する
  once("間違えた問題を総復習</span></button></div>' + endBar() :",
    "間違えた問題を総復習</span></button></div>' + fieldJumpHtml(d.fieldJump) + endBar() :");
  once("      document.getElementById('confirmationPractice').onclick = function(){ openPractice(this, d.fieldName); };\n",
    "      document.getElementById('confirmationPractice').onclick = function(){ openPractice(this, d.fieldName); };\n" +
    "      bindFieldJump(d.fieldJump, { prepare: async function(target, sid){\n" +
    "        var chosen = await callTool('chooseItem', { sessionId: sid, fieldName: target, mode: 'practice' });\n" +
    "        if (!chosen || chosen.error || chosen.status !== 'item') throw new Error('ITEM_UNAVAILABLE');\n" +
    "      } });\n");
  once('</head>', '<style>.field-jump select{width:100%;min-height:44px;box-sizing:border-box;font-size:16px;margin:6px 0}' +
    '.field-jump .row button{min-height:44px}.field-jump-status{margin-top:6px}</style>' +
    '<meta name="qlp-field-jump-v200" content="graded+explanation+confirmation"></head>');
  return html;
}
