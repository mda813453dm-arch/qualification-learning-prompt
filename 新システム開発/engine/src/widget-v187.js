// v187: The study-plan approval button commits the displayed plan directly.
// A separate, optional button offers a one-off field or wrong-answer choice.
// Previous resource versions remain unchanged for already-open chats.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v186.js';

export const WIDGET_URI = 'ui://qlp/question-v187.html';
export const WIDGET_VERSION = '2026-11-08.187';
export { PREPARED_LESSONS, WIDGET_MIME };

function replaceRequired(html, oldText, newText, marker) {
  if (html.split(oldText).length !== 2) throw new Error('V187_ANCHOR_MISSING_' + marker);
  return html.replace(oldText, newText);
}

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-05.186', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');

  html = replaceRequired(html,
    "['startStudy', 'revise', 'diag', 'notNow', 'wishStart'",
    "['startStudy', 'startWithScope', 'revise', 'diag', 'notNow', 'wishStart'",
    'START_BUTTON_GUARD');

  html = replaceRequired(html,
    `      '<div class="notice">変更した内容は開始承認まで確定しません。確認してから開始してください。' +
      (d.fieldOrderExplicit ? '指定した全分野の順番をそのまま使います。開始時に分野を選び直す必要はありません。' : '') + '</div>' +`,
    `      '<div class="notice">変更した内容は開始承認まで確定しません。「この学習計画で始める」を押すと、上記の計画を保存して学習を開始します。分野を選び直す必要はありません。</div>' +`,
    'PLAN_CONFIRM_NOTICE');

  html = replaceRequired(html,
    `      '<button id="notNow"><b>4</b><span>今は学習しない</span></button></div>';`,
    `      '<button id="notNow"><b>4</b><span>今は学習しない</span></button></div>' +
      '<div class="row"><button type="button" id="startWithScope">特定の分野・間違えた問題から始める</button></div>';`,
    'OPTIONAL_SCOPE_BUTTON');

  html = replaceRequired(html,
    `    document.getElementById('startStudy').onclick = function(){
      // 従来の初回・再開時の自由選択は維持。ただし利用者が学習計画で
      // 全分野の順を確定済みなら再選択を求めず、保存・開始へ直接進む。
      if (draftPlan().fieldOrderExplicit) {
        startStudyNow(ov.name, studyLearner, { mode:'auto' });
      } else {
        startScopeSelectionForPlan(ov.name, studyLearner);
      }
    };`,
    `    document.getElementById('startStudy').onclick = function(){
      // 承認ボタンは変更項目に関係なく計画を直接保存し、学習を開始する。
      startStudyNow(ov.name, studyLearner, { mode:'auto' });
    };
    document.getElementById('startWithScope').onclick = function(){
      // 一時的な分野指定・誤答復習だけが選択画面に進む。
      startScopeSelectionForPlan(ov.name, studyLearner);
    };`,
    'DIRECT_PLAN_START');

  return html;
}
