// Keep handoff controls near the top and avoid nested native scrolling.
import {
  PREPARED_LESSONS, WIDGET_MIME, WIDGET_VERSION as PREVIOUS_VERSION,
  widgetHtml as previousHtml,
} from './widget-v210.js';
export const WIDGET_URI = 'ui://qlp/question-v211.html';
export const WIDGET_VERSION = '2026-11-25.211';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const before = previousHtml();
  let html = before.replaceAll(PREVIOUS_VERSION, WIDGET_VERSION);
  if(html===before)throw new Error('V211_VERSION_MARKER_MISSING');
  const start = '  function showEnd(d){';
  const end = '  // 番号で選ぶ確認は、押せるボタンで出す';
  if(html.split(start).length!==2 || html.split(end).length!==2 || html.indexOf(start)>=html.indexOf(end))
    throw new Error('V211_HANDOFF_ANCHOR_MISSING');
  const replacement = String.raw`  function showEnd(d){
    var handoff = d.handoff;
    // The endStudy formatter emits an alphanumeric ID on exactly this line.
    var id = /(?:^|\r?\n)引継ぎID：[ \t]*([A-Za-z0-9]{1,40})[ \t]*(?=\r?\n|$)/.exec(handoff);
    app.innerHTML = '<p class="notice"><b>学習を終了しました</b></p><h2>引継ぎデータ</h2>' +
      (id ? '<div class="notice"><b>引継ぎID：</b><span id="handoffDisplayId"></span></div>' : '') +
      '<div class="row"><button id="cp" type="button">引継ぎデータをコピー</button>' +
      '<button id="hoToggle" type="button" aria-expanded="false" aria-controls="ho">全文を表示</button></div>' +
      '<div id="hoStatus" class="notice" role="status" hidden></div>' +
      '<div class="notice">次のチャットで貼り付けるか、引継ぎIDを伝えると再開できます。</div>' +
      '<pre id="ho" hidden style="width:100%;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text;margin:0 0 12px;font:13px/1.5 monospace;background:var(--btn);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px"></pre>' +
      '<div class="stem">' + esc(d.log || '') + '</div><div class="notice">別の年度の公式過去問を追加するなら、次回の学習開始時に「過去問の追加・登録状況」から確認できます。登録は任意です。現在の解答・復習記録は引継ぎIDに保持されています。</div>';
    if (id) document.getElementById('handoffDisplayId').textContent = id[1];
    var text = document.getElementById('ho'), toggle = document.getElementById('hoToggle');
    var copy = document.getElementById('cp'), status = document.getElementById('hoStatus');
    text.textContent = handoff;
    function setExpanded(expanded){
      text.hidden = !expanded;
      toggle.setAttribute('aria-expanded',String(expanded));
      toggle.textContent = expanded ? '全文を閉じる' : '全文を表示';
      fit(); // Re-measure natural content height; do not focus the text or move the host.
    }
    function result(message){
      status.hidden = false;
      status.textContent = message;
      fit();
    }
    function fallbackCopy(){
      // Copy a text range instead of reintroducing a focused native textarea.
      var scratch = document.createElement('pre');
      scratch.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;user-select:text;-webkit-user-select:text';
      scratch.textContent = handoff;
      document.body.appendChild(scratch);
      var selection = window.getSelection(), saved = [], exact = false;
      function supplyText(event){
        if (!event.clipboardData) return;
        try {
          event.clipboardData.setData('text/plain',handoff);
          event.preventDefault();
          exact = true;
        } catch(e) {}
      }
      try {
        if (!selection) return false;
        for(var i=0;i<selection.rangeCount;i++)saved.push(selection.getRangeAt(i).cloneRange());
        var range = document.createRange();
        range.selectNodeContents(scratch);
        selection.removeAllRanges(); selection.addRange(range);
        // Selection serialization can trim a trailing newline. Override the clipboard data.
        document.addEventListener('copy',supplyText,true);
        return document.execCommand('copy') === true && exact;
      } catch(e) { return false; }
      finally {
        document.removeEventListener('copy',supplyText,true);
        if (selection) {
          try { selection.removeAllRanges(); saved.forEach(function(r){selection.addRange(r);}); } catch(e) {}
        }
        scratch.remove();
      }
    }
    toggle.onclick = function(){ setExpanded(text.hidden); };
    copy.onclick = async function(){
      copy.disabled = true;
      var copied = false;
      try {
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(handoff); copied = true;
          }
        } catch(e) {}
        if (!copied) copied = fallbackCopy();
        if (copied) {
          copy.textContent = 'コピーしました';
          result('引継ぎデータの全文をコピーしました。');
        } else {
          copy.textContent = '引継ぎデータをコピー';
          setExpanded(true);
          result('自動コピーできませんでした。表示した全文を選んでコピーしてください。');
        }
      } finally { copy.disabled = false; }
    };
  }
`;
  return html.slice(0,html.indexOf(start)) + replacement + html.slice(html.indexOf(end));
}
