// Regression: Android ChatGPT WebView must let users swipe inside the study
// panel without visible navigation buttons or host width/height collapse.
// The host is simulated; this does not claim Android ChatGPT device certification.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml as currentHtml, WIDGET_VERSION } from '../src/widget-current.js';
import { widgetHtml as legacy191Html } from '../src/widget-v191.js';
import { widgetHtml as legacy190Html } from '../src/widget-v190.js';
import { widgetHtml as legacy189Html } from '../src/widget-v189.js';

// owner: どの要素がAndroidの縦スクロールを担うか。
//  natural  = 現在版(v192〜)。AndroidもiPhoneと同じく内容全体の高さで表示し、外側の会話でスクロールする。
//  inner    = 旧版v190・v191。iframe文書は固定し、#app だけが枠内でスクロールする。
//  document = 旧版v189。iframe文書がスクロールする（キャッシュ済み会話向けに不変で残す）。
const variants = [
  ['current '+WIDGET_VERSION, currentHtml, 'natural'],
  ['legacy 2026-11-12.191', legacy191Html, 'inner'],
  ['legacy 2026-11-11.190', legacy190Html, 'inner'],
  ['legacy 2026-11-11.189', legacy189Html, 'document'],
];

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless:true });
const agents = [
  ['android', 'Mozilla/5.0 (Linux; Android 10; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', true],
  ['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', false],
];
try {
 for (const [label, widgetHtml, owner] of variants) {
  for (const [agentName, ua, android] of agents) {
    const name = label+' / '+agentName;
    const bounded = android && owner !== 'natural';
    const context = await browser.newContext({
      viewport: { width:393, height:852 },
      screen: { width:393, height:852 },
      userAgent:ua, isMobile:true, hasTouch:true,
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e=>errors.push(e.message));
      await page.route('https://qlp.test/**', route=>route.fulfill({
        contentType:'text/html',
        body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;min-height:3500px"></body></html>',
      }));
      await page.goto('https://qlp.test/');
      await page.evaluate(html=>{
        const iframe=document.createElement('iframe');
        iframe.id='study';
        iframe.style.cssText='display:block;width:100%;height:120px;border:0';
        window.addEventListener('message',event=>{
          if(event.source!==iframe.contentWindow||!event.data||event.data.jsonrpc!=='2.0')return;
          if(event.data.method==='ui/initialize')
            iframe.contentWindow.postMessage({jsonrpc:'2.0',id:event.data.id,result:{
              protocolVersion:'2026-01-26',hostCapabilities:{}
            }},'*');
          if(event.data.method==='tools/call')
            iframe.contentWindow.postMessage({jsonrpc:'2.0',id:event.data.id,result:{
              structuredContent:{status:'recorded'}
            }},'*');
        });
        const shim='<script>window.openai={toolOutput:null,notifyIntrinsicHeight:function(h){window.frameElement.style.height=Math.ceil(h)+"px"}};<\/script><script>';
        iframe.srcdoc=html.replace('<script>',shim);
        document.body.appendChild(iframe);
      }, widgetHtml());
      const frame=page.frameLocator('#study');
      const app=frame.locator('#app');
      await app.waitFor();
      await app.evaluate(el=>{
        el.innerHTML='<h2>試験概要</h2>'+Array.from({length:90},(_,i)=>
          '<section style="padding:12px;border-bottom:1px solid #888">過去問 '+(i+1)+'　年度ごとの問題・解説</section>').join('');
      });
      await page.waitForTimeout(200);
      const measure=()=>app.evaluate(el=>({
        height:el.clientHeight,
        scrollHeight:el.scrollHeight,
        scrollTop:el.scrollTop,
        overflow:getComputedStyle(el).overflowY,
        rootHeight:document.scrollingElement.clientHeight,
        rootScrollHeight:document.scrollingElement.scrollHeight,
        rootScrollTop:document.scrollingElement.scrollTop,
        rootOverflow:getComputedStyle(document.documentElement).overflowY,
        rootOverscroll:getComputedStyle(document.documentElement).overscrollBehaviorY,
        capped:document.documentElement.classList.contains('qlp-android-embedded'),
        iframeHeight:window.frameElement.getBoundingClientRect().height,
        iframeWidth:window.frameElement.getBoundingClientRect().width
      }));
      const before=await measure();
      assert.equal(before.capped, bounded, name+': Android bounded mode only in legacy versions');
      if(bounded){
        if(owner==='document') assert.ok(before.rootScrollHeight>before.rootHeight+1000,
          'Android document has scrollable overflow within the iframe');
        assert.ok(before.iframeHeight>=420 && before.iframeHeight<=702,
          'Android host sees a bounded iframe');
        assert.equal(before.rootOverscroll,'contain','iframe cannot chain overscroll into host');
        if(owner==='inner'){
          assert.equal(before.overflow,'auto','#app is the single Android scroll owner');
          assert.equal(before.rootOverflow,'hidden','iframe document does not compete for the gesture');
          assert.ok(before.rootScrollHeight<=before.rootHeight+1,'iframe document itself is not scrollable');
          assert.ok(before.height<=before.iframeHeight+1,'#app is bounded to the iframe height');
          assert.ok(before.scrollHeight>before.height+1000,'#app has scrollable overflow inside the frame');
        }else{
          assert.equal(before.overflow,'visible','legacy v189: inner app is not a nested scroll container');
          assert.equal(before.rootOverflow,'auto','legacy v189: iframe document owns Android vertical scrolling');
        }
      }else{
        assert.ok(before.height>2000,'iOS retains full natural content height');
        assert.ok(before.scrollHeight<=before.height+2,'iOS has no nested vertical scrollbar');
      }
      if (bounded) {
        const nav=frame.locator('#qlpAndroidScrollTools');
        assert.equal(await nav.isVisible(),false,'Android navigation buttons are not shown');
        assert.equal(await app.evaluate(el=>getComputedStyle(el).touchAction),'pan-y',
          'native Android vertical panning is enabled');
        assert.equal(await app.getAttribute('tabindex'),'0','Android panel is keyboard-scrollable');

        // Send a physical gesture; programmatic scrollTop is not sufficient.
        const box=await app.boundingBox();
        assert.ok(box,'Android panel is visible for a physical drag gesture');
        const x=box.x+box.width/2;
        const y=Math.min(box.y+Math.min(box.height-30,360),box.y+box.height-30);
        const cdp=await context.newCDPSession(page);
        const outerBefore=await page.evaluate(()=>window.scrollY);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        for(let i=1;i<=6;i++){
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*32}]});
          await page.waitForTimeout(18);
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(100);
        const dragged=await measure();
        if(owner==='inner') assert.ok(dragged.scrollTop>90,
          'physical Android drag scrolls #app inside the frame, not the host');
        else assert.ok(dragged.rootScrollTop>90,
          'physical Android drag scrolls the iframe document, not the host');
        assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-outerBefore)<4,
          'Android drag does not scroll the parent ChatGPT host');
        await cdp.detach();
      } else {
        assert.equal(await frame.locator('#qlpAndroidScrollTools').count(),0,
          'iPhone retains natural-height view with no inner-scroll navigation');
        if (android) {
          // v192: the whole content is shown; the host (outer chat) owns vertical drags.
          assert.ok(before.iframeHeight>2000,'Android host receives the full content height like iPhone');
          assert.ok(before.rootScrollHeight<=before.rootHeight+2,'Android iframe document has nothing to scroll');
          const box=await app.boundingBox();
          const x=box.x+box.width/2, y=500;
          const cdp=await context.newCDPSession(page);
          const outerBefore=await page.evaluate(()=>window.scrollY);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
          for(let i=1;i<=6;i++){
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*32}]});
            await page.waitForTimeout(18);
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForTimeout(150);
          assert.ok((await page.evaluate(()=>window.scrollY))-outerBefore>50,
            'Android drag over the frame scrolls the outer chat (no inner scroll needed)');
          await cdp.detach();
        }
      }
      await app.evaluate((el,owner)=>{
        if (document.documentElement.classList.contains('qlp-android-embedded') && owner==='document')
          document.scrollingElement.scrollTop=document.scrollingElement.scrollHeight/2;
        else el.scrollTop=el.scrollHeight/2;
      },owner);
      await page.evaluate(()=>window.scrollTo(0,750));
      await page.waitForTimeout(160);
      const after=await measure();
      if(bounded){
        if(owner==='inner'){
          assert.ok(after.scrollTop>200,'Android #app can be scrolled');
          assert.equal(after.rootScrollTop,0,'iframe document stays fixed');
        }else assert.ok(after.rootScrollTop>200,'Android iframe document can be scrolled');
        assert.ok(Math.abs(after.height-before.height)<3,'Android content height does not collapse on scroll');
        assert.ok(Math.abs(after.iframeHeight-before.iframeHeight)<4,'host iframe height remains stable');
        assert.ok(Math.abs(after.iframeWidth-before.iframeWidth)<4,'host iframe width remains stable');
      }
      assert.deepEqual(errors,[],name+' browser exceptions');
      console.log(name+' PASS '+JSON.stringify({before,after}));
    } finally {await context.close();}
  }
 }
} finally {await browser.close();}
