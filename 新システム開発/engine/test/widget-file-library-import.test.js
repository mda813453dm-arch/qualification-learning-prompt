import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { widgetHtml } from '../src/widget.js';
import { TOOLS } from '../src/mcp.js';
const html=widgetHtml();
const script=html.split('<script>')[1]?.split('</script>')[0]||'';
const planStart=script.indexOf('  function yearFromPdfName(');
const planEnd=script.indexOf('  // 診断：',planStart);
const pickerStart=script.indexOf("      var localPdfInput = document.getElementById('licensedLocalUpload');");
const pickerEnd=script.indexOf('      var licensedGeneration = licensedPollGeneration;',pickerStart);
assert.ok(planStart>0&&planEnd>planStart&&pickerStart>0&&pickerEnd>pickerStart,'execute real widget implementation');
const source=script.slice(planStart,planEnd)+'\n'+script.slice(pickerStart,pickerEnd);
const pdfs=()=>[5,6,7].map(y=>({name:`R${y}_Mondai.pdf`,type:'application/pdf',size:1024}));
function harness(opts={}){
  const nodes={},calls=[],rendered=[],uploads=[],state={sessionId:'sess-one'};
  const host={
    getFileDownloadUrl:async({fileId})=>{
      opts.afterDownload?.(state);
      if(opts.rejectDownload)throw new Error('DENIED');
      return {downloadUrl:'https://files.example/'+fileId+'.pdf?expires=123'};
    },
    uploadFile:async file=>{uploads.push(file.name);if(opts.rejectUpload)throw new Error('DENIED');return {fileId:'local-'+file.name};},
  };
  if(opts.noUpload)delete host.uploadFile;
  const context={state,window:{openai:host},URL,Promise,Array,Map,Object,String,Number,Error,
    isHtmlAnswer:opts.htmlAnswers??true,maxBatch:10,locked:false,
    licensedConsentSessionId:opts.consent===false?null:'sess-one',
    document:{getElementById(id){return nodes[id]??=(
      {id,textContent:'',disabled:false,isConnected:true,files:[],value:'',clickCount:0,
       classList:{toggle(){},remove(){}},click(){this.clickCount++;},setAttribute(name,v){this[name]=v;}});}},
    callTool:async(name,args)=>{calls.push({name,args});return {status:'attachedBatch',sessionId:'sess-one',requested:args.questionPdfs.length,queued:args.questionPdfs.length,existing:0,failed:0,results:[]};},
    render:r=>rendered.push(r)};
  vm.runInNewContext(source,context);
  return {nodes,calls,rendered,state,host,uploads,
    flush:async()=>{for(let i=0;i<50;i++)await Promise.resolve();},
    choose:()=>{const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};nodes.licensedLocalPick.onclick(event);return event;},
    local:files=>{nodes.licensedLocalUpload.files=files;nodes.licensedLocalUpload.onchange();}};
}
test('local R5/R6/R7 selection automatically uploads and registers one private batch',async()=>{
  const h=harness();assert.equal(h.choose().defaultPrevented,false);
  assert.equal(h.nodes.licensedLocalUpload.clickCount,0,'native input receives the tap directly');
  assert.equal(h.calls.length,0,'no upload before selection');h.local(pdfs());await h.flush();
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'attachPdfBatchFromPicker');
  assert.equal(h.calls[0].args.sessionId,'sess-one');
  assert.deepEqual(Array.from(h.calls[0].args.questionPdfs,x=>x.file_name),pdfs().map(p=>p.name));
  assert.equal(h.calls[0].args.answerPdfs,undefined);
  assert.ok(h.calls[0].args.questionPdfs.every(x=>x.download_url.startsWith('https://files.example/')&&x.file_id));
  assert.equal(h.rendered.length,1);assert.equal(h.rendered[0].status,'attachedBatch');
});
test('missing consent blocks picker and automatic upload',async()=>{
  const h=harness({consent:false});assert.equal(h.choose().defaultPrevented,true);h.local(pdfs());await h.flush();
  assert.equal(h.nodes.licensedLocalUpload.clickCount,0);assert.equal(h.uploads.length,0);
  assert.equal(h.calls.length,0);assert.match(h.nodes.licensedFileStatus.textContent,/許諾/);
});
test('cancelled file chooser never uploads or registers',async()=>{
  const h=harness();h.choose();h.local([]);await h.flush();
  assert.equal(h.uploads.length,0);assert.equal(h.calls.length,0);assert.equal(h.rendered.length,0);
});
for(const mode of ['rejectUpload','rejectDownload'])test(mode+' never creates partial registration and restores button',async()=>{
  const h=harness({[mode]:true});h.local(pdfs());await h.flush();
  assert.equal(h.calls.length,0);assert.equal(h.rendered.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/ファイル送信が完了していません/);
  assert.equal(h.nodes.licensedLocalPick.disabled,false);assert.equal(h.nodes.licensedLocalUpload.disabled,false);
});
test('unavailable upload API never invents a file reference',async()=>{
  const h=harness({noUpload:true});h.local(pdfs());await h.flush();
  assert.equal(h.calls.length,0);assert.match(h.nodes.licensedFileStatus.textContent,/送信できません/);
});
test('duplicate year rejected before upload',async()=>{
  const h=harness();h.local([pdfs()[0],{name:'R5_別.pdf',type:'application/pdf',size:1024}]);await h.flush();
  assert.equal(h.uploads.length,0);assert.equal(h.calls.length,0);assert.match(h.nodes.licensedFileStatus.textContent,/重複/);
});
test('session switch rejects cross-session registration',async()=>{
  const h=harness({afterDownload:state=>{state.sessionId='other-session';}});h.local(pdfs());await h.flush();
  assert.equal(h.calls.length,0);assert.equal(h.rendered.length,0);assert.match(h.nodes.licensedFileStatus.textContent,/セッションが変わりました/);
});
test('private registration API retains permissions and no extra chat frame',()=>{
  const tool=TOOLS.find(x=>x.name==='attachPdfBatchFromPicker'),model=TOOLS.find(x=>x.name==='attachPdfBatch');
  assert.equal(tool.appOnly,true);assert.equal(tool.uiOnly,true);
  assert.equal(tool.meta['openai/outputTemplate'],undefined);assert.equal(tool.meta['openai/fileParams'],undefined);
  assert.deepEqual(tool.meta.ui.visibility,['app']);assert.equal(tool.meta['openai/widgetAccessible'],true);
  assert.equal(tool.meta['openai/visibility'],'private');assert.equal(tool.inputSchema,model.inputSchema);assert.equal(tool.api,model.api);
  assert.doesNotMatch(html,/licensedChooseSaved|ChatGPT内のPDFを選んで登録|window\.openai\.selectFiles/);
  assert.match(html,/<label class="file-picker" id="licensedLocalPick"><span id="licensedLocalPickText">iPhone内のPDFを探す<\/span><input id="licensedLocalUpload"/);
  assert.doesNotMatch(html, /localPdfInput\.click\(\)/);
  assert.match(script,/host\.getFileDownloadUrl\(\{ fileId:fileId \}\)/);
});
test('repeated changes or taps during upload cannot register twice',async()=>{
  const h=harness();let finish;
  h.host.uploadFile=file=>{h.uploads.push(file.name);return new Promise(resolve=>{finish=resolve;});};
  h.local([pdfs()[0]]);h.local([pdfs()[0]]);h.choose();
  assert.equal(h.nodes.licensedLocalPick['aria-busy'],'true');assert.equal(h.nodes.licensedLocalUpload.clickCount,0);
  assert.equal(h.nodes.licensedLocalPickText.textContent,'PDFを送信中…');
  assert.match(h.nodes.licensedFileStatus.textContent,/完了した年度を自動で表示/);
  assert.deepEqual(h.uploads,['R5_Mondai.pdf']);finish({fileId:'f5'});await h.flush();
  assert.equal(h.calls.length,1);assert.equal(h.nodes.licensedLocalPick['aria-busy'],'false');assert.equal(h.nodes.licensedLocalUpload.value,'');
});
test('search button remains available for all personal registration states',()=>{
  assert.match(html,/id="licensedLocalPick"/);const i=html.indexOf('id="licensedLocalPick"');
  assert.doesNotMatch(html.slice(Math.max(0,i-2600),i),/personal\.length \?\s*'[^']+licensedLocalPick/);
});
