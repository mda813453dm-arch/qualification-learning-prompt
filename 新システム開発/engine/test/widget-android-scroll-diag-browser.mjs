// Browser check of the v191 Android scroll diagnostics. This simulates the host;
// it proves the measuring tool works, NOT that the Android ChatGPT app scrolls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml, WIDGET_VERSION } from '../src/widget-current.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless:true });
const agents = [
  ['android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', true],
  ['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', false],
];
try {
  for (const [name, ua, android] of agents) {
    const context = await browser.newContext({ viewport:{width:393,height:852}, screen:{width:393,height:852}, userAgent:ua, isMobile:true, hasTouch:true });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e=>errors.push(e.message));
      await page.route('https://qlp.test/**', route=>route.fulfill({ contentType:'text/html',
        body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;min-height:3500px"></body></html>' }));
      await page.goto('https://qlp.test/');
      await page.evaluate(html=>{
        const iframe=document.createElement('iframe');
        iframe.id='study'; iframe.style.cssText='display:block;width:100%;height:120px;border:0';
        window.addEventListener('message',event=>{
          if(event.source!==iframe.contentWindow||!event.data||event.data.jsonrpc!=='2.0')return;
          if(event.data.method==='ui/initialize')
            iframe.contentWindow.postMessage({jsonrpc:'2.0',id:event.data.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{}}},'*');
          if(event.data.method==='tools/call')
            iframe.contentWindow.postMessage({jsonrpc:'2.0',id:event.data.id,result:{structuredContent:{status:'recorded'}}},'*');
        });
        const shim='<script>window.__calls=[];window.openai={toolOutput:null,displayMode:"inline",maxHeight:500,'+
          'callTool:function(n,a){window.__calls.push({name:n,args:a});return Promise.resolve({structuredContent:{status:"recorded"}});},'+
          'requestDisplayMode:function(o){window.__fs=o;return Promise.resolve({mode:o.mode});},'+
          'notifyIntrinsicHeight:function(h){window.frameElement.style.height=Math.ceil(h)+"px"}};<\/script><script>';
        iframe.srcdoc=html.replace('<script>',shim);
        document.body.appendChild(iframe);
      }, widgetHtml());
      const frame=page.frameLocator('#study');
      const app=frame.locator('#app');
      await app.waitFor();
      const pill=frame.locator('#qlpScrollDiagPill');
      if(!android){
        await page.waitForTimeout(300);
        assert.equal(await pill.count(),0,'iPhone: no diagnostic button, layout unchanged');
        assert.deepEqual(errors,[],name+' browser exceptions');
        console.log(name+' PASS (no diagnostics)');
        continue;
      }
      await app.evaluate(el=>{ el.innerHTML='<h2>試験概要</h2>'+Array.from({length:90},(_,i)=>'<section style="padding:12px;border-bottom:1px solid #888">過去問 '+(i+1)+'</section>').join(''); });
      await page.waitForTimeout(200);
      assert.equal(await pill.isVisible(),true,'Android shows the diagnostic button');
      // Physical drag inside the frame.
      const box=await app.boundingBox();
      const x=box.x+box.width/2, y=box.y+Math.min(box.height-30,300);
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=6;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*32}]}); await page.waitForTimeout(18); }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await cdp.detach();
      await page.waitForTimeout(200);
      // v192: the frame is full height and the drag scrolled the outer page; the button sits at the frame top.
      // The diagnostic controls are position:fixed at the frame top; press them by element.
      await pill.evaluate(el=>el.click());
      const panel=frame.locator('#qlpScrollDiagPanel');
      assert.equal(await panel.isVisible(),true,'panel opens');
      const text=await panel.locator('pre').textContent();
      assert.match(text,/タッチ start\/move\/end\/cancel: [1-9]\d*\/[1-9]\d*\//,'touch counts are shown');
      assert.match(text,/#app 高さ\/内容\/位置: \d{4}(\.\d)? \/ \d{4}/,'inner element metrics are shown (full height, v192)');
      assert.match(text,/判定: ⓪全体表示/,'v192: whole content shown, no inner scroll needed');
      assert.match(text,new RegExp('版 '+WIDGET_VERSION.replace(/\./g,'\\.')));
      // Programmatic scroll test and fullscreen request.
      await panel.getByRole('button',{name:'枠内を自動で動かす'}).evaluate(el=>el.click());
      await page.waitForTimeout(300);
      assert.match(await panel.locator('pre').textContent(),/自動スクロール試験: どちらも動かない/,'nothing to scroll inside the frame');
      await panel.getByRole('button',{name:'全画面で試す'}).evaluate(el=>el.click());
      await page.waitForTimeout(100);
      // Manual report goes through reportUiEvent with aggregate values only.
      await panel.getByRole('button',{name:'結果を送る'}).evaluate(el=>el.click());
      await page.waitForTimeout(200);
      const calls=await frame.locator('body').evaluate(()=>window.__calls.filter(c=>c.args&&c.args.stage==='android_scroll_diag'));
      assert.ok(calls.length>=1,'diagnostic report sent');
      const last=calls[calls.length-1].args;
      assert.equal(last.version,WIDGET_VERSION);
      assert.deepEqual(Object.keys(last).sort(),['diag','stage','version']);
      assert.ok(last.diag.ts>0 && last.diag.tm>0 && last.diag.embedded===false);
      assert.ok(Object.keys(last.diag).every(k=>/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(k)));
      assert.ok(Object.values(last.diag).every(v=>['number','string','boolean'].includes(typeof v)));
      assert.equal(await frame.locator('body').evaluate(()=>window.__fs&&window.__fs.mode),'fullscreen');
      // Verdict branches for the real-device decision tree.
      const verdicts=await frame.locator('body').evaluate(()=>{
        const v=window.qlpScrollDiag.verdict;
        const base={embedded:true,ts:5,tm:20,te:5,tc:0,appSH:4000,appCH:420,rootSH:420,rootCH:420,appMaxTop:100,docMaxTop:0};
        // Real device 2026-11-12 (v191): 18/14/4/14 with #app moved 47px -> must be 2, not 5.
        const device={...base,ts:18,tm:14,te:4,tc:14,appSH:2932,appMaxTop:47};
        const natural={...base,embedded:false,appSH:4779,appCH:4779,rootSH:4781,rootCH:4781};
        return [v(natural),v({...natural,rootSH:6000,rootCH:700}),v({...base,ts:0}),v(device),v({...base,appSH:420}),v({...base,appMaxTop:0}),v(base)].map(s=>s[0]);
      });
      assert.deepEqual(verdicts,['⓪','⑥','①','②','③','④','⑤']);
      await panel.getByRole('button',{name:'× 閉じる'}).evaluate(el=>el.click());
      assert.equal(await panel.isVisible(),false);
      assert.deepEqual(errors,[],name+' browser exceptions');
      console.log(name+' PASS '+text.split('\n')[0]);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
