// 375pxのChatGPT相当画面：解答途中→PDF追加→同じ問へ戻る。
// 行政書士の本人許諾と公式Web正答、測量士補のPDF正答の差も検証。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {widgetHtml} from '../src/widget.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');

// Fail-only evidence: never emit session IDs, PDF contents, URLs or raw args.
function uploadDiagnostic(browserName,spec,calls,timeline){
  const safeYear=value=>Number.isInteger(value)&&value>=1900&&value<=2200?value:null;
  const safeFile=name=>typeof name==='string'&&/^[A-Za-z0-9_.-]{1,90}\.pdf$/.test(name)?name:'<omitted>';
  const normalizeFiles=xs=>Array.isArray(xs)?xs.map(x=>safeFile(x?.file_name)):[];
  const years=value=>Array.isArray(value)?value.map(safeYear):null;
  const matching=calls.filter(c=>c.name==='attachPdfBatchFromPicker');
  const sanitize=c=>({name:c.name,questionYears:years(c.args?.years),answerYears:years(c.args?.answerYears),
    questionFiles:normalizeFiles(c.args?.questionPdfs),answerFiles:normalizeFiles(c.args?.answerPdfs)});
  console.error('ANYTIME_UPLOAD_DIAGNOSTIC',JSON.stringify({browser:browserName,spec:spec.qualificationName,
    expectedYear:spec.year||2024,timeline,selected:matching[0]?sanitize(matching[0]):null,
    matching:matching.map(sanitize)}));
}


for(const [browserName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
    for(const spec of [
      {qualificationId:'q063',qualificationName:'測量士補',permissionedUpload:false,answerFormat:'pdf',uploadSections:['main']},
      {qualificationId:'q090',qualificationName:'行政書士',permissionedUpload:true,answerFormat:'html',uploadSections:['年度共通']},
      {qualificationId:'q098',qualificationName:'通関士',permissionedUpload:false,answerFormat:'pdf',
        uploadSections:['通関業法','関税法等','通関実務'],year:2025,
        questionFile:'20251005tukanshi01.pdf',answerFile:'59shiken_seikai.pdf'}
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
          else if(m.method==='ui/notifications/initialized')
            window.deliver({_meta:{qlp:first},structuredContent:{status:first.status}});
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
        const inject='<script>window.__first='+JSON.stringify(first)+';window.openai={' +
          'toolOutput:window.__first,displayMode:"inline",' +
          'uploadFile:async function(file){parent.uploads.push(file.name);return {fileId:"id_"+file.name};},'+
          'getFileDownloadUrl:async function(v){return {downloadUrl:"https://files.example/"+encodeURIComponent(v.fileId)+".pdf"};},'+
          'notifyIntrinsicHeight:function(){}' +
          '};<\/script><script>';
        iframe.srcdoc=html.replace('<script>',inject);
        document.body.appendChild(iframe);
      },{html:widgetHtml(),first,spec});
      const ui=page.frameLocator('iframe');
      try { await ui.getByRole('heading',{name:'2025年度 問1'}).waitFor({timeout:8000}); }
      catch(e){
        uploadDiagnostic(browserName,spec,await page.evaluate(()=>window.calls),[]);
        throw e;
      }
      await ui.locator('input[name="ans"][value="2"]').check();
      await ui.getByRole('button',{name:'過去問の追加・登録状況'}).first().click();
      await ui.getByRole('heading',{name:'過去問の追加・登録状況'}).waitFor();
      assert.match(await ui.locator('#app').innerText(),/2025年度/);
      if(spec.permissionedUpload)await ui.locator('#sourceManageRights').check();
      await ui.locator('body').evaluate(()=>{
        const trace=[],nodes=new WeakMap();
        let nextNode=1;
        const currentYear=()=>document.getElementById('sourceManageYearHint');
        let previous=currentYear();
        const identify=n=>{
          if(!n)return null;
          if(!nodes.has(n))nodes.set(n,nextNode++);
          return nodes.get(n);
        };
        const record=event=>{
          const n=currentYear(),raw=n?.value;
          const value=typeof raw==='string'&&/^\d{0,4}$/.test(raw)?raw:raw==null?null:'<non-year>';
          trace.push({event,value,node:identify(n),detailsOpen:!!n?.closest('details')?.open});
          if(trace.length>24)trace.shift();
        };
        window.uploadYearTrace=trace;
        window.uploadYearCheckpoint=record;
        for(const event of ['focusin','input','change','blur']){
          document.addEventListener(event,e=>{
            if(e.target?.id==='sourceManageYearHint')record(event+':year');
            if(e.target?.id==='sourceManageUpload')record(event+':file');
          },true);
        }
        new MutationObserver(()=>{
          const n=currentYear();
          if(n!==previous){record('year-node-replaced');previous=n;}
        }).observe(document.getElementById('app'),{childList:true,subtree:true});
      });
      let calls;
      try{
        await ui.getByText('ファイル名から年度・試験区分が分からないとき').click();
        await ui.locator('body').evaluate(()=>window.uploadYearCheckpoint('before-fill'));
        await ui.locator('#sourceManageYearHint').fill(String(spec.year||2024));
        await ui.locator('body').evaluate(()=>window.uploadYearCheckpoint('after-fill'));
        const files=[{name:spec.questionFile||'exam.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 exam')},
          ...(spec.answerFormat==='html'?[]:[{name:spec.answerFile||'correct.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 answer')}])];
        await ui.locator('#sourceManageUpload').setInputFiles(files);
        await page.waitForFunction(()=>window.calls.some(c=>c.name==='attachPdfBatchFromPicker'),{},{timeout:12000});
        await ui.locator('#sourceManageUploadStatus').filter({hasText:'出題可能：'}).waitFor({timeout:12000});
        calls=await page.evaluate(()=>window.calls);
        const batch=calls.find(c=>c.name==='attachPdfBatchFromPicker');
        assert.ok(batch,browserName+': '+spec.qualificationName+' missing upload call');
        assert.deepEqual(batch.args.years,[spec.year||2024]);
        assert.equal(batch.args.answerPdfs.length,spec.answerFormat==='html'?0:1);
        if(spec.answerFormat==='pdf')assert.deepEqual(batch.args.answerYears,[spec.year||2024]);
      }catch(e){
        const timeline=await ui.locator('body').evaluate(()=>window.uploadYearTrace||[]).catch(()=>[]);
        uploadDiagnostic(browserName,spec,calls||await page.evaluate(()=>window.calls),timeline);
        throw e;
      }
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
console.log('PASS 375px: in-study PDF import for surveyor, licensed administrative scrivener and customs, no loss of current answer');
