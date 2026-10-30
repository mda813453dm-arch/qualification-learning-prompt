import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { widgetHtml } from '../src/widget.js';
import { TOOLS } from '../src/mcp.js';

const html=widgetHtml();
const script=html.split('<script>')[1]?.split('</script>')[0] || '';
const planStart=script.indexOf('  function yearFromPdfName(');
const planEnd=script.indexOf('  // 診断：',planStart);
const pickerStart=script.indexOf("      var chosenPdfButton = document.getElementById('licensedChooseSaved');");
const pickerEnd=script.indexOf('      var licensedGeneration = licensedPollGeneration;',pickerStart);
assert.ok(planStart>0 && planEnd>planStart && pickerStart>0 && pickerEnd>pickerStart,
  'evaluate real PDF year/permission/file-picker widget implementation, not a copied mock');
const source=script.slice(planStart,planEnd)+'\n'+script.slice(pickerStart,pickerEnd);

function harness(opts={}){
  const nodes={}, calls=[], rendered=[], picked=[];
  const state={sessionId:'sess-one'};
  let selected=opts.selected ?? [
    {fileId:'f5',fileName:'R5_Mondai.pdf',mimeType:'application/pdf'},
    {fileId:'f6',fileName:'R6_Mondai.pdf',mimeType:'application/pdf'},
    {fileId:'f7',fileName:'R7_Mondai.pdf',mimeType:'application/pdf'},
  ];
  const selectedHost={
    selectFiles:()=>{picked.push('selectFiles'); if(opts.rejectPicker)throw new Error('DENIED'); return Promise.resolve(selected);},
    getFileDownloadUrl:async ({fileId})=> {
      if(opts.afterDownload)opts.afterDownload(state);
      if(opts.rejectDownload)throw new Error('DENIED');
      return {downloadUrl:'https://files.example/'+fileId+'.pdf?expires=123'};
    },
    uploadFile:async file=>({fileId:'local-'+file.name}),
  };
  if(opts.noLibrary)delete selectedHost.selectFiles;
  const context={
    state, window:{openai:selectedHost}, URL, Promise, Array, Map, Object, String, Number, Error,
    isHtmlAnswer: opts.htmlAnswers ?? true,maxBatch:10,locked:false,
    licensedConsentSessionId:opts.consent===false?null:'sess-one',
    document:{getElementById(id){
      if(!nodes[id])nodes[id]={id,textContent:'',disabled:false,isConnected:true,files:[],value:'',
        setAttribute(name,v){this[name]=v;}};
      return nodes[id];
    }},
    callTool:async (name,args)=> {calls.push({name,args});return opts.toolReturn ?? {status:'attachedBatch',sessionId:'sess-one',requested:args.questionPdfs.length,queued:args.questionPdfs.length,existing:0,failed:0,results:[]};},
    render:r=>rendered.push(r),
  };
  vm.runInNewContext(source,context);
  const flush=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
  return {nodes,calls,rendered,state,picked,selectedHost,flush,choose:()=>nodes.licensedChooseSaved.onclick(),local:files=>{
    nodes.licensedLocalUpload.files=files;
    nodes.licensedLocalUpload.onchange();
  }};
}
test('authorized existing R5/R6/R7 PDF library files go to the same private batch API, without model fileParams',async()=>{
  const h=harness();
  h.choose();await h.flush();
  assert.deepEqual(h.picked,['selectFiles']);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].name,'attachPdfBatchFromPicker');
  assert.equal(h.calls[0].args.sessionId,'sess-one');
  assert.deepEqual(Array.from(h.calls[0].args.questionPdfs,x=>x.file_name),['R5_Mondai.pdf','R6_Mondai.pdf','R7_Mondai.pdf']);
  assert.equal(h.calls[0].args.answerPdfs,undefined,'行政書士はPDF正答を要求しない');
  assert.ok(h.calls[0].args.questionPdfs.every(x=>x.download_url.startsWith('https://files.example/')&&x.file_id));
  assert.equal(h.rendered.length,1,'registered batch always returns to auto status screen');
  assert.equal(h.rendered[0].status,'attachedBatch');
});
test('user consent missing means no file picker and no server upload',async()=>{
  const h=harness({consent:false});
  h.choose();await h.flush();
  assert.equal(h.picked.length,0);
  assert.equal(h.calls.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/許諾/);
});
test('ChatGPT file-library safety or permission refusal is final, no unsafe fallback or fake completion',async()=>{
  const h=harness({rejectPicker:true});
  h.choose();await h.flush();
  assert.equal(h.calls.length,0);
  assert.equal(h.rendered.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/許可されません/);
});
test('unavailable file-library picker explains the alternative, never invents a file reference',async()=>{
  const h=harness({noLibrary:true});
  h.choose();await h.flush();
  assert.equal(h.calls.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/利用できません/);
});
test('invalid or duplicated year filenames are rejected before transfer',async()=>{
  const h=harness({selected:[
    {fileId:'a',fileName:'R5_Mondai.pdf',mimeType:'application/pdf'},
    {fileId:'b',fileName:'R5_別.pdf',mimeType:'application/pdf'},
  ]});
  h.choose();await h.flush();
  assert.equal(h.calls.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/重複/);
});
test('session switch during authorized download rejects cross-session import',async()=>{
  const h=harness({afterDownload:state=>{state.sessionId='other-session';}});
  h.choose();await h.flush();
  assert.equal(h.calls.length,0);
  assert.equal(h.rendered.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/セッションが変わりました/);
});
test('iPhone local picker uses supported uploadFile and existing private batch verification path',async()=>{
  const h=harness();
  h.local([{name:'R5_Mondai.pdf',type:'application/pdf',size:1024},
    {name:'R6_Mondai.pdf',type:'application/pdf',size:1024}]);
  await h.flush();
  assert.equal(h.calls.length,1);
  assert.deepEqual(Array.from(h.calls[0].args.questionPdfs,x=>x.file_id),['local-R5_Mondai.pdf','local-R6_Mondai.pdf']);
  assert.equal(h.rendered[0].status,'attachedBatch');
});
test('PDF download URL authorization failure does not create a partial registration',async()=>{
  const h=harness({rejectDownload:true});
  h.choose();await h.flush();
  assert.equal(h.calls.length,0);
  assert.equal(h.rendered.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/ファイル送信が完了していません/);
});
test('picker-only MCP endpoint has no output template and never appears in model tool list',()=>{
  const tool=TOOLS.find(x=>x.name==='attachPdfBatchFromPicker');
  const model=TOOLS.find(x=>x.name==='attachPdfBatch');
  assert.equal(tool.appOnly,true);
  assert.equal(tool.uiOnly,true);
  assert.equal(tool.meta,undefined,'no outputTemplate and no fileParams needed for host-authorized references');
  assert.equal(tool.inputSchema,model.inputSchema);
  assert.equal(tool.api,model.api,'reuse exact validated private upload endpoint');
  assert.match(html,/id="licensedChooseSaved"/);
  assert.match(html,/id="licensedLocalUpload"/);
  assert.match(script,/window\.openai\.selectFiles\(\)/);
  assert.match(script,/host\.getFileDownloadUrl\(\{ fileId:fileId \}\)/);
});

test('repeated iPhone taps cannot open two file pickers or submit twice',async()=>{
  const h=harness();
  let finish;
  h.selectedHost.selectFiles=()=>{h.picked.push('dialog');return new Promise(resolve=>{finish=resolve;});};
  h.choose();h.choose();
  assert.deepEqual(h.picked,['dialog']);
  assert.equal(h.nodes.licensedChooseSaved.disabled,true);
  finish([{fileId:'f5',fileName:'R5_Mondai.pdf',mimeType:'application/pdf'}]);
  await h.flush();
  assert.equal(h.calls.length,1);
  assert.equal(h.nodes.licensedChooseSaved.disabled,false);
});
test('async host safety denial is visible and never falls through to engine upload',async()=>{
  const h=harness();
  h.selectedHost.selectFiles=()=>Promise.reject(new Error('DENIED'));
  h.choose();await h.flush();
  assert.equal(h.calls.length,0);
  assert.match(h.nodes.licensedFileStatus.textContent,/許可されません/);
  assert.equal(h.nodes.licensedChooseSaved.disabled,false);
});
