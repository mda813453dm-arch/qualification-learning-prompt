import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { widgetHtml } from '../src/widget.js';

const html=widgetHtml();
const script=html.split('<script>')[1]?.split('</script>')[0] || '';
const start=script.indexOf("    if (data && ['attached','attachedBatch','attachedAlready','pendingOfficialAnswer'].includes(data.status))");
const stop=script.indexOf("    if (data && ['officialLibrary','uploadPermissionConfirmed'].includes(data.status)) return;",start);
assert.ok(start>0 && stop>start,'real receipt branch must be extractable');
const receipt=script.slice(start,stop);
const source='function onAttached(data){\n'+receipt+'\n}\n;globalThis.onAttached=onAttached;';

function receiptHarness(){
  const timers=[], calls=[], rendered=[], frames=[], nodes={};
  let libraryTool=async()=>({status:'officialLibrary',sessionId:'s-1',permissionedUpload:true,
    personalUploadedYears:[2025],readyYearDetails:[{year:2025,questions:2}],importingYears:[],failedYears:[]});
  const app={innerHTML:'',style:{},classList:{add(){},remove(){}}};
  const state={sessionId:null,question:null,answered:false};
  const context={
    state,app, locked:false,hasView:false,licensedPollGeneration:0,attachmentPollGeneration:0,
    licensedConsentSessionId:null,saveIds:()=>{},scrollUp:()=>{},fit:()=>{},
    input:()=>({}),claimFirstFrame:(sid,force)=>{frames.push({sid,force});return true;},lockOld:()=>{context.locked=true;},
    document:{getElementById:(id)=>{
      if(!nodes[id]) nodes[id]={disabled:false,textContent:'',onclick:null,setAttribute(name,val){this[name]=val}};
      return nodes[id];
    }},
    esc:s=>String(s).replace(/</g,'&lt;'), setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},
    callTool:async(name,args)=>{calls.push({name,args});return libraryTool(name,args);},
    render:v=>rendered.push(v),console
  };
  vm.runInNewContext(source,context);
  const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  return {context,state,app,timers,calls,rendered,frames,nodes,tick,
    start:data=>context.onAttached(data),
    setTool:fn=>{libraryTool=fn;}};
}
test('PDF receipt takes over old frame, checks official state and exposes ready action without re-upload',async()=>{
  const h=receiptHarness();
  h.start({status:'attachedBatch',sessionId:'s-1',queued:3});
  assert.deepEqual(h.frames[0],{sid:'s-1',force:true});
  assert.match(h.app.innerHTML,/登録状況を再確認/,'receipt never remains a dead-end');
  assert.equal(h.state.sessionId,'s-1');
  await h.tick();
  assert.deepEqual(h.calls.map(c=>c.name),['getOfficialLibrary']);
  assert.equal(h.rendered.length,1);
  assert.equal(h.rendered[0].status,'sourceUnavailable');
  assert.deepEqual(h.rendered[0].personalUploadedYears,[2025]);
  assert.equal(h.rendered[0].readyYearDetails[0].questions,2);
});
test('transient lookup failure keeps the PDF receipt and automatically retries the SAME session',async()=>{
  const h=receiptHarness();
  h.setTool(async()=>{throw new Error('network issue');});
  h.start({status:'attachedBatch',sessionId:'s-1',queued:3});
  await h.tick();
  assert.match(h.nodes.attachedStatus.textContent,/自動で再試行/);
  assert.deepEqual(h.calls.map(c=>c.args.sessionId),['s-1']);
  assert.ok(h.timers.some(t=>t.delay===8000),'retry must be scheduled even on error');
  h.setTool(async()=>({status:'officialLibrary',sessionId:'s-1',permissionedUpload:true,
    personalUploadedYears:[2023,2024,2025],readyYearDetails:[{year:2023,questions:3}],importingYears:[2024,2025]}));
  h.timers.find(t=>t.delay===8000).fn();
  await h.tick();
  assert.equal(h.rendered.length,1);
  assert.deepEqual(h.rendered[0].importingYears,[2024,2025]);
  assert.equal(h.calls.length,2);
});
test('licensed import status never silently stops after 48 or 120 polls',()=>{
  assert.match(script,/var licensedNextDelay = 10000/);
  assert.match(script,/setTimeout\(updateLicensedStatus, licensedNextDelay\)/);
  assert.doesNotMatch(script,/pollLimit = importing\.length/);
  assert.doesNotMatch(script,/pollCount > pollLimit/);
  assert.match(script,/var statusKey = JSON\.stringify\(\[uploaded, latest\.readyYearDetails, staged, running, errors, latest\.importHistory\]\)/);
});
test('an older frame cannot falsely label itself the newest chat display',()=>{
  assert.doesNotMatch(html,/ここが最新の表示です/);
  assert.match(html,/この学習枠の先頭です/);
  assert.match(html,/この枠は以前の表示です/);
});
