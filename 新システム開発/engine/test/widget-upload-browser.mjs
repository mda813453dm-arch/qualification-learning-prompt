// ChatGPTウィジェット内のPDF選択→MCP登録を375px Chromium/WebKitで検査する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { widgetHtml } from '../src/widget.js';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const html = widgetHtml();
for (const [name, engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser = await engine.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://qlp.test/**',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
    await page.goto('https://qlp.test/');
    await page.evaluate(({html})=>{
      window.calls=[];window.followups=[];window.fakeUploads=[];window.fakeDownloads=[];
      const iframe=document.createElement('iframe');
      iframe.style.cssText='width:100%;height:800px;border:0';
      window.deliver=params=>iframe.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params},'*');
      window.addEventListener('message',event=>{
        if(event.source!==iframe.contentWindow)return;
        const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
        const reply=data=>iframe.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:data},'*');
        if(m.method==='ui/initialize'){
          reply({protocolVersion:'2026-01-26',hostCapabilities:{}});
        }else if(m.method==='ui/notifications/initialized'){
          window.deliver({_meta:{qlp:{status:'sourceUnavailable',sessionId:'test-session',
            permissionedUpload:true,qualificationName:'行政書士',answerFormat:'html',
            maxBatchFiles:10,personalUploadedYears:[],pendingOfficialAnswerYears:[]}}});
        }else if(m.method==='tools/call'){
          window.calls.push({name:m.params.name,args:m.params.arguments});
          if(m.params.name==='confirmUploadRights'){
            reply({structuredContent:{status:'uploadPermissionConfirmed',allYears:true,maxBatchFiles:10}});
          }else if(m.params.name==='attachPdf'){
            reply({structuredContent:{status:'attached',year:m.params.arguments.year,sessionId:'test-session'}});
          }else if(m.params.name==='getOfficialLibrary'){
            reply({structuredContent:{status:'officialLibrary',permissionedUpload:true,personalUploadedYears:[2020,2025],maxBatchFiles:10,answerFormat:'html',qualificationName:'行政書士'}});
          }else reply({structuredContent:{status:'recorded'}});
        }else if(m.method==='ui/message'){
          window.followups.push(m.params);
          reply({});
        }
      });
      const injections='<script>window.openai={' +
        'toolOutput:{status:"sourceUnavailable"},displayMode:"inline",' +
        'uploadFile:async function(file){var id="file_"+file.name;parent.fakeUploads.push(file.name);return {fileId:id};},' +
        'getFileDownloadUrl:async function(args){parent.fakeDownloads.push(args.fileId);return {downloadUrl:"https://files.example/"+encodeURIComponent(args.fileId)+".pdf"};},' +
        'notifyIntrinsicHeight:function(){}' +
        '};<\/script><script>';
      iframe.srcdoc=html.replace('<script>',injections);
      document.body.appendChild(iframe);
    },{html});
    const ui=page.frameLocator('iframe');
    await ui.getByRole('heading',{name:'過去問PDFのまとめ取り込み（本人専用）'}).waitFor();
    assert.equal(await ui.locator('#licensedYear').count(),0);
    assert.equal(await ui.locator('#licensedFiles').isDisabled(),true);
    assert.equal(await ui.locator('#licensedConfirm').count(),0);
    assert.equal(await ui.locator('#licensedReuse').count(),0);
    await ui.locator('#licensedAck').check();
    await ui.getByText('許諾確認済みです。',{exact:false}).waitFor();
    assert.equal(await ui.locator('#licensedFiles').isEnabled(),true);
    const chooserEvent=page.waitForEvent('filechooser');
    await ui.locator('#licensedPick').click();
    const chooser=await chooserEvent;
    await chooser.setFiles([
      {name:'R2_Mondai(7).pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nFake test A')},
      {name:'R7_Mondai(6).pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nFake test B')}
    ]);
    await ui.getByText(/登録・検証を開始：2020・2025年度/).waitFor();
    const evidence=await page.evaluate(()=>({calls:window.calls,uploads:window.fakeUploads,downloads:window.fakeDownloads,followups:window.followups}));
    const attached=evidence.calls.filter(c=>c.name==='attachPdf');
    assert.equal(attached.length,2,JSON.stringify(evidence));
    assert.deepEqual(attached.map(c=>c.args.year),[2020,2025]);
    assert.ok(attached.every(c=>c.args.sessionId==='test-session'));
    assert.ok(attached.every(c=>c.args.questionPdf?.file_id&&c.args.questionPdf?.download_url));
    assert.ok(attached.every(c=>!c.args.answerPdf),'行政書士の正答PDFは不要');
    assert.deepEqual(evidence.uploads,['R2_Mondai(7).pdf','R7_Mondai(6).pdf']);
    assert.deepEqual(evidence.followups,[],'AIに送信・判断を依頼しない');
    await ui.locator('#licensedFiles').setInputFiles(
      {name:'problem.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nUnknown')}
    );
    await ui.getByText(/ファイル名から年度を確認できません/).waitFor();
    assert.equal((await page.evaluate(()=>window.calls.filter(c=>c.name==='attachPdf'))).length,2,'不明年度は誤登録しない');
    assert.deepEqual(errors,[],name+' console errors: '+errors.join(','));
    console.log(name+': PASS direct PDF upload (multi-year, library reuse, no AI, safe year handling)');
  }finally{await browser.close();}
}
