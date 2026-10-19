/**
 * ChatGPT アプリ（MCP Apps / Apps SDK）の問題画面。
 * 問題文・図・選択肢は、エンジンが返した内容（structuredContent）だけでこの画面が描く。AIは中身を書き換えたり、別の図を足したりできない。
 * 回答の採点・次の問題もこの画面からエンジンを呼ぶ。解説だけをAIに頼む（「解説して」とチャットに送る）。
 */
export const WIDGET_URI = 'ui://qlp/question-v2.html';
export const WIDGET_MIME = 'text/html;profile=mcp-app';
export const WIDGET_VERSION = '2026-10-19.1';

/** 画面の HTML。 */
export function widgetHtml() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--fg:#1a1a1a;--sub:#555;--line:#ddd;--bg:#fff;--ok:#0a7d32;--ng:#c62828;--btn:#f4f4f4}
@media (prefers-color-scheme:dark){:root{--fg:#eee;--sub:#aaa;--line:#444;--bg:#1e1e1e;--btn:#2a2a2a}}
body{margin:0;font:16px/1.7 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--fg);background:var(--bg)}
#app{padding:12px 14px;min-height:120px;box-sizing:border-box}
h2{font-size:17px;margin:0 0 6px}
.field{color:var(--sub);font-size:14px;margin-bottom:8px}
.stem{white-space:pre-wrap;margin:8px 0}
.fig{margin:10px 0}.fig img{width:100%;height:auto;background:#fff;border:1px solid var(--line);border-radius:6px}
.choices{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.choices button{display:flex;gap:10px;text-align:left;font:inherit;color:var(--fg);background:var(--btn);border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer}
.choices .opt{display:flex;gap:10px;align-items:flex-start;background:var(--btn);border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer}.choices .opt input{margin-top:6px}.choices .opt.correct{border-color:var(--ok);border-width:2px}.choices .opt.picked{outline:2px solid var(--sub)}
.choices button b{min-width:1.2em}
.choices button:disabled{opacity:.6;cursor:default}
.choices button.correct{border-color:var(--ok);border-width:2px}.choices button.picked{outline:2px solid var(--sub)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.row button{font:inherit;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--fg);cursor:pointer}
.notice{font-size:13px;color:var(--sub);white-space:pre-wrap}
.result{font-weight:700;font-size:17px;margin:10px 0 4px}.result.ok{color:var(--ok)}.result.ng{color:var(--ng)}
a{color:inherit}
</style></head><body><div id="app" aria-live="polite"><h2>資格学習</h2><p>学習画面を読み込んでいます…</p><div class="notice">表示されない場合は「画面が表示されない」とチャットに入力してください。</div></div>
<script>
(function(){
  var app = document.getElementById('app');
  var state = { sessionId: null, question: null, answered: false };
  var pending = {}, rid = 1, bridgeReady = false, hasView = false;
  function rpc(method, params){ return new Promise(function(res, rej){
    var id = rid++;
    var timer = setTimeout(function(){ delete pending[id]; rej(new Error('通信が時間切れになりました')); }, method === 'ui/initialize' ? 5000 : 20000);
    pending[id] = { res: res, rej: rej, timer: timer };
    window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params }, '*');
  }); }
  function notify(method, params){ window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*'); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u){ return /^https:\\/\\//.test(String(u || '')) ? String(u) : ''; }
  async function callTool(name, args){
    var r = bridgeReady ? await rpc('tools/call', { name: name, arguments: args }) : (window.openai && window.openai.callTool) ? await window.openai.callTool(name, args) : await ready.then(function(){ return rpc('tools/call', { name: name, arguments: args }); });
    return full(r);
  }
  async function ask(text){
    try {
      if (bridgeReady) return await rpc('ui/message', { role: 'user', content: [{ type: 'text', text: text }] });
      if (window.openai && window.openai.sendFollowUpMessage) return await window.openai.sendFollowUpMessage({ prompt: text });
      await ready;
      return await rpc('ui/message', { role: 'user', content: [{ type: 'text', text: text }] });
    } catch (e) {
      // 送信を勝手に再試行しない。選択済みの正確な文をコピーして続行できる。
      app.insertAdjacentHTML('beforeend', '<div class="notice">選択内容を送信できませんでした。次の文をチャットに入力してください。</div><div class="stem">' + esc(text) + '</div>');
    }
  }
  // 画面用の全文は _meta.qlp（AIには渡らない）、無ければ structuredContent
  function full(r){ return r && ((r._meta && r._meta.qlp) || r.structuredContent || r); }
  function input(){ return (window.openai && window.openai.toolInput) || {}; }
  // 診断：画面が動いたことを、エンジンの記録に残す（中身は送らない）。iPhone のアプリで画面が出ない原因を調べるため
  function diag(k){
    // 学習用メニューのスキーマ外の値を送らない。初期化完了後の専用ツールのみ。
    var args = { stage: k, version: '${WIDGET_VERSION}' };
    if (!bridgeReady && !(window.openai && window.openai.callTool)) return;
    callTool('reportUiEvent', args).catch(function(){});
  }
  var diagged = false;
  function render(data){
    if (!data || (!data.onboarding && !data.menu && !data.question && !data.grade && !data.screen && !data.notice && !data.display && !data.error && !['waiting', 'finished', 'figure'].includes(data.status))) return;
    hasView = true;
    if (!diagged && (bridgeReady || (window.openai && window.openai.callTool))) { diagged = true; diag(data.onboarding ? 'render_onboarding' : data.question ? 'render_question' : 'render_other'); }
    if (data.grade && data.next) {
      if (state.question && !state.answered) { state.answered = true; showGrade(data.grade); state.next = data.next; return; }
      var g = data.grade; render(data.next);
      app.insertAdjacentHTML('afterbegin', '<div class="notice">前の問題：' + (g.skipped ? 'スキップ' : (g.correct ? '正解' : '不正解') + '（正答は ' + esc(g.correctAnswer) + '）') + '</div>');
      return;
    }
    if (Array.isArray(data.onboarding) && data.onboarding.length) { onboardOv = data.overview || null; onboard(data.onboarding, []); return; }
    if (data.menu) { showMenu(data.menu); return; }
    if (typeof data.handoff === 'string' && typeof data.display === 'string') { showEnd(data); return; }
    if (data.sessionId) state.sessionId = data.sessionId;
    if (!state.sessionId && input().sessionId) state.sessionId = input().sessionId;
    if (data.status === 'figure' && (data.figureUrls || []).length) {
      var fh = '<div class="notice">' + esc(data.screen || '') + '</div>';
      data.figureUrls.forEach(function(u, i){ if (safeUrl(u)) fh += '<div class="fig"><img alt="公式の問題の図' + (i + 1) + '" src="' + esc(safeUrl(u)) + '"></div>'; });
      app.innerHTML = fh; return;
    }
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
    h += '<div class="choices">' + (q.choices || []).map(function(c, i){ var n = i + 1; return '<label class="opt" data-n="' + n + '"><input type="radio" name="ans" value="' + n + '"><b>' + n + '</b><span>' + esc(c) + '</span></label>'; }).join('') + '</div>';
    h += '<div class="row"><label><input type="checkbox" id="guess"> 勘で選んだ</label><button id="skip">スキップ</button></div><div class="row" id="decrow" style="display:none"><button id="decide">解答する</button></div>';
    if (safeUrl(q.questionPdfUrl)) h += '<div class="notice">原本：<a href="' + esc(safeUrl(q.questionPdfUrl)) + '" target="_blank" rel="noopener">公式の問題PDF</a></div>';
    (q.notices || []).forEach(function(t){ h += '<div class="notice">' + esc(t) + '</div>'; });
    app.innerHTML = h;
    // 選択肢はラジオで選ぶ。選ぶと「解答する」ボタンが出る（触れただけでは採点しない）
    var chosen = null;
    app.querySelectorAll('input[name=ans]').forEach(function(r){ r.onchange = function(){
      chosen = r.value; document.getElementById('decrow').style.display = 'flex';
    }; });
    document.getElementById('decide').onclick = function(){ if (chosen) answer(chosen); };
    document.getElementById('skip').onclick = function(){ answer('スキップ'); };
  }
  // 学習の終了：終了ログと引継ぎデータの全文を、そのまま出す（コピーできる）
  function showEnd(d){
    app.innerHTML = '<h2>学習を終了しました</h2><div class="stem">' + esc(d.log || '') + '</div><h2>引継ぎデータ</h2><div class="notice">次のチャットで貼り付けるか、引継ぎIDを伝えると再開できます。</div><textarea id="ho" readonly rows="10" style="width:100%;box-sizing:border-box;font:13px/1.5 monospace;background:var(--btn);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px"></textarea><div class="row"><button id="cp">引継ぎデータをコピー</button></div>';
    var ta = document.getElementById('ho'); ta.value = d.handoff;
    document.getElementById('cp').onclick = function(){
      var b = document.getElementById('cp');
      var done = function(){ b.textContent = 'コピーしました'; };
      try { navigator.clipboard.writeText(d.handoff).then(done, function(){ ta.select(); document.execCommand('copy'); done(); }); }
      catch (e) { ta.select(); try { document.execCommand('copy'); } catch (e2) {} done(); }
    };
  }
  // 番号で選ぶ確認は、押せるボタンで出す（押したら結果の1行に縮め、選んだ内容をチャットに送る）
  function showMenu(m){
    var h = ovHtml() + '<h2>' + esc(m.prompt) + '</h2><div class="choices">' + m.choices.map(function(c, i){ return '<button data-n="' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(c) + '</span></button>'; }).join('') + '</div>';
    if (m.notice) h += '<div class="notice">' + esc(m.notice) + '</div>';
    app.innerHTML = h;
    app.querySelectorAll('.choices button').forEach(function(b){ b.onclick = function(){
      var n = b.getAttribute('data-n'), c = m.choices[n - 1];
      app.innerHTML = '<div class="notice">' + esc(m.prompt) + '</div><div class="result ok">' + esc(n + '：' + c) + '</div>';
      ask(n + '：' + c);
    }; });
  }
  // 学習の始めの確認（免除・学習状況）を順にボタンで聞き、答えをまとめてチャットに送る
  var onboardOv = null;
  function ovHtml(){ if (!onboardOv) return ''; return '<div class="notice"><b>' + esc(onboardOv.title || '') + '</b><br>' + (onboardOv.lines || []).map(esc).join('<br>') + '</div>'; }
  function onboard(steps, got){
    var m = steps[got.length];
    if (!m) { app.innerHTML = '<div class="result ok">' + esc(got.join('／')) + '</div>'; ask(got.join('／')); return; }
    var h = '<h2>' + esc(m.prompt) + '</h2><div class="choices">' + m.choices.map(function(c, i){ return '<button data-n="' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(c) + '</span></button>'; }).join('') + '</div>';
    if (m.notice) h += '<div class="notice">' + esc(m.notice) + '</div>';
    app.innerHTML = h;
    app.querySelectorAll('.choices button').forEach(function(b){ b.onclick = function(){
      var c = m.choices[b.getAttribute('data-n') - 1];
      onboard(steps, got.concat([(m.kind === 'exempt' ? '免除：' : '学習状況：') + c]));
    }; });
  }
  async function answer(v){
    if (state.answered || !state.question) return;
    state.answered = true;
    app.querySelectorAll('button,input').forEach(function(b){ b.disabled = true; });
    var picked = app.querySelector('.choices .opt[data-n="' + v + '"]'); if (picked) picked.classList.add('picked');
    var guess = document.getElementById('guess');
    try {
      var r = await callTool('submitAnswer', { sessionId: state.sessionId, questionId: state.question.questionId, value: String(v), confidence: guess && guess.checked ? 'guess' : 'sure' });
      if (r && (r.error === 'DAILY_LIMIT' || r.error === 'ACCESS_CODE_REQUIRED')) {
        state.answered = false;
        app.insertAdjacentHTML('beforeend', '<div class="notice">' + esc(String(r.hint || '').replace(/（.*$/, '')) + '</div>');
        return;
      }
      showGrade(r && r.grade); state.next = r && r.next;
    } catch (e) {
      state.answered = false; app.querySelectorAll('button,input').forEach(function(b){ b.disabled = false; });
      app.insertAdjacentHTML('beforeend', '<div class="notice">採点できませんでした。もう一度押してください。</div>');
    }
  }
  function showGrade(g){
    if (!g) return;
    var q = state.question || {};
    var h = '';
    if (g.skipped) h = '<div class="result">スキップしました。</div>';
    else {
      var c = app.querySelector('.choices .opt[data-n="' + g.correctAnswer + '"]'); if (c) c.classList.add('correct');
      h = '<div class="result ' + (g.correct ? 'ok' : 'ng') + '">' + (g.correct ? '正解' : '不正解') + '（あなたの答え ' + esc(g.selected) + '／正答は ' + esc(g.correctAnswer) + '）</div>';
      if (safeUrl(g.answerPdfUrl)) h += '<div class="notice"><a href="' + esc(safeUrl(g.answerPdfUrl)) + '" target="_blank" rel="noopener">公式の正答PDF</a></div>';
    }
    // 同じ分野で3問続けて間違えたら、確認問題で基本を確かめるかを聞く（マスタープロンプトどおり。AIはこの採点を見ないので画面から頼む）
    if (g.checkSuggested) h += '<div class="notice"><b>同じ分野で3問続けて間違えました。</b>確認問題（AIが作った短い問題）で基本を確かめますか？</div><div class="row"><button id="check">確認問題で基本を確かめる</button></div>';
    var label = (q.year ? q.year + '年度 ' : '') + '問' + q.questionNumber;
    var nextBtn = function(){
      document.getElementById('next').onclick = async function(){
        if (state.next) { var n = state.next; state.next = null; render(n); window.scrollTo(0, 0); return; }
        render(await callTool('nextQuestion', { sessionId: state.sessionId }));
      };
    };
    if (g.skipped) {
      app.insertAdjacentHTML('beforeend', h + '<div class="row"><button id="next">次の問題へ</button></div>');
      nextBtn();
      return;
    }
    // 採点のあと：この画面は結果の1行に縮め、簡単な理由→「詳しい解説／次の問題へ」のボタンはチャットの下に出す（AIが書く）
    app.innerHTML = '<div class="result ' + (g.correct ? 'ok' : 'ng') + '">' + esc(label) + '：' + (g.correct ? '正解' : '不正解') + '（あなたの答え ' + esc(g.selected) + '／正答は ' + esc(g.correctAnswer) + '）</div>' + (g.checkSuggested ? '<div class="notice"><b>同じ分野で3問続けて間違えました。</b>下のボタンで確認問題も選べます。</div>' : '');
    var stem = '問題文：' + (q.stem || '（公式の問題の画面を参照）') + '\\n' + (q.choices || []).map(function(c, i){ return (i + 1) + ' ' + c; }).join('\\n');
    ask(label + '（' + (q.fieldName || '') + '）に ' + g.selected + ' と答え、' + (g.correct ? '正解' : '不正解（正答は ' + g.correctAnswer + '）') + 'でした。\\n'
      + '【順番】①まず、なぜその答えになるのかの簡単な理由を2〜3文で書く（正解でも不正解でも。図は新しく出さない・探さない）。②書いたら最後に showMenu（kind=review）を呼び、ボタンが押されるまで待つ（選択肢をチャットに書かない）。'
      + '③「詳しい解説」が押されたら、法的根拠（条文・判例など）を示した詳しい解説を、下の「詳しい解説の書き方」で書き、最後に showMenu（kind=next）を呼ぶ。④「次の問題へ」が押されたら nextQuestion を呼ぶ。'
      + (g.checkSuggested ? '⑤同じ分野で3問続けて間違えたので、②のあとに「確認問題で基本を確かめる」も選べるようにしたい。選ばれたらAIが作った確認問題（そうと明示）を出し、答え合わせのあと showMenu（kind=next）を呼ぶ。' : '')
      + '\\n' + stem + (g.explainHow ? '\\n\\n詳しい解説の書き方（エンジンの指定）：\\n' + g.explainHow : ''));
  }
  window.addEventListener('message', function(e){
    if (e.source !== window.parent) return;
    var m = e.data; if (!m || m.jsonrpc !== '2.0') return;
    if (m.id != null && !m.method && pending[m.id]) { var p = pending[m.id]; clearTimeout(p.timer); delete pending[m.id]; if (m.error) p.rej(m.error); else p.res(m.result); return; }
    if (m.method === 'ui/notifications/tool-input' && m.params && m.params.arguments && m.params.arguments.sessionId) state.sessionId = state.sessionId || m.params.arguments.sessionId;
    if (m.method === 'ui/notifications/tool-result' && m.params) render(full(m.params));
  });
  // 画面の高さをアプリ側に伝える（iPhone のアプリで、枠だけ出て中身が出ないのを防ぐ）
  function fit(){
    var h = Math.ceil(document.documentElement.scrollHeight);
    try { if (window.openai && window.openai.notifyIntrinsicHeight) window.openai.notifyIntrinsicHeight(h); } catch (e) {}
    if (bridgeReady) notify('ui/notifications/size-changed', { width: window.innerWidth, height: h });
  }
  try { new ResizeObserver(fit).observe(app); } catch (e) {}
  fit();
  window.addEventListener('openai:set_globals', function(){ if (!bridgeReady && window.openai && !state.question) render(openaiOutput()); });
  function openaiOutput(){ var o = window.openai; return (o.toolResponseMetadata && o.toolResponseMetadata.qlp) || o.toolOutput; }
  // MCP本体のバージョンとMCP Apps UIのバージョンは別。部分的なopenai.toolOutputがあっても初期化する。
  var ready = rpc('ui/initialize', { protocolVersion: '2026-01-26', appCapabilities: {}, appInfo: { name: 'qlp-question', version: '${WIDGET_VERSION}' } }).then(function(){
    bridgeReady = true;
    notify('ui/notifications/initialized', {});
    fit();
    diag('bridge_ready');
  });
  ready.catch(function(){
    if (window.openai) { render(openaiOutput()); diag('legacy_ready'); }
    if (!hasView) unavailable();
  });
  function unavailable(){ app.innerHTML = '<h2>資格学習</h2><div class="notice">学習画面との接続を確認できませんでした。「画面が表示されない」とチャットに入力してください。</div>'; fit(); }
  if (window.openai) render(openaiOutput());
  setTimeout(function(){ if (!hasView) unavailable(); }, 10000);
})();
</script></body></html>`;
}
