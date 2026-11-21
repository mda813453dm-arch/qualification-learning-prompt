// v205: 画面（学習枠の中身）が切り替わったら、利用者に新しい内容の先頭を見せる。
// - 先頭の目印「▼ ここが最新の表示です」へ focus（従来どおり preventScroll）。
// - 利用者が枠内で操作した直後だけ、目印が ChatGPT の画面外（上）にある場合に限り
//   目印を画面上端へスクロールして表示する。目印が見えていれば一切スクロールしない。
//   （旧版の Android Brave 不具合＝操作していない古い枠や前の採点位置へ会話が動く、を避けるため
//    描画と高さ調整が落ち着いた後に、可視判定してから1回だけ行う）
// - scrollUp を呼ばない画面切替も MutationObserver で拾い、同じ処理を行う。
// 採点・出題・記録・図表の順序には触れない。v204 以前の画面は変更しない。
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v204.js';
export const WIDGET_URI = 'ui://qlp/question-v205.html';
export const WIDGET_VERSION = '2026-11-21.205';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml(){
  const before = previousHtml();
  let html = before.replaceAll('2026-11-20.204', WIDGET_VERSION);
  if (html === before) throw new Error('V205_VERSION_MARKER_MISSING');
  function replaceOnce(anchor, target, code) {
    if (html.split(anchor).length !== 2) throw new Error(code);
    html = html.replace(anchor, target);
  }

  const lastAlign = "    setTimeout(function(){ if (turn === latestFocusTurn) { fit(); align(); } }, 320);\n  }\n";
  replaceOnce(lastAlign, lastAlign.replace('\n  }\n', '\n') + String.raw`    // v205: 高さ調整（320ms）の後、利用者の操作直後に限り先頭が見えるようにする。
    setTimeout(function(){ if (turn === latestFocusTurn) revealLatest(latest); }, 450);
  }
  // v205: 利用者が枠内で操作した時刻。操作していない描画（初回表示・取込状況の更新など）では
  // 会話をスクロールしない。1回の操作につき可視判定は1回だけ。
  var qlpUserActionAt = 0, qlpRevealedActionAt = 0;
  ['pointerdown','click','keydown','change','submit'].forEach(function(type){
    try { document.addEventListener(type, function(){ qlpUserActionAt = Date.now(); }, true); } catch(e) {}
  });
  function revealLatest(latest){
    if (locked || !latest || !latest.isConnected) return;
    if (!qlpUserActionAt || qlpUserActionAt === qlpRevealedActionAt) return;
    if (Date.now() - qlpUserActionAt > 60000) return;
    if (app.querySelector('.old-screen') || app.classList.contains('is-old')) return;
    if (typeof IntersectionObserver !== 'function' || typeof latest.scrollIntoView !== 'function') return;
    qlpRevealedActionAt = qlpUserActionAt;
    var done = false;
    var io = new IntersectionObserver(function(entries){
      if (done) return; done = true;
      try { io.disconnect(); } catch(e) {}
      var e0 = entries && entries[0];
      // 目印が表示範囲に入っていれば、利用者は切替を確認できるので動かさない。
      if (!e0 || (e0.isIntersecting && e0.intersectionRatio > 0.9)) return;
      // 目印が画面より下にある（枠の先頭はまだ見えていない新しい枠）場合も動かさない。
      if (e0.boundingClientRect && e0.rootBounds && e0.boundingClientRect.top > e0.rootBounds.bottom) return;
      if (locked || !latest.isConnected) return;
      try { latest.scrollIntoView({ block: 'start', inline: 'nearest' }); } catch(x) { try { latest.scrollIntoView(true); } catch(y) {} }
      try { latest.focus({ preventScroll: true }); } catch(x) {}
    });
    try { io.observe(latest); } catch(e) { done = true; }
  }
  // v205: scrollUp を呼ばない画面切替（ボタン処理で直接 app.innerHTML を書き換える画面）も
  // 先頭の目印を付けて focus する。入力欄に入力中のときは focus を奪わない。
  try {
    if (app && typeof MutationObserver === 'function') new MutationObserver(function(){
      if (locked || !app.firstElementChild) return;
      if (app.firstElementChild.classList && app.firstElementChild.classList.contains('latest')) return;
      if (app.querySelector('.old-screen') || app.classList.contains('is-old')) return;
      var ae = document.activeElement;
      if (ae && ae !== document.body && app.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      scrollUp();
    }).observe(app, { childList: true });
  } catch(e) {}
`, 'V205_SCROLLUP_ANCHOR_MISSING');

  if (html.split('</head>').length !== 2) throw new Error('V205_HEAD_ANCHOR_MISSING');
  html = html.replace('</head>',
    '<style id="qlp-v205-focus">.latest{scroll-margin-top:72px}</style>' +
    '<meta name="qlp-focus-v205" content="focus-latest-and-reveal-after-user-action"></head>');
  return html;
}
