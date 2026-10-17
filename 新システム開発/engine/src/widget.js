/**
 * ChatGPT アプリ（MCP Apps / Apps SDK）の問題画面。
 * 問題文・図・選択肢は、エンジンが返した内容（structuredContent）だけでこの画面が描く。AIは中身を書き換えたり、別の図を足したりできない。
 * 回答の採点・次の問題もこの画面からエンジンを呼ぶ。解説だけをAIに頼む（「解説して」とチャットに送る）。
 */
export const WIDGET_URI = 'ui://qlp/question-v1.html';
export const WIDGET_MIME = 'text/html;profile=mcp-app';

/** 画面の HTML。 */
export function widgetHtml() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--fg:#1a1a1a;--sub:#555;--line:#ddd;--bg:#fff;--ok:#0a7d32;--ng:#c62828;--btn:#f4f4f4}
@media (prefers-color-scheme:dark){:root{--fg:#eee;--sub:#aaa;--line:#444;--bg:#1e1e1e;--btn:#2a2a2a}}
body{margin:0;font:16px/1.7 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--fg);background:var(--bg)}
#app{padding:12px 14px}
h2{font-size:17px;margin:0 0 6px}
.field{color:var(--sub);font-size:14px;margin-bottom:8px}
.stem{white-space:pre-wrap;margin:8px 0}
.fig{margin:10px 0}.fig img{width:100%;height:auto;background:#fff;border:1px solid var(--line);border-radius:6px}
.choices{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.choices button{display:flex;gap:10px;text-align:left;font:inherit;color:var(--fg);background:var(--btn);border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer}
.choices button b{min-width:1.2em}
.choices button:disabled{opacity:.6;cursor:default}
.choices button.correct{border-color:var(--ok);border-width:2px}.choices button.picked{outline:2px solid var(--sub)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.row button{font:inherit;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--fg);cursor:pointer}
.notice{font-size:13px;color:var(--sub);white-space:pre-wrap}
.result{font-weight:700;font-size:17px;margin:10px 0 4px}.result.ok{color:var(--ok)}.result.ng{color:var(--ng)}
a{color:inherit}
</style></head><body><div id="app">問題を読み込んでいます…</div>
<script>
(function(){
  var app = document.getElementById('app');
  var state = { sessionId: null, question: null, answered: false };
  var pending = {}, rid = 1;
  function rpc(method, params){ return new Promise(function(res, rej){ var id = rid++; pending[id] = { res: res, rej: rej }; window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params }, '*'); }); }
  function notify(method, params){ window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*'); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u){ return /^https:\\/\\//.test(String(u || '')) ? String(u) : ''; }
  async function callTool(name, args){
    var r = (window.openai && window.openai.callTool) ? await window.openai.callTool(name, args) : await rpc('tools/call', { name: name, arguments: args });
    return full(r);
  }
  function ask(text){
    if (window.openai && window.openai.sendFollowUpMessage) return window.openai.sendFollowUpMessage({ prompt: text });
    return rpc('ui/message', { role: 'user', content: [{ type: 'text', text: text }] });
  }
  // 画面用の全文は _meta.qlp（AIには渡らない）、無ければ structuredContent
  function full(r){ return r && ((r._meta && r._meta.qlp) || r.structuredContent || r); }
  function input(){ return (window.openai && window.openai.toolInput) || {}; }
  function render(data){
    if (!data) return;
    if (data.grade && data.next) {
      if (state.question && !state.answered) { state.answered = true; showGrade(data.grade); state.next = data.next; return; }
      var g = data.grade; render(data.next);
      app.insertAdjacentHTML('afterbegin', '<div class="notice">前の問題：' + (g.skipped ? 'スキップ' : (g.correct ? '正解' : '不正解') + '（正答は ' + esc(g.correctAnswer) + '）') + '</div>');
      return;
    }
    if (data.sessionId) state.sessionId = data.sessionId;
    if (!state.sessionId && input().sessionId) state.sessionId = input().sessionId;
    if (data.status === 'waiting' || data.status === 'finished' || !data.question) {
      app.innerHTML = '<div class="stem">' + esc(data.screen || data.notice || (data.status === 'finished' ? '取り込んだ過去問をすべて解きました。' : '問題を準備しています。')) + '</div>';
      return;
    }
    var q = data.question; state.question = q; state.answered = false;
    var h = '<h2>' + esc((q.year ? q.year + '年度 ' : '') + '問' + q.questionNumber) + '</h2>';
    if (data.fieldNotice) h += '<div class="notice"><b>' + esc(data.fieldNotice) + '</b></div>';
    if (q.fieldName) h += '<div class="field">' + esc(q.fieldName) + '</div>';
    if (q.stem) h += '<div class="stem">' + esc(q.stem) + '</div>';
    (q.figureUrls || []).forEach(function(u, i){ if (safeUrl(u)) h += '<div class="fig"><img alt="公式の問題の図' + (i + 1) + '" src="' + esc(safeUrl(u)) + '"></div>'; });
    h += '<div class="choices">' + (q.choices || []).map(function(c, i){ var n = i + 1; return '<button data-n="' + n + '"><b>' + n + '</b><span>' + esc(c) + '</span></button>'; }).join('') + '</div>';
    h += '<div class="row"><label><input type="checkbox" id="guess"> 勘で選んだ</label><button id="skip">スキップ</button></div>';
    if (safeUrl(q.questionPdfUrl)) h += '<div class="notice">原本：<a href="' + esc(safeUrl(q.questionPdfUrl)) + '" target="_blank" rel="noopener">公式の問題PDF</a></div>';
    (q.notices || []).forEach(function(t){ h += '<div class="notice">' + esc(t) + '</div>'; });
    app.innerHTML = h;
    app.querySelectorAll('.choices button').forEach(function(b){ b.onclick = function(){ answer(b.getAttribute('data-n')); }; });
    document.getElementById('skip').onclick = function(){ answer('スキップ'); };
  }
  async function answer(v){
    if (state.answered || !state.question) return;
    state.answered = true;
    app.querySelectorAll('button').forEach(function(b){ b.disabled = true; });
    var picked = app.querySelector('.choices button[data-n="' + v + '"]'); if (picked) picked.classList.add('picked');
    var guess = document.getElementById('guess');
    try {
      var r = await callTool('submitAnswer', { sessionId: state.sessionId, questionId: state.question.questionId, value: String(v), confidence: guess && guess.checked ? 'guess' : 'sure' });
      showGrade(r && r.grade); state.next = r && r.next;
    } catch (e) {
      state.answered = false; app.querySelectorAll('button').forEach(function(b){ b.disabled = false; });
      app.insertAdjacentHTML('beforeend', '<div class="notice">採点できませんでした。もう一度押してください。</div>');
    }
  }
  function showGrade(g){
    if (!g) return;
    var q = state.question || {};
    var h = '';
    if (g.skipped) h = '<div class="result">スキップしました。</div>';
    else {
      var c = app.querySelector('.choices button[data-n="' + g.correctAnswer + '"]'); if (c) c.classList.add('correct');
      h = '<div class="result ' + (g.correct ? 'ok' : 'ng') + '">' + (g.correct ? '正解' : '不正解') + '（正答は ' + esc(g.correctAnswer) + '）</div>';
      if (safeUrl(g.answerPdfUrl)) h += '<div class="notice"><a href="' + esc(safeUrl(g.answerPdfUrl)) + '" target="_blank" rel="noopener">公式の正答PDF</a></div>';
    }
    h += '<div class="row">' + (g.skipped ? '' : '<button id="explain">解説を聞く</button>') + '<button id="next">次の問題へ</button></div>';
    app.insertAdjacentHTML('beforeend', h);
    var ex = document.getElementById('explain');
    if (ex) ex.onclick = function(){ ex.disabled = true; ask((q.year ? q.year + '年度 ' : '') + '問' + q.questionNumber + 'に ' + g.selected + ' と答え、' + (g.correct ? '正解' : '不正解（正答は ' + g.correctAnswer + '）') + 'でした。この問題を解説してください。'); };
    document.getElementById('next').onclick = async function(){
      if (state.next) { var n = state.next; state.next = null; render(n); window.scrollTo(0, 0); return; }
      render(await callTool('nextQuestion', { sessionId: state.sessionId }));
    };
  }
  window.addEventListener('message', function(e){
    var m = e.data; if (!m || m.jsonrpc !== '2.0') return;
    if (m.id != null && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; if (m.error) p.rej(m.error); else p.res(m.result); return; }
    if (m.method === 'ui/notifications/tool-input' && m.params && m.params.arguments && m.params.arguments.sessionId) state.sessionId = state.sessionId || m.params.arguments.sessionId;
    if (m.method === 'ui/notifications/tool-result' && m.params) render(full(m.params));
  });
  window.addEventListener('openai:set_globals', function(){ if (window.openai && window.openai.toolOutput && !state.question) render(openaiOutput()); });
  function openaiOutput(){ var o = window.openai; return (o.toolResponseMetadata && o.toolResponseMetadata.qlp) || o.toolOutput; }
  if (window.openai && window.openai.toolOutput) render(openaiOutput());
  else rpc('ui/initialize', { protocolVersion: '2025-06-18', appCapabilities: {}, appInfo: { name: 'qlp-question', version: '1' } }).then(function(){ notify('ui/notifications/initialized'); }).catch(function(){});
})();
</script></body></html>`;
}
