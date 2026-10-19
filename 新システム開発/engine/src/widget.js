/**
 * ChatGPT アプリ（MCP Apps / Apps SDK）の問題画面。
 * 問題文・図・選択肢は、エンジンが返した内容（structuredContent）だけでこの画面が描く。AIは中身を書き換えたり、別の図を足したりできない。
 * 回答の採点・次の問題もこの画面からエンジンを呼ぶ。解説だけをAIに頼む（「解説して」とチャットに送る）。
 */
export const WIDGET_URI = 'ui://qlp/question-v23.html';
export const WIDGET_MIME = 'text/html;profile=mcp-app';
export const WIDGET_VERSION = '2026-10-19.22';

/** 画面の HTML。 */
export function widgetHtml() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--fg:#1a1a1a;--sub:#555;--line:#ddd;--bg:#fff;--ok:#0a7d32;--ng:#c62828;--btn:#f4f4f4;--acc:#1557b0;--accbg:#eaf2fd}
@media (prefers-color-scheme:dark){:root{--fg:#eee;--sub:#aaa;--line:#444;--bg:#1e1e1e;--btn:#2a2a2a;--acc:#8ab4f8;--accbg:#22304a}}
body{margin:0;font:16px/1.7 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:var(--fg);background:var(--bg)}
#app{padding:12px 14px;min-height:120px;box-sizing:border-box}
h2{font-size:19px;font-weight:700;color:var(--acc);background:var(--accbg);margin:0 0 10px;padding:9px 12px;border-radius:10px;line-height:1.4}
.field{display:inline-block;color:var(--acc);background:var(--accbg);font-weight:700;font-size:15px;margin-bottom:8px;padding:3px 10px;border-radius:999px}
.stem{white-space:pre-wrap;margin:10px 0;font-size:17px;line-height:1.75}
.fig{margin:10px 0}.fig img{width:100%;height:auto;background:#fff;border:1px solid var(--line);border-radius:6px}
.choices{display:flex;flex-direction:column;gap:5px;margin:8px 0}
.choices button{display:flex;gap:12px;font-size:17px;text-align:left;font:inherit;color:var(--fg);background:var(--btn);border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer}
.choices .opt{display:flex;gap:8px;align-items:center;background:var(--btn);border:1px solid var(--line);border-radius:8px;padding:5px 10px;cursor:pointer}.choices .opt input{margin:0}.choices .opt.correct{border-color:var(--ok);border-width:2px}.choices .opt.picked{outline:2px solid var(--sub)}
.choices button b,.choices .opt b{min-width:1.7em;height:1.7em;line-height:1.7em;text-align:center;border-radius:50%;background:var(--acc);color:var(--bg);font-size:14px;flex:none}.choices .opt{font-size:16px;line-height:1.4}
.choices button:disabled{opacity:.6;cursor:default}
.choices button.correct{border-color:var(--ok);border-width:2px}.choices button.picked{outline:2px solid var(--sub)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.row button{font:inherit;font-size:16px;font-weight:600;padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--btn);color:var(--fg);cursor:pointer}
.row button#next,.row button#decide,.row button#startStudy{background:var(--acc);color:var(--bg);border-color:var(--acc)}
.notice{font-size:14px;color:var(--sub);white-space:pre-wrap;line-height:1.6;margin:6px 0}
.notice b{color:var(--fg);font-size:15px}
.result{font-weight:700;font-size:20px;margin:10px 0 6px;line-height:1.5;padding:8px 12px;border-radius:10px}.result.ok{color:var(--ok);background:#e7f6ec}.result.ng{color:var(--ng);background:#fdecec}
@media (prefers-color-scheme:dark){.result.ok{background:#16301f}.result.ng{background:#3a1d1d}}
.ov{margin:0 0 14px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ov-h{background:var(--accbg);color:var(--acc);font-size:20px;font-weight:700;padding:10px 14px;line-height:1.4}
.ov-b{padding:6px 14px 10px}
.ov-r{padding:8px 0;border-bottom:1px solid var(--line)}.ov-r:last-child{border-bottom:0}
.ov-r{display:grid;grid-template-columns:6.2em 1fr;gap:2px 10px;align-items:baseline}
.ov-r .ov-k{display:block}
.ov-r.major .ov-v{font-weight:700}
.ov-r.tone-date .ov-k{color:#1557b0}.ov-r.tone-score .ov-k{color:#0a7d32}.ov-r.tone-fee .ov-k{color:#b45309}.ov-r.tone-note .ov-k{color:#6b5b95}
.ov-r.minor .ov-k{font-weight:600}.ov-r.minor .ov-v{color:var(--sub)}
.ov-k{display:block;color:var(--acc);font-weight:700;font-size:16px}
.ov-v{display:block;font-size:16px;line-height:1.65}
.ov-l{margin:4px 0 0;padding-left:1.6em;font-size:16px}.ov-l li{margin:3px 0}
.ov-n{font-size:14px;color:var(--sub);padding-top:8px}
.ov-a{display:inline-block;margin-top:8px;font-size:15px;color:var(--acc);font-weight:700}
a{color:inherit}
.latest{font-size:13px;font-weight:700;color:var(--acc);background:var(--accbg);border-radius:8px;padding:4px 10px;margin-bottom:8px}
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
    if (!data || (!data.onboarding && !data.planReady && !data.menu && !data.question && !data.grade && !data.screen && !data.notice && !data.display && !data.error && !['waiting', 'finished', 'figure'].includes(data.status))) return;
    hasView = true;
    if (!diagged && (bridgeReady || (window.openai && window.openai.callTool))) { diagged = true; diag(data.onboarding ? 'render_onboarding' : data.question ? 'render_question' : 'render_other'); }
    if (data.grade && data.next) {
      if (state.question && !state.answered) { state.answered = true; showGrade(data.grade); state.next = data.next; return; }
      var g = data.grade; render(data.next);
      app.insertAdjacentHTML('afterbegin', '<div class="notice">前の問題：' + (g.skipped ? 'スキップ' : (g.correct ? '正解' : '不正解') + '（正答は ' + esc(g.correctAnswer) + '）') + '</div>');
      return;
    }
    if (data.planReady) { onboardOv = Object.assign({}, data.overview || {}, { fields: (data.plan && data.plan.fields) || [] }); studyLearner = data.learnerId || state.sessionId; planPanel([(data.plan && data.plan.note) || '']); return; }
    if (Array.isArray(data.onboarding) && data.onboarding.length) { onboardOv = data.overview || null; onboardSteps = data.onboarding; studyLearner = data.learnerId || state.sessionId; onboard(data.onboarding, []); return; }
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
    scrollUp();
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
    var h = '<h2>' + esc(m.prompt) + '</h2><div class="choices">' + m.choices.map(function(c, i){ return '<button data-n="' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(c) + '</span></button>'; }).join('') + '</div>';
    if (m.notice) h += '<div class="notice">' + esc(m.notice) + '</div>';
    app.innerHTML = h;
    app.querySelectorAll('.choices button').forEach(function(b){ b.onclick = function(){
      var n = b.getAttribute('data-n'), c = m.choices[n - 1];
      app.innerHTML = '<div class="notice">' + esc(m.prompt) + '</div><div class="result ok">' + esc(n + '：' + c) + '</div>';
      ask(n + '：' + c);
    }; });
  }
  // 学習の始めの確認（免除・学習状況）を順にボタンで聞き、答えをまとめてチャットに送る
  var onboardOv = null, studyLearner = null, onboardSteps = null;
  // 概要の強弱：大事な項目（日時・試験時間・方式・合格基準）は大きく太く、そこまで必要でない項目（手数料・申込・発表など）は小さく控えめに
  var OV_MAJOR = /^(試験日|試験日時|試験日及び時間|試験時間|試験の方法|試験方法|出題形式|合格基準|合格基準点|実施方式|試験方式)/;
  var OV_MINOR = /^(受験手数料|受験申込|実施公告|試験の基準|合格後|試験地|試験場所|合格発表|登録|試験の一部|法令基準日|出題基準日|対象年度|実施|資格名|受験資格|試験科目|試験の対象|試験科目・出題範囲)/;
  // 色は項目の種類ごとに分ける（日時＝青、合格基準＝緑、費用＝橙、補足＝紫）
  function ovTone(k){ return /日|時間|期間|申込|発表/.test(k) ? 'tone-date' : /合格基準|配点|点/.test(k) ? 'tone-score' : /手数料|料/.test(k) ? 'tone-fee' : /基準日|対象年度|実施|資格名|試験地|受験資格/.test(k) ? 'tone-note' : ''; }
  function ovHtml(){
    if (!onboardOv) return '';
    var rows = '', list = null, note = '';
    (onboardOv.lines || []).forEach(function(l){
      l = String(l);
      if (l.charAt(0) === '※') { note = l; return; }
      var m = l.match(/^[\\u3000 ]+\\d+\\.\\s*(.*)$/);
      if (m) { if (list) list.push(m[1]); return; }
      var i = l.indexOf('：');
      if (i < 0) { rows += '<div class="ov-r"><span class="ov-v">' + esc(l) + '</span></div>'; return; }
      var k = l.slice(0, i), v = l.slice(i + 1);
      if (!v) { list = []; rows += '<div class="ov-r"><span class="ov-k">' + esc(k) + '</span>@@LIST@@</div>'; return; }
      rows += '<div class="ov-r ' + (OV_MAJOR.test(k) ? 'major' : OV_MINOR.test(k) ? 'minor' : '') + ' ' + ovTone(k) + '"><span class="ov-k">' + esc(k) + '</span><span class="ov-v">' + esc(v) + '</span></div>';
    });
    if (list) rows = rows.replace('@@LIST@@', '<ol class="ov-l">' + list.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>');
    var link = safeUrl(onboardOv.source) ? '<a class="ov-a" href="' + esc(safeUrl(onboardOv.source)) + '" target="_blank" rel="noopener">公式ページを開く ›</a>' : '';
    return '<div class="ov"><div class="ov-h">' + esc(onboardOv.title || '') + '</div><div class="ov-b">' + rows + (note ? '<div class="ov-n">' + esc(note) + '</div>' : '') + link + '</div></div>';
  }
  // 学習計画（エンジンが出す）。ボタンを押すと、エンジンが学習の開始を記録し、最初の問題を出す。ChatGPTに次の呼び出しを任せない
  function planPanel(got){
    var ov = onboardOv || {};
    var first = (ov.fields || [])[0] || '';
    var order = '<ol class="ov-l">' + (ov.fields || []).map(function(f){ return '<li>' + esc(f) + '</li>'; }).join('') + '</ol>';
    app.innerHTML = '<h2>学習計画</h2><div class="notice">' + esc(got.join('／')) + '</div>' +
      '<div class="stem"><b>最初に学習する分野：</b>' + esc(first) + '</div>' +
      (ov.review ? '<div class="notice"><b>復習の間隔：</b>' + esc(ov.review) + '（希望を伝えると変えられます）</div>' : '') +
      '<div class="notice">公式の出題分野の順です。過去問の取り込みが進むと、出題数の多い順に並べ直します。</div>' +
      '<div class="stem"><b>学習する分野の順</b></div>' + order +
      '<div class="notice">この計画で始めるか、希望を伝えて作り直せます。</div>' +
      '<div class="choices"><button id="startStudy" data-n="1"><b>1</b><span>この計画で始めます</span></button><button id="diag" data-n="2"><b>2</b><span>初期診断で苦手分野を調べる（おすすめ）</span></button><button id="revise" data-n="3"><b>3</b><span>希望を伝えて作り直す</span></button></div>' +
      '<div id="reviseBox" style="display:none"><div class="notice">復習の間隔、学習する分野の順、その他の希望を書いてください（空のままなら、おまかせで作り直します）。</div>' +
      '<textarea id="wish" rows="3" style="width:100%;box-sizing:border-box;font:inherit;color:var(--fg);background:var(--btn);border:1px solid var(--line);border-radius:8px;padding:8px"></textarea>' +
      '<div class="row"><button id="sendWish">この希望で作り直す</button></div></div>';
    scrollUp();
    document.getElementById('startStudy').onclick = function(){ startStudyNow(ov.name, studyLearner); };
    document.getElementById('diag').onclick = async function(){
      app.querySelectorAll('button').forEach(function(b){ b.disabled = true; });
      try { render(await callTool('nextQuestion', { sessionId: studyLearner, question: '初期診断' })); }
      catch (e) { app.querySelectorAll('button').forEach(function(b){ b.disabled = false; }); app.insertAdjacentHTML('beforeend', '<div class="notice">初期診断を始められませんでした。もう一度押してください。</div>'); }
    };
    document.getElementById('revise').onclick = function(){ var b = document.getElementById('reviseBox'); b.style.display = b.style.display === 'none' ? 'block' : 'none'; };
    document.getElementById('sendWish').onclick = function(){
      var wish = (document.getElementById('wish').value || '').trim() || 'おまかせ';
      app.insertAdjacentHTML('beforeend', '<div class="notice"><b>希望をチャットに送りました。</b>作り直した計画は、この画面の下のチャットに出ます。下へスクロールして、承認か手直しを選んでください。</div>');
      ask('学習計画の希望：' + wish + '\\n【順番】この希望と、試験概要・出題数・学習状況を踏まえて、学習計画を柔軟に立て直し、始める分野・進め方・復習の間隔を示す（復習の間隔は利用者の希望に合わせ、無ければAI調整型）。計画の承認は文章で聞かず、必ず showMenu（kind=plan）を呼んで「承認して始める」「手直しする」のボタンで選んでもらう。承認のボタンが押されたら startStudy を呼ぶ。');
    };
  }
  async function startStudyNow(name, learner){
    app.querySelectorAll('button').forEach(function(b){ b.disabled = true; });
    try {
      var r = await callTool('startStudy', { qualificationName: name, learnerId: learner });
      if (!r || r.error) { app.insertAdjacentHTML('beforeend', '<div class="notice">' + esc((r && r.hint) || '学習を始められませんでした。もう一度押してください。') + '</div>'); app.querySelectorAll('button').forEach(function(b){ b.disabled = false; }); return; }
      app.insertAdjacentHTML('afterbegin', '<div class="notice" style="white-space:pre-wrap">' + esc(r.display || '') + '</div>');
      render(await callTool('nextQuestion', { sessionId: learner }));
    } catch (e) {
      app.insertAdjacentHTML('beforeend', '<div class="notice">学習を始められませんでした。もう一度押してください。</div>');
      app.querySelectorAll('button').forEach(function(b){ b.disabled = false; });
    }
  }
  function onboard(steps, got){
    var m = steps[got.length];
    if (!m) { planPanel(got); return; }
    var h = ovHtml() + '<h2>' + esc(m.prompt) + '</h2><div class="choices">' + m.choices.map(function(c, i){ return '<button data-n="' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(c) + '</span></button>'; }).join('') + '</div>';
    if (m.notice) h += '<div class="notice">' + esc(m.notice) + '</div>';
    app.innerHTML = h;
    scrollUp();
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
    scrollUp();
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
  // 新しい場面は枠の上から見せる（枠の中で下にスクロールしたままだと、上の内容が見えない）
  // 新しい場面の一番上に印を付け、どこが最新の表示か分かるようにする
  function scrollUp(){
    try { window.scrollTo(0, 0); } catch (e) {}
    var mark = document.createElement('div');
    mark.className = 'latest';
    mark.textContent = '▼ ここが最新の表示です';
    app.insertBefore(mark, app.firstChild);
  }
  // 画面の実際の高さ（#app）で測る。documentElement.scrollHeight は枠の高さを下回らないので、内容が短くなっても枠が縮まなかった
  function fit(){
    var h = Math.ceil(app.offsetHeight) + 2;
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
