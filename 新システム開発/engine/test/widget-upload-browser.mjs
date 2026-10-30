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
          }else if(m.params.name==='attachPdfBatchFromPicker'){
            reply({structuredContent:{status:'attachedBatch',sessionId:'test-session',requested:m.params.arguments.questionPdfs.length,queued:m.params.arguments.questionPdfs.length,existing:0,failed:0,results:[]}});
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
        'selectFiles:async function(){return [{fileId:"lib5",fileName:"R5_Mondai.pdf",mimeType:"application/pdf"},{fileId:"lib6",fileName:"R6_Mondai.pdf",mimeType:"application/pdf"},{fileId:"lib7",fileName:"R7_Mondai.pdf",mimeType:"application/pdf"}];},' +
        'getFileDownloadUrl:async function(args){parent.fakeDownloads.push(args.fileId);return {downloadUrl:"https://files.example/"+encodeURIComponent(args.fileId)+".pdf"};},' +
        'notifyIntrinsicHeight:function(){}' +
        '};<\/script><script>';
      iframe.srcdoc=html.replace('<script>',injections);
      document.body.appendChild(iframe);
    },{html});
    const ui=page.frameLocator('iframe');
    await ui.getByRole('heading',{name:'過去問PDFのまとめ取り込み（本人専用）'}).waitFor();
    assert.equal(await ui.locator('#licensedYear').count(),0);
    assert.equal(await ui.locator('#licensedFiles').count(),0);
    assert.equal(await ui.locator('#licensedRefresh').count(),0);
    assert.equal(await ui.locator('#licensedPick').count(),0);
    assert.equal(await ui.locator('#licensedStart').count(),0);
    assert.equal(await ui.locator('#licensedCheck').count(),0,'本人専用PDF登録画面に確認問題のボタンを表示しない');
    assert.equal(await ui.locator('#licensedLocalPick').count(),1,'未登録の学習者にもiPhone内検索ボタンを常時表示する');
    assert.equal(await ui.locator('#licensedLocalUpload').count(),1,'端末でボタンが反応しないときもiPhone純正ファイル入力を残す');
    const before = await page.evaluate(()=>window.calls.length);
    await ui.locator('#licensedAck').check();
    await ui.getByText('確認済みです。',{exact:false}).waitFor();
    const calls=await page.evaluate(n=>window.calls.slice(n),before);
    assert.equal(calls.filter(c=>c.name==='confirmUploadRights').length,1,'許諾記録は1回');
    assert.equal(calls.filter(c=>c.name==='attachPdf').length,0,'ファイルを送信していないのに登録しない');
    await ui.getByRole('button',{name:'公式過去問を解く'}).waitFor({timeout:12000});
    assert.equal(await ui.locator('#licensedAck').isChecked(),true,'自動更新してもチェックを保持');
    assert.equal(await ui.locator('#licensedAck').isDisabled(),true,'同じ許諾を二重登録しない');
    assert.equal(await ui.locator('#licensedLocalPick').count(),1,'登録済み年度が表示された後もiPhone内検索ボタンを維持する');
    assert.match(await ui.locator('#app').innerText(),/2020年度/);
    assert.match(await ui.locator('#app').innerText(),/2025年度/);
    assert.equal(await page.evaluate(()=>window.followups.length),0,'状態更新でAIチャットを追加しない');
    await ui.getByRole('button',{name:'ChatGPT内のPDFを選んで登録'}).click();
    await page.waitForFunction(()=>window.calls.some(c=>c.name==='attachPdfBatchFromPicker'));
    const picked=await page.evaluate(()=>window.calls.find(c=>c.name==='attachPdfBatchFromPicker'));
    assert.deepEqual(picked.args.questionPdfs.map(p=>p.file_name),['R5_Mondai.pdf','R6_Mondai.pdf','R7_Mondai.pdf']);
    assert.equal(picked.args.answerPdfs,undefined,'行政書士は問題PDFだけで登録');
    await ui.getByRole('button',{name:'公式過去問を解く'}).waitFor({timeout:12000});
    assert.equal(await ui.locator('#licensedStart').count(),1,'許諾済みPDF登録後は同じ学習枠で実践問題へ進める');
    assert.equal(await page.evaluate(()=>window.followups.length),0,'ファイルライブラリ経路では新しいチャットを生成しない');
    // PDF受付の実際のツール通知から、同じセッションで登録済み年度へ自動移行する。
    const beforeReceipt = await page.evaluate(()=>window.calls.filter(c=>c.name==='getOfficialLibrary').length);
    await page.evaluate(()=>window.deliver({_meta:{qlp:{status:'attachedBatch',sessionId:'test-session',queued:3}}}));
    await ui.getByRole('heading',{name:'過去問PDFのまとめ取り込み（本人専用）'}).waitFor();
    await page.waitForFunction((count)=>window.calls.filter(c=>c.name==='getOfficialLibrary').length>count,beforeReceipt);
    assert.equal(await ui.locator('#licensedStart').count(),1,'受領から登録済み年度へ進んだとき学習ボタンを表示');
    assert.equal(await ui.locator('#licensedLocalPick').count(),1,'受付→取込み済みへ更新してもiPhone内検索ボタンを維持する');
    const beforeLocal=await page.evaluate(()=>window.calls.filter(c=>c.name==='attachPdfBatchFromPicker').length);
    const chooserPromise=page.waitForEvent('filechooser');
    await ui.locator('#licensedLocalPick').click();
    const chooser=await chooserPromise;
    await chooser.setFiles({name:'R4_Mondai.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nmock PDF for file chooser regression')});
    await page.waitForFunction(count=>window.calls.filter(c=>c.name==='attachPdfBatchFromPicker').length>count,beforeLocal);
    const local=await page.evaluate(()=>window.calls.filter(c=>c.name==='attachPdfBatchFromPicker').at(-1));
    assert.equal(local.args.questionPdfs[0].file_name,'R4_Mondai.pdf','iPhone内のPDF検索ボタンから登録へ進める');
    assert.equal(await ui.locator('#app').getByText('▼ この学習枠の先頭です').count(),1,'古い最新表示の誤表示を残さない');
    assert.equal(await page.evaluate(()=>window.followups.length),0,'受領後も追加のAIメッセージは送信しない');
    assert.deepEqual(errors,[],name+' console errors: '+errors.join(','));
    console.log(name+': PASS chat attachment guidance and auto status with retained consent');
  }finally{await browser.close();}
}
