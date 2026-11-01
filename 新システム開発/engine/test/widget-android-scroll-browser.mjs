// Regression: Android ChatGPT WebView must not crop long iframe on host scroll.
// The host is simulated; this does not claim Android ChatGPT device certification.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget-v170.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless:true });
const agents = [
  ['android', 'Mozilla/5.0 (Linux; Android 10; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', true],
  ['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', false],
];
try {
  for (const [name, ua, android] of agents) {
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
        capped:document.documentElement.classList.contains('qlp-android-embedded'),
        iframeHeight:window.frameElement.getBoundingClientRect().height,
        iframeWidth:window.frameElement.getBoundingClientRect().width
      }));
      const before=await measure();
      assert.equal(before.capped, android, name+': Android-only mode');
      if(android){
        assert.ok(before.scrollHeight>before.height+1000, 'Android content remains independently scrollable');
        assert.ok(before.height>=420 && before.height<=702, 'bounded Android viewport');
        assert.equal(before.overflow,'auto');
      }else{
        assert.ok(before.height>2000,'iOS retains full natural content height');
        assert.ok(before.scrollHeight<=before.height+2,'iOS has no nested vertical scrollbar');
      }
      await app.evaluate(el=>{ el.scrollTop=el.scrollHeight/2; });
      await page.evaluate(()=>window.scrollTo(0,750));
      await page.waitForTimeout(160);
      const after=await measure();
      if(android){
        assert.ok(after.scrollTop>200,'Android inner panel can be scrolled');
        assert.ok(Math.abs(after.height-before.height)<3,'Android panel does not collapse on scroll');
        assert.ok(Math.abs(after.iframeHeight-before.iframeHeight)<4,'host iframe height remains stable');
        assert.ok(Math.abs(after.iframeWidth-before.iframeWidth)<4,'host iframe width remains stable');
      }
      assert.deepEqual(errors,[],name+' browser exceptions');
      console.log(name+' PASS '+JSON.stringify({before,after}));
    } finally {await context.close();}
  }
} finally {await browser.close();}
