import {createInlineStudyFlow} from './deterministic-inline-study-flow.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const packet={status:'ready',id:'q2',number:2,packetHash:'p2',answer:{value:4},contentBlocks:[
 {order:0,type:'question_number',value:'Q2'},{order:1,type:'text',value:'stem'},
 {order:2,type:'figure',assetId:'f2'},{order:3,type:'choices',value:['1','2','3','4','5']},
 {order:4,type:'instruction',value:'番号で答えてください。'}]};
const reg={resolve:id=>id==='f2'?{questionId:'q2',verified:true,mime:'image/png',inlineRef:'inline-f2',sha256:'fig'}:null};
const flow=createInlineStudyFlow(reg);
const payload=flow.prepare({qualificationId:'land-surveyor',source:{problemSha256:'p',answerSha256:'a'},question:{status:'ready',number:2},assets:[{assetId:'f2',sha256:'fig',sourcePage:2}],packet});
let blocked=false;try{flow.answer(4)}catch{blocked=true}ok(blocked,'answer before render must block');
flow.rendered({complete:true,questionId:'q2',packetHash:'p2',signature:payload.signature,nodeCount:payload.nodes.length});
ok(flow.answer(4).correct===true,'pinned grade');
flow.explain('explanation');
flow.next(3);
ok(flow.load({status:'ready',number:3}).phase==='QUESTION_FIXED','next load');
console.log('PASS deterministic inline flow');
