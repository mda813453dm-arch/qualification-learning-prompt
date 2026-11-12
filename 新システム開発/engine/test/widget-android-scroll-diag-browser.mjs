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
      await pill.click();
      const panel=frame.locator('#qlpScrollDiagPanel');
      assert.equal(await panel.isVisible(),true,'panel opens');
      const text=await panel.locator('pre').textContent();
      assert.match(text,/タッチ start\/move\/end\/cancel: [1-9]\d*\/[1-9]\d*\//,'touch counts are shown');
      assert.match(text,/#app 高さ\/内容\/位置: 4\d\d(\.\d)? \/ \d{4}/,'inner element metrics are shown');
      assert.match(text,/判定: ⑤/,'simulated host: scroll position changed');
      assert.match(text,new RegExp('版 '+WIDGET_VERSION.replace(/\./g,'\\.')));
      // Programmatic scroll test and fullscreen request.
      await panel.getByRole('button',{name:'枠内を自動で動かす'}).click();
      await page.waitForTimeout(300);
      assert.match(await panel.locator('pre').textContent(),/自動スクロール試験: #appが動いた/);
      await panel.getByRole('button',{name:'全画面で試す'}).click();
      await page.waitForTimeout(100);
      // Manual report goes through reportUiEvent with aggregate values only.
      await panel.getByRole('button',{name:'結果を送る'}).click();
      await page.waitForTimeout(200);
      const calls=await frame.locator('body').evaluate(()=>window.__calls.filter(c=>c.args&&c.args.stage==='android_scroll_diag'));
      assert.ok(calls.length>=1,'diagnostic report sent');
      const last=calls[calls.length-1].args;
      assert.equal(last.version,WIDGET_VERSION);
      assert.deepEqual(Object.keys(last).sort(),['diag','stage','version']);
      assert.ok(last.diag.ts>0 && last.diag.tm>0 && last.diag.appSH>last.diag.appCH);
      assert.ok(Object.keys(last.diag).every(k=>/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(k)));
      assert.ok(Object.values(last.diag).every(v=>['number','string','boolean'].includes(typeof v)));
      assert.equal(await frame.locator('body').evaluate(()=>window.__fs&&window.__fs.mode),'fullscreen');
      // Verdict branches for the real-device decision tree.
      const verdicts=await frame.locator('body').evaluate(()=>{
        const v=window.qlpScrollDiag.verdict;
        const base={ts:5,tm:20,tc:0,appSH:4000,appCH:420,rootSH:420,rootCH:420,appMaxTop:100,docMaxTop:0};
        return [v({...base,ts:0}),v({...base,tm:0,tc:5}),v({...base,appSH:420}),v({...base,appMaxTop:0}),v(base)].map(s=>s[0]);
      });
      assert.deepEqual(verdicts,['①','②','③','④','⑤']);
      await panel.getByRole('button',{name:'閉じる'}).click();
      assert.equal(await panel.isVisible(),false);
      assert.deepEqual(errors,[],name+' browser exceptions');
      console.log(name+' PASS '+text.split('\n')[0]);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
