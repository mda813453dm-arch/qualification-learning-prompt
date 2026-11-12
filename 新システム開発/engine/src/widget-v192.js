// v192: Android uses the same natural-height display as iPhone.
// Real-device diagnostics (v191, 2026-11-12) showed the Android ChatGPT app
// takes vertical drags away from the study iframe after about 26px
// (touch start/move/end/cancel = 18/14/4/14) and scrolls the outer chat.
// Inner scrolling inside a bounded frame therefore cannot work there.
// v192 stops bounding the Android frame: the full content height is reported
// to the host, exactly as on iPhone, so the outer chat scroll shows everything.
// The v191 diagnostics stay (Android only) with a corrected verdict and a
// close button at the top. v191 and earlier stay immutable for cached sessions.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v191.js';
export const WIDGET_URI = 'ui://qlp/question-v192.html';
export const WIDGET_VERSION = '2026-11-12.192';
export { PREPARED_LESSONS, WIDGET_MIME };

function replaceOnce(html, from, to, code) {
  if (html.split(from).length !== 2) throw new Error(code);
  return html.replace(from, () => to);
}

const NEW_VERDICT = `function verdict(m){
    var overflowInner=Math.max(m.appSH-m.appCH,0);
    var clipped=m.rootSH-m.rootCH;
    if(!m.embedded&&overflowInner<4&&clipped<4)return '⓪全体表示：枠内スクロールは不要です（外側の会話でスクロールします）';
    if(!m.embedded&&clipped>=4)return '⑥内容が枠の高さを超えています（アプリが枠の高さを制限している可能性）';
    if(m.ts===0)return '①枠内でタッチが1回も届いていません（外側のChatGPTが操作を受け取っている可能性）';
    if(m.tm===0||(m.tc>0&&m.tc>=m.te))return '②タッチは届くが、指の動きが途中で取り消されています（外側のChatGPTが操作を奪っている可能性）';
    if(overflowInner<4&&clipped<4)return '③内容が枠からあふれていません（枠の高さが内容全体になっている可能性）';
    if(m.appMaxTop<1&&m.docMaxTop<1)return '④指の動きは届いているのに、枠内のスクロール位置が変わりません';
    return '⑤枠内のスクロール位置は変わっています（表示が更新されない可能性）';
  }
  `;

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-12.191', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  // 1) Android no longer enters the bounded inner-scroll mode (same path as iPhone).
  html = replaceOnce(html,
    'if (/Android/i.test(ua) && window.parent !== window) {',
    'if (false /* v192: Android uses the iPhone natural-height display */ && /Android/i.test(ua) && window.parent !== window) {',
    'V192_ANDROID_PANEL_ANCHOR_MISSING');
  html = replaceOnce(html,
    "var isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');",
    "var isAndroid = false; // v192: Android reports the full content height like iPhone (qlp-v192-natural-height)",
    'V192_ANDROID_FIT_ANCHOR_MISSING');
  // 2) Diagnostics: corrected verdict (cancelled gestures => 2, natural display => 0/6).
  const start = html.indexOf('function verdict(m){');
  const end = html.indexOf('// reportUiEvent: aggregate numbers only.');
  if (start < 0 || end < 0 || end < start || html.indexOf('function verdict(m){', start + 1) >= 0) throw new Error('V192_VERDICT_ANCHOR_MISSING');
  html = html.slice(0, start) + NEW_VERDICT + html.slice(end);
  // 3) Diagnostics: the close button sits at the top so it is always reachable.
  html = replaceOnce(html,
    "row.appendChild(button('閉じる',function(){panel.hidden=true;pill.hidden=false;clearInterval(timer);}));\n    panel.appendChild(h);",
    "var closeTop=button('× 閉じる',function(){panel.hidden=true;pill.hidden=false;clearInterval(timer);});closeTop.className='qlp-diag-close';\n    panel.appendChild(closeTop);panel.appendChild(h);",
    'V192_CLOSE_ANCHOR_MISSING');
  html = replaceOnce(html,
    '#qlpScrollDiagPanel[hidden],#qlpScrollDiagPill[hidden]{display:none !important}',
    '#qlpScrollDiagPanel[hidden],#qlpScrollDiagPill[hidden]{display:none !important}\n#qlpScrollDiagPanel .qlp-diag-close{display:block;margin:0 0 6px auto;width:auto;min-height:34px;padding:4px 12px;border:1px solid var(--line,#999);border-radius:8px;background:var(--bg,#fff);color:var(--acc,#245);font:700 13px/1.2 -apple-system,"Noto Sans JP",sans-serif}',
    'V192_STYLE_ANCHOR_MISSING');
  return html;
}
