// v205: 画面（学習枠の中身）が切り替わったら、新しい内容の先頭を利用者が見ている位置に出す。
// - iPhone（WebKit）では、別オリジンの学習枠から ChatGPT の会話を scrollIntoView / focus で
//   動かせない（WebKit の試験で確認）。Android Brave では逆に会話が古い位置へ動く不具合があった。
//   そのため会話側は従来どおり一切スクロールせず、枠の中で新しい内容の先頭を
//   「ボタンを押した時に画面に見えていた位置」へ下げて表示する（枠の上側は余白になる）。
// - 先頭の目印「▼ ここが最新の表示です」へ focus（従来どおり preventScroll）。
// - 利用者が枠内で操作した後の画面切替だけが対象。初回表示・取込状況の自動更新では位置を変えない。
//   枠の先頭が画面に見えている時は余白を付けない（従来どおり先頭から表示）。
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

  const scrollUpHead = "  function scrollUp(noMark){\n    if (!app || typeof app.querySelector !== 'function') return;\n";
  replaceOnce(scrollUpHead, scrollUpHead +
    "    // v205: 操作後の切替では、新しい内容の先頭を利用者が見ていた位置に置く（描画前に同期で行う）。\n" +
    "    qlpPlaceAtView();\n", 'V205_SCROLLUP_ANCHOR_MISSING');
  // 描画後の位置合わせ（直後・120ms・320ms）でも置き直す。処理中の帯が消えて #app が上がった場合の補正。
  const alignHead = "    function align(){\n      if (turn !== latestFocusTurn || locked || !latest.isConnected) return;\n";
  replaceOnce(alignHead, alignHead + "      qlpPlaceAtView();\n", 'V205_ALIGN_ANCHOR_MISSING');

  const latestTurn = '  var latestFocusTurn = 0;\n';
  replaceOnce(latestTurn, String.raw`  // v205: 枠の中で、ChatGPT 画面に見えている範囲の上端（枠の文書の先頭からの距離, px）。
  // 別オリジンの枠でも IntersectionObserver の交差範囲は最上位の表示範囲で切り取られるので分かる。
  // 会話のスクロールで変わるため、細かい閾値で常に追い、操作の瞬間にも測り直す。
  var qlpVisibleTop = null, qlpActionVisibleTop = null, qlpUserActionAt = 0;
  var QLP_VIEW_GAP = 16;
  function qlpReadVisibleTop(e0){
    if (!e0 || !e0.intersectionRect || !(e0.intersectionRect.height > 0)) return null;
    // 枠の文書座標（枠の文書の先頭からの距離）で持つ。処理中の帯の出入りで #app がずれても使える。
    return Math.max(0, e0.intersectionRect.top + (window.scrollY || 0));
  }
  try {
    if (typeof IntersectionObserver === 'function') {
      var qlpThresholds = []; for (var qi = 0; qi <= 200; qi++) qlpThresholds.push(qi / 200);
      new IntersectionObserver(function(entries){
        var v = qlpReadVisibleTop(entries && entries[entries.length - 1]);
        qlpVisibleTop = v;
      }, { threshold: qlpThresholds }).observe(app);
    }
  } catch(e) {}
  function qlpOnUserAction(){
    qlpUserActionAt = Date.now();
    qlpActionVisibleTop = qlpVisibleTop;
    if (typeof IntersectionObserver !== 'function') return;
    try {
      var at = qlpUserActionAt;
      var once = new IntersectionObserver(function(entries){
        try { once.disconnect(); } catch(e) {}
        var v = qlpReadVisibleTop(entries && entries[0]);
        if (at === qlpUserActionAt && v !== null) qlpActionVisibleTop = v;
      });
      once.observe(app);
    } catch(e) {}
  }
  ['pointerdown','click','keydown','submit'].forEach(function(type){
    try { document.addEventListener(type, qlpOnUserAction, true); } catch(e) {}
  });
  function qlpBasePad(){
    if (!app.dataset.qlpBasePad) {
      var prev = app.style.paddingTop; app.style.paddingTop = '';
      app.dataset.qlpBasePad = String(parseFloat(getComputedStyle(app).paddingTop) || 0);
      app.style.paddingTop = prev;
    }
    return Number(app.dataset.qlpBasePad) || 0;
  }
  function qlpPlaceAtView(){
    if (locked || app.classList.contains('is-old') || app.querySelector('.old-screen')) { app.style.paddingTop = ''; return; }
    if (!qlpUserActionAt || Date.now() - qlpUserActionAt > 60000) return;
    var v = qlpActionVisibleTop;
    if (v === null || !(v >= 0)) return;
    var base = qlpBasePad();
    // 枠の先頭が見えていれば余白は不要。見えていなければ、見ていた位置の少し下に新しい内容の先頭を置く。
    var appTop = app.getBoundingClientRect().top + (window.scrollY || 0);
    var pad = v > appTop + 1 ? Math.round(v - appTop + QLP_VIEW_GAP) : 0;
    app.style.paddingTop = pad > base ? pad + 'px' : '';
    app.classList.toggle('qlp-placed-at-view', pad > base);
  }
` + latestTurn, 'V205_LATEST_TURN_ANCHOR_MISSING');

  // scrollUp を呼ばない画面切替（ボタン処理で直接 app.innerHTML を書き換える画面）も
  // 先頭の目印を付けて focus する。入力欄に入力中のときは focus を奪わない。
  const fitAnchor = '  try { new ResizeObserver(fit).observe(app); } catch (e) {}\n';
  replaceOnce(fitAnchor, fitAnchor + String.raw`  try {
    if (app && typeof MutationObserver === 'function') new MutationObserver(function(){
      if (!app.firstElementChild) return;
      if (locked || app.classList.contains('is-old') || app.querySelector('.old-screen')) { app.style.paddingTop = ''; return; }
      if (app.firstElementChild.classList && app.firstElementChild.classList.contains('latest')) return;
      var ae = document.activeElement;
      if (ae && ae !== document.body && app.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      scrollUp();
    }).observe(app, { childList: true });
  } catch(e) {}
`, 'V205_FIT_OBSERVER_ANCHOR_MISSING');

  if (html.split('</head>').length !== 2) throw new Error('V205_HEAD_ANCHOR_MISSING');
  html = html.replace('</head>',
    '<style id="qlp-v205-focus">#app.is-old{padding-top:4px!important}</style>' +
    '<meta name="qlp-focus-v205" content="place-new-content-at-viewed-position-after-user-action"></head>');
  return html;
}
