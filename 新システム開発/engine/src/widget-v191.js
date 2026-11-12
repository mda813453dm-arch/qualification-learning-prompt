// v191: Android ChatGPT app scroll diagnostics (no layout change for iPhone).
// v190's CSS fix passed Chromium simulation but failed on the real Android app.
// Instead of another CSS tweak, v191 measures on the device whether touch and
// scroll events reach the iframe at all, and reports aggregate numbers only
// (no study data, no identifiers) through reportUiEvent. It also offers
// user-triggered alternatives: fullscreen display mode and the browser version.
// v190 stays immutable for cached sessions.
import { widgetHtml as previousHtml, PREPARED_LESSONS, WIDGET_MIME } from './widget-v190.js';
export const WIDGET_URI = 'ui://qlp/question-v191.html';
export const WIDGET_VERSION = '2026-11-12.191';
export { PREPARED_LESSONS, WIDGET_MIME };

// Keys and value limits accepted by reportUiEvent.diag (kept in sync with mcp.js).
export const SCROLL_DIAG_STAGE = 'android_scroll_diag';

const DIAG_STYLE = `<style id="qlp-v191-scroll-diag-style">
#qlpScrollDiagPill{position:fixed;top:6px;right:6px;z-index:2147483000;
  padding:5px 9px;border:1px solid var(--line,#999);border-radius:999px;
  background:var(--bg,#fff);color:var(--acc,#245);font:700 12px/1.2 -apple-system,"Noto Sans JP",sans-serif;
  opacity:.92;touch-action:manipulation}
#qlpScrollDiagPanel{position:fixed;top:4px;left:4px;right:4px;z-index:2147483001;
  max-height:88%;overflow:auto;box-sizing:border-box;padding:8px 10px;
  border:2px solid var(--acc,#245);border-radius:10px;background:var(--bg,#fff);color:var(--fg,#111);
  font:12px/1.45 -apple-system,"Noto Sans JP",sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)}
#qlpScrollDiagPanel[hidden],#qlpScrollDiagPill[hidden]{display:none !important}
#qlpScrollDiagPanel pre{margin:6px 0;white-space:pre-wrap;word-break:break-all;font:11px/1.4 ui-monospace,monospace}
#qlpScrollDiagPanel .qlp-diag-buttons{display:flex;flex-wrap:wrap;gap:6px}
#qlpScrollDiagPanel button{flex:1 1 45%;min-height:36px;border:1px solid var(--line,#999);border-radius:8px;
  background:var(--accbg,#eef);color:var(--acc,#245);font:700 12px/1.2 -apple-system,"Noto Sans JP",sans-serif;touch-action:manipulation}
</style>`;

// ES5 only: runs inside the ChatGPT Android WebView. Listeners are passive and
// never call preventDefault, so measuring does not change scrolling behaviour.
const DIAG_SCRIPT = `<script id="qlp-v191-scroll-diag">
(function(){
  var VERSION='__QLP_VERSION__';
  var ua=(typeof navigator!=='undefined'&&navigator.userAgent)||'';
  if(!/Android/i.test(ua))return;
  var started=Date.now();
  var c={ts:0,tm:0,te:0,tc:0,tmPrevented:0,pd:0,pm:0,pu:0,pc:0,wh:0,sApp:0,sDoc:0,maxDy:0,appMaxTop:0,docMaxTop:0};
  var startY=null,sent=0,autoTimer=null,lastResult='',progTest='',fsResult='';
  function app(){return document.getElementById('app');}
  function num(v){v=Number(v);return isFinite(v)?Math.round(v*10)/10:-1;}
  function cs(el,p){try{return el?String(getComputedStyle(el)[p]||''):'';}catch(e){return '';}}
  function measure(){
    var a=app(),root=document.scrollingElement||document.documentElement,o=window.openai||{};
    var vv=window.visualViewport;
    var dev='';try{dev=String((o.userAgent&&o.userAgent.device&&o.userAgent.device.type)||'');}catch(e){}
    var m={
      trigger:'',elapsed:Math.round((Date.now()-started)/1000),
      ua:ua.slice(0,150),iw:num(window.innerWidth),ih:num(window.innerHeight),
      sw:num(screen&&screen.width),sh:num(screen&&screen.height),dpr:num(window.devicePixelRatio),
      vvh:vv?num(vv.height):-1,
      rootCH:num(root.clientHeight),rootSH:num(root.scrollHeight),rootST:num(root.scrollTop),
      appCH:a?num(a.clientHeight):-1,appSH:a?num(a.scrollHeight):-1,appST:a?num(a.scrollTop):-1,
      appOv:cs(a,'overflowY'),appTA:cs(a,'touchAction'),
      rootOv:cs(document.documentElement,'overflowY'),rootTA:cs(document.documentElement,'touchAction'),
      bodyOv:cs(document.body,'overflowY'),
      embedded:document.documentElement.classList.contains('qlp-android-embedded'),
      fullscreenClass:document.documentElement.classList.contains('study-fullscreen'),
      dm:String(o.displayMode||''),mh:num(o.maxHeight),dev:dev.slice(0,20),
      hasOpenai:!!window.openai,hasCallTool:!!(o&&o.callTool),hasDisplay:!!(o&&o.requestDisplayMode),
      hasExternal:!!(o&&o.openExternal),progTest:progTest,fs:fsResult
    };
    for(var k in c)if(Object.prototype.hasOwnProperty.call(c,k))m[k]=c[k];
    return m;
  }
  function verdict(m){
    if(m.ts===0)return '①枠内でタッチが1回も届いていません（外側のChatGPTが操作を受け取っている可能性）';
    if(m.tm===0||m.tc>0&&m.tm<3)return '②タッチは届くが、指を動かす操作（touchmove）が届かない・途中で取り消されています';
    var overflow=Math.max(m.appSH-m.appCH,m.rootSH-m.rootCH);
    if(overflow<4)return '③内容が枠からあふれていません（枠の高さが内容全体になっている可能性）';
    if(m.appMaxTop<1&&m.docMaxTop<1)return '④指の動きは届いているのに、枠内のスクロール位置が変わりません';
    return '⑤枠内のスクロール位置は変わっています（表示が更新されない可能性）';
  }
  // reportUiEvent: aggregate numbers only. Uses window.openai first, then the MCP Apps bridge.
  var rid=0;
  function send(trigger){
    var m=measure();m.trigger=trigger;
    var args={stage:'android_scroll_diag',version:VERSION,diag:m};
    lastResult='送信中…';render();
    function done(ok){lastResult=ok?'送信しました（'+trigger+'）':'送信できませんでした';sent++;render();}
    try{
      if(window.openai&&window.openai.callTool){
        Promise.resolve(window.openai.callTool('reportUiEvent',args)).then(function(){done(true);},function(){done(false);});
        return;
      }
      var id='qlpdiag-'+(++rid);
      var timer=setTimeout(function(){window.removeEventListener('message',onMsg);done(false);},15000);
      var onMsg=function(e){var d=e&&e.data;if(!d||d.id!==id)return;clearTimeout(timer);window.removeEventListener('message',onMsg);done(!d.error);};
      window.addEventListener('message',onMsg);
      window.parent.postMessage({jsonrpc:'2.0',id:id,method:'tools/call',params:{name:'reportUiEvent',arguments:args}},'*');
    }catch(e){done(false);}
  }
  function scheduleAuto(reason,delay){
    if(sent>0||autoTimer)return;
    autoTimer=setTimeout(function(){autoTimer=null;if(sent===0)send(reason);},delay);
  }
  // Passive counters on window (capture) so events are seen even if a child stops them.
  var opt={passive:true,capture:true};
  window.addEventListener('touchstart',function(e){c.ts++;startY=e.touches&&e.touches[0]?e.touches[0].clientY:null;},opt);
  window.addEventListener('touchmove',function(e){c.tm++;if(startY!=null&&e.touches&&e.touches[0])c.maxDy=Math.max(c.maxDy,Math.round(Math.abs(e.touches[0].clientY-startY)));},opt);
  window.addEventListener('touchend',function(){c.te++;scheduleAuto('auto-touch',1500);},opt);
  window.addEventListener('touchcancel',function(){c.tc++;scheduleAuto('auto-touch',1500);},opt);
  // Bubble-phase listener only reads whether an earlier handler cancelled the move.
  window.addEventListener('touchmove',function(e){if(e.defaultPrevented)c.tmPrevented++;},{passive:true});
  window.addEventListener('pointerdown',function(){c.pd++;},opt);
  window.addEventListener('pointermove',function(){c.pm++;},opt);
  window.addEventListener('pointerup',function(){c.pu++;},opt);
  window.addEventListener('pointercancel',function(){c.pc++;},opt);
  window.addEventListener('wheel',function(){c.wh++;},opt);
  document.addEventListener('scroll',function(e){
    var a=app();
    if(a&&e.target===a){c.sApp++;c.appMaxTop=Math.max(c.appMaxTop,Math.round(a.scrollTop));}
    else{c.sDoc++;var r=document.scrollingElement||document.documentElement;c.docMaxTop=Math.max(c.docMaxTop,Math.round(r.scrollTop));}
  },opt);
  setTimeout(function(){scheduleAuto('auto-timeout',0);},25000);

  var pill=null,panel=null,out=null,status=null,timer=null;
  function render(){
    if(!panel||panel.hidden)return;
    var m=measure();
    out.textContent=
      '判定: '+verdict(m)+'\\n'+
      'タッチ start/move/end/cancel: '+m.ts+'/'+m.tm+'/'+m.te+'/'+m.tc+'（move取消 '+m.tmPrevented+'）\\n'+
      'ポインタ down/move/up/cancel: '+m.pd+'/'+m.pm+'/'+m.pu+'/'+m.pc+'  指の移動 最大'+m.maxDy+'px\\n'+
      '#app 高さ/内容/位置: '+m.appCH+' / '+m.appSH+' / '+m.appST+'（最大 '+m.appMaxTop+'） overflow '+m.appOv+' touch '+m.appTA+'\\n'+
      '文書 高さ/内容/位置: '+m.rootCH+' / '+m.rootSH+' / '+m.rootST+'（最大 '+m.docMaxTop+'） overflow '+m.rootOv+'\\n'+
      'スクロールイベント #app/文書: '+m.sApp+'/'+m.sDoc+'\\n'+
      '枠 '+m.iw+'×'+m.ih+'  画面 '+m.sw+'×'+m.sh+'  表示 '+(m.dm||'-')+'  maxHeight '+m.mh+'\\n'+
      '自動スクロール試験: '+(m.progTest||'未実施')+'  全画面: '+(m.fs||'未実施')+'\\n'+
      '版 '+VERSION;
    status.textContent=lastResult;
  }
  function button(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',function(e){e.stopPropagation();fn();});return b;}
  function progScroll(){
    var a=app(),r=document.scrollingElement||document.documentElement;
    var a0=a?a.scrollTop:0,r0=r.scrollTop;
    if(a)a.scrollTop=a0+240;r.scrollTop=r0+240;
    setTimeout(function(){
      var a1=a?a.scrollTop:0,r1=r.scrollTop;
      progTest=(a1!==a0?'#appが動いた('+Math.round(a0)+'→'+Math.round(a1)+')':(r1!==r0?'文書が動いた('+Math.round(r0)+'→'+Math.round(r1)+')':'どちらも動かない'));
      if(a)a.scrollTop=a0;r.scrollTop=r0;render();
    },150);
  }
  function fullscreen(){
    var o=window.openai;
    try{
      if(o&&o.requestDisplayMode){
        Promise.resolve(o.requestDisplayMode({mode:'fullscreen'})).then(function(r){fsResult='要求済み('+String((r&&r.mode)||o.displayMode||'?')+')';render();},function(){fsResult='拒否';render();});
      }else{
        window.parent.postMessage({jsonrpc:'2.0',id:'qlpdiag-fs-'+(++rid),method:'ui/request-display-mode',params:{mode:'fullscreen'}},'*');
        fsResult='要求送信(ブリッジ)';
      }
    }catch(e){fsResult='失敗';}
    render();
  }
  function openBrowser(){
    var href='https://chatgpt.com/';
    try{
      if(window.openai&&window.openai.openExternal){window.openai.openExternal({href:href});lastResult='ブラウザを開く要求を送りました';render();return;}
      window.open(href,'_blank','noopener');lastResult='ブラウザを開く要求を送りました';
    }catch(e){lastResult='ブラウザを開けませんでした';}
    render();
  }
  function build(){
    if(pill||!document.body)return;
    pill=document.createElement('button');pill.type='button';pill.id='qlpScrollDiagPill';pill.textContent='📏 スクロール診断';
    panel=document.createElement('div');panel.id='qlpScrollDiagPanel';panel.hidden=true;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-label','スクロール診断');
    var h=document.createElement('div');h.style.fontWeight='700';
    h.textContent='スクロール診断：この表示のまま学習枠の中を指で上下に数回なぞり、この画面のスクリーンショットを送ってください（学習の記録は変わりません）';
    out=document.createElement('pre');status=document.createElement('div');
    var row=document.createElement('div');row.className='qlp-diag-buttons';
    row.appendChild(button('結果を送る',function(){send('manual');}));
    row.appendChild(button('枠内を自動で動かす',progScroll));
    row.appendChild(button('全画面で試す',fullscreen));
    row.appendChild(button('ブラウザ版ChatGPTを開く',openBrowser));
    row.appendChild(button('閉じる',function(){panel.hidden=true;pill.hidden=false;clearInterval(timer);}));
    panel.appendChild(h);panel.appendChild(out);panel.appendChild(status);panel.appendChild(row);
    pill.addEventListener('click',function(e){e.stopPropagation();panel.hidden=false;pill.hidden=true;render();clearInterval(timer);timer=setInterval(render,400);});
    document.body.appendChild(pill);document.body.appendChild(panel);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
  window.qlpScrollDiag={measure:measure,verdict:verdict,send:send};
})();
</script>`;

export function widgetHtml() {
  const previous = previousHtml();
  let html = previous.replaceAll('2026-11-11.190', WIDGET_VERSION);
  if (html === previous) throw new Error('WIDGET_VERSION_MARKER_MISSING');
  if (html.split('</style></head><body>').length !== 2) throw new Error('V191_STYLE_ANCHOR_MISSING');
  if (html.split('</body>').length !== 2) throw new Error('V191_BODY_ANCHOR_MISSING');
  html = html.replace('</style></head><body>', '</style>\n' + DIAG_STYLE + '</head><body>');
  html = html.replace('</body>', DIAG_SCRIPT.replace('__QLP_VERSION__', WIDGET_VERSION) + '</body>');
  return html;
}
