// 375pxのChatGPT相当画面：解答途中→PDF追加→同じ問へ戻る。
// 行政書士の本人許諾と公式Web正答、測量士補のPDF正答の差も検証。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {widgetHtml} from '../src/widget.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');

for(const [browserName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
    for(const spec of [
      {qualificationId:'q063',qualificationName:'測量士補',permissionedUpload:false,answerFormat:'pdf',uploadSections:['main']},
      {qualificationId:'q090',qualificationName:'行政書士',permissionedUpload:true,answerFormat:'html',uploadSections:['年度共通']}
    ]){
      const page=await browser.newPage({viewport:{width:375,height:667},isMobile:true,hasTouch:true});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://qlp.test/**',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
      await page.goto('https://qlp.test/');
      const first={status:'question',sessionId:'test-session',learnerId:'learner-anytime',qualificationId:spec.qualificationId,
        question:{questionId:spec.qualificationId+':2025:main:1',year:2025,section:'main',questionNumber:1,
          fieldName:'最初の分野',stem:'次の説明として正しいものはどれですか。',stemMode:'text',
          choices:['選択肢その1','選択肢その2','選択肢その3','選択肢その4','選択肢その5'],
          choiceMode:'text',figures:[],figureUrls:[]},
        progress:{done:0,total:29,fieldIndex:1,fieldTotal:5,fieldQuestion:1}};
      await page.evaluate(({html,first,spec})=>{
        window.calls=[];window.followups=[];window.uploads=[];
        const iframe=document.createElement('iframe');
        iframe.style.cssText='width:100%;height:800px;border:0';
        window.deliver=p=>iframe.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:p},'*');
        window.addEventListener('message',event=>{
          if(event.source!==iframe.contentWindow)return;
          const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
          const reply=v=>iframe.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:v},'*');
          if(m.method==='ui/initialize')reply({protocolVersion:'2026-01-26',hostCapabilities:{}});
          else if(m.method==='ui/notifications/initialized')window.deliver({_meta:{qlp:first}});
          else if(m.method==='ui/message'){window.followups.push(m.params);reply({});}
          else if(m.method==='tools/call'){
            window.calls.push({name:m.params.name,args:m.params.arguments});
            if(m.params.name==='getOfficialLibrary')
              reply({structuredContent:{status:'officialLibrary',sessionId:'test-session',
                ...spec,sourceAttachmentSupported:true,
                readyYearDetails:[{year:2025,section:spec.uploadSections[0],questions:29}],
                importingYearDetails:[],failedYearDetails:[]}});
            else if(m.params.name==='getStudySnapshot')
              reply({structuredContent:first});
            else if(m.params.name==='confirmUploadRights')
              reply({structuredContent:{status:'uploadPermissionConfirmed',allYears:true}});
            else if(m.params.name==='attachPdfBatchFromPicker')
              reply({structuredContent:{status:'attachedBatch',sessionId:'test-session',
                requested:m.params.arguments.questionPdfs.length,queued:1,existing:0,
                pendingOfficialAnswer:0,failed:0,results:[{year:2024,status:'attached'}]}});
            else reply({structuredContent:{status:'recorded'}});
          }
        });
        const inject='<script>window.openai={' +
          'toolOutput:{},displayMode:"inline",' +
          'uploadFile:async function(file){parent.uploads.push(file.name);return {fileId:"id_"+file.name};},'+
          'getFileDownloadUrl:async function(v){return {downloadUrl:"https://files.example/"+encodeURIComponent(v.fileId)+".pdf"};},'+
          'notifyIntrinsicHeight:function(){}' +
          '};<\\/script><script>';
        iframe.srcdoc=html.replace('<script>',inject);
        document.body.appendChild(iframe);
      },{html:widgetHtml(),first,spec});
      const ui=page.frameLocator('iframe');
      await ui.getByRole('heading',{name:'2025年度 問1'}).waitFor({timeout:15000});
      await ui.locator('input[name="ans"][value="2"]').check();
      await ui.getByRole('button',{name:'過去問の追加・登録状況'}).first().click();
      await ui.getByRole('heading',{name:'過去問の追加・登録状況'}).waitFor();
      assert.match(await ui.locator('#app').innerText(),/2025年度/);
      if(spec.permissionedUpload)await ui.locator('#sourceManageRights').check();
      await ui.getByText('ファイル名から年度・試験区分が分からないとき').click();
      await ui.locator('#sourceManageYearHint').fill('2024');
      const files=[{name:'exam.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 exam')},
        ...(spec.answerFormat==='html'?[]:[{name:'correct.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 answer')}])];
      await ui.locator('#sourceManageUpload').setInputFiles(files);
      await ui.locator('#sourceManageUploadStatus').getByText('受付',{exact:false}).waitFor({timeout:20000});
      const calls=await page.evaluate(()=>window.calls);
      const batch=calls.find(c=>c.name==='attachPdfBatchFromPicker');
      assert.ok(batch,browserName+': '+spec.qualificationName+' missing upload call');
      assert.deepEqual(batch.args.years,[2024]);
      assert.equal(batch.args.answerPdfs.length,spec.answerFormat==='html'?0:1);
      if(spec.answerFormat==='pdf')assert.deepEqual(batch.args.answerYears,[2024]);
      if(spec.permissionedUpload)assert.ok(calls.some(c=>c.name==='confirmUploadRights'));
      assert.equal(calls.filter(c=>c.name==='submitAnswer'||c.name==='nextQuestion').length,0,
        'import must not grade or advance current question');
      assert.equal(await page.evaluate(()=>window.followups.length),0,'no AI chat messages during import');
      await ui.getByRole('button',{name:'同じ問題に戻る'}).click();
      await ui.getByRole('heading',{name:'2025年度 問1'}).waitFor({timeout:15000});
      assert.equal(await ui.locator('input[name="ans"][value="2"]').isChecked(),true);
      assert.deepEqual(errors,[],browserName+' '+spec.qualificationName);
      await page.close();
    }
  }finally{await browser.close();}
}
console.log('PASS 375px: in-study PDF import for surveyor and licensed administrative scrivener, no loss of current answer');
