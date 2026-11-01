// Android ChatGPT host may take vertical touch gestures away from a nested iframe.
// Keep the v169 bounded viewport, add explicit drag handling and an always-accessible
// button-based navigation fallback. Neither behavior is enabled on iOS or desktop.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v169.js';

export const WIDGET_URI = 'ui://qlp/question-v170.html';
export const WIDGET_VERSION = '2026-11-02.170';
export { PREPARED_LESSONS, WIDGET_MIME };

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-01.169', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');

  const cssMarker = '</style></head><body>';
  if (html.split(cssMarker).length !== 2) throw new Error('ANDROID_STYLE_ANCHOR_MISSING');
  const css = `</style>
<style id="qlp-android-touch-navigation">
html.qlp-android-embedded:not(.study-fullscreen) #app.study-viewport:not(.is-old){
  touch-action:none;
  -webkit-overflow-scrolling:auto;
  overscroll-behavior:contain;
}
html.qlp-android-embedded .table-scroll,
html.qlp-android-embedded .md-t,
html.qlp-android-embedded .fig-scroll {touch-action:pan-x;}
#qlpAndroidScrollTools {display:none;}
#qlpAndroidScrollTools[hidden] {display:none !important;}
html.qlp-android-embedded:not(.study-fullscreen) #qlpAndroidScrollTools:not([hidden]){
  display:flex;align-items:center;justify-content:space-between;gap:6px;
  box-sizing:border-box;width:100%;padding:6px 10px 8px;
  background:var(--bg);border-bottom:1px solid var(--line);
}
#qlpAndroidScrollTools button{
  flex:1;min-width:0;min-height:42px;padding:7px 5px;
  border:1px solid var(--line);border-radius:9px;
  background:var(--accbg);color:var(--acc);
  font:700 14px/1.25 -apple-system,"Noto Sans JP",sans-serif;
  touch-action:manipulation;white-space:nowrap;
}
#qlpAndroidScrollTools button:disabled{opacity:.40;}
</style></head><body>`;
  html = html.replace(cssMarker, css);

  const scriptMarker = '  var preparedLessons = ';
  if (html.split(scriptMarker).length !== 2) throw new Error('ANDROID_INIT_ANCHOR_MISSING');

  const boot = `  // The parent ChatGPT WebView can swallow iframe swipe gestures.
  // This controller belongs to the original iframe only, never to the host.
  var qlpAndroidNav = null;
  function updateAndroidNav() {
    if (!qlpAndroidNav || !app) return;
    var max = Math.max(0, app.scrollHeight - app.clientHeight);
    var hidden = app.classList.contains('is-old') || max < 24 ||
      document.documentElement.classList.contains('study-fullscreen');
    qlpAndroidNav.hidden = hidden;
    if (hidden) return;
    var buttons = qlpAndroidNav.querySelectorAll('button[data-jump]');
    for (var i = 0; i < buttons.length; i++) {
      var action = buttons[i].getAttribute('data-jump');
      buttons[i].disabled = action === 'up' ? app.scrollTop < 4 :
        (max - app.scrollTop) < 4;
    }
  }
  function androidScrollStep(direction) {
    if (!qlpAndroidNav || !app) return;
    var max = Math.max(0, app.scrollHeight - app.clientHeight);
    var step = Math.max(180, Math.floor(app.clientHeight * .76));
    var destination = direction === 'up' ? app.scrollTop - step :
      direction === 'end' ? max : app.scrollTop + step;
    app.scrollTop = Math.max(0, Math.min(max, destination));
    updateAndroidNav();
  }
  if (document.documentElement.classList && document.documentElement.classList.contains('qlp-android-embedded')) {
    qlpAndroidNav = document.createElement('nav');
    qlpAndroidNav.id = 'qlpAndroidScrollTools';
    qlpAndroidNav.setAttribute('aria-label', '学習画面のスクロール操作');
    qlpAndroidNav.hidden = true;
    qlpAndroidNav.innerHTML =
      '<button type="button" data-jump="up">↑ 上へ</button>' +
      '<button type="button" data-jump="down">↓ 下へ</button>' +
      '<button type="button" data-jump="end">⇣ 最下部へ</button>';
    app.parentNode.insertBefore(qlpAndroidNav, app);
    qlpAndroidNav.addEventListener('click', function(e){
      var btn = e.target && e.target.closest && e.target.closest('button[data-jump]');
      if (!btn || btn.disabled) return;
      androidScrollStep(btn.getAttribute('data-jump'));
    });

    // Android host scrolling can win the native pan-y gesture, although
    // scrollTop works. Own vertical drags inside this bounded iframe.
    var touchPreviousY = null;
    var touchTracking = false;
    app.addEventListener('touchstart', function(e){
      touchTracking = false;
      if (!e.touches || e.touches.length !== 1) return;
      var target = e.target;
      if (target && target.closest && target.closest(
        '.table-scroll,.md-t,.fig-scroll,.fig-overlay,input,textarea,select,[contenteditable]'
      )) return;
      touchPreviousY = e.touches[0].clientY;
      touchTracking = true;
    }, {passive:true});
    app.addEventListener('touchmove', function(e){
      if (!touchTracking || !e.touches || e.touches.length !== 1) return;
      var max = Math.max(0, app.scrollHeight - app.clientHeight);
      if (max < 4) return;
      var y = e.touches[0].clientY;
      var delta = touchPreviousY - y;
      touchPreviousY = y;
      if (Math.abs(delta) < .5) return;
      var before = app.scrollTop;
      var after = Math.max(0, Math.min(max, before + delta));
      if (Math.abs(after - before) < .5) return;
      app.scrollTop = after;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      updateAndroidNav();
    }, {passive:false});
    app.addEventListener('touchend', function(){ touchTracking = false; touchPreviousY = null; }, {passive:true});
    app.addEventListener('touchcancel', function(){ touchTracking = false; touchPreviousY = null; }, {passive:true});
    app.addEventListener('scroll', updateAndroidNav, {passive:true});
  }
`;
  html = html.replace(scriptMarker, boot + scriptMarker);

  // The toolbar lives outside #app because render() replaces app.innerHTML.
  // Include its size in the MCP intrinsic height, or the host clips it.
  const measureMarker = '    var h = Math.ceil(app.offsetHeight + busyHeight) + 2;';
  if (html.split(measureMarker).length !== 2) throw new Error('HEIGHT_MEASURE_ANCHOR_MISSING');
  html = html.replace(measureMarker,
    `    updateAndroidNav();
    var navHeight = qlpAndroidNav && !qlpAndroidNav.hidden ? qlpAndroidNav.offsetHeight : 0;
    var h = Math.ceil(app.offsetHeight + busyHeight + navHeight) + 2;`);
  return html;
}
