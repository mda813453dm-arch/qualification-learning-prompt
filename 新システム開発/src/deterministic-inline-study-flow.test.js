import {createInlineStudyFlow} from './deterministic-inline-study-flow.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const throws=(fn,expected,m)=>{
 let error=null;
 try{fn()}catch(e){error=e}
 ok(error!==null,m+': did not block');
 if(expected)ok(error.message===expected,m+': expected '+expected+', got '+error.message);
};
const currentPacket={status:'ready',id:'q2',number:2,packetHash:'p2',answer:{value:4},contentBlocks:[
 {order:0,type:'question_number',value:'Q2'},{order:1,type:'text',value:'stem'},
 {order:2,type:'figure',assetId:'f2'},{order:3,type:'choices',value:['1','2','3','4','5']},
 {order:4,type:'instruction',value:'番号で答えてください。'}]};
const registry={resolve:id=>id==='f2'?{questionId:'q2',verified:true,mime:'image/png',inlineRef:'inline-f2',sha256:'fig'}:
 id==='f3'?{questionId:'q3',verified:true,mime:'image/png',inlineRef:'inline-f3',sha256:'fig3'}:null};
function answerWait(){
 const flow=createInlineStudyFlow(registry);
 const payload=flow.prepare({qualificationId:'land-surveyor',source:{problemSha256:'p',answerSha256:'a'},
  question:{status:'ready',id:'q2',number:2},assets:[{assetId:'f2',sha256:'fig',sourcePage:2}],packet:currentPacket});
 throws(()=>flow.answer(4),'ANSWER_NOT_ALLOWED','render前の回答');
 flow.rendered({complete:true,questionId:'q2',packetHash:'p2',signature:payload.signature,nodeCount:payload.nodes.length});
 ok(flow.state().phase==='ANSWER_WAIT','完全表示後に回答待ち');
 return flow;
}
function q3Packet(){
 return {status:'ready',id:'q3',number:3,packetHash:'p3',answer:{value:2},contentBlocks:[
  {order:0,type:'question_number',value:'Q3'},
  {order:1,type:'text',value:'stem3'},
  {order:2,type:'figure',assetId:'f3'},
  {order:3,type:'choices',value:['1','2','3','4','5']},
  {order:4,type:'instruction',value:'番号で答えてください。'}]};
}
function q3Input(packet=q3Packet(),question={status:'ready',id:'q3',number:3}){
 return {question,packet};
}
// 描画済みでも次問prefetch前は採点禁止。
const noPrefetch=answerWait();
throws(()=>noPrefetch.answer(4),'NEXT_NOT_PREFETCHED','prefetch前の採点');
ok(noPrefetch.state().phase==='ANSWER_WAIT','prefetch前は回答待ち状態を保持');
// 不完全な次問packetは拒否し、採点可能にしない。
const incomplete=answerWait();
throws(()=>incomplete.prefetchNext(3,q3Input({status:'ready',id:'q3',number:3,packetHash:'p3',answer:{value:2},
 contentBlocks:[{order:0,type:'question_number',value:'Q3'}]})),'PAYLOAD_INCOMPLETE','不完全packet');
throws(()=>incomplete.answer(4),'NEXT_NOT_PREFETCHED','不完全packet後の採点');
// 次問番号およびpacket番号不一致を拒否。
const wrongQuestionNumber=answerWait();
throws(()=>wrongQuestionNumber.prefetchNext(3,q3Input(q3Packet(),{status:'ready',id:'q3',number:4})),
 'NEXT_NUMBER_MISMATCH','次問question番号不一致');
const wrongPacketNumber=answerWait();
throws(()=>wrongPacketNumber.prefetchNext(3,q3Input({...q3Packet(),number:4})),
 'NEXT_PACKET_NUMBER_MISMATCH','次問packet番号不一致');
// 図表必須問題で公式assetがない場合は拒否。
const missingAsset=answerWait();
const missingFigure=q3Packet();
missingFigure.contentBlocks[2]={order:2,type:'figure',assetId:'missing-f3'};
throws(()=>missingAsset.prefetchNext(3,q3Input(missingFigure)),'INLINE_FIGURE_UNAVAILABLE','公式図asset欠落');
throws(()=>missingAsset.answer(4),'NEXT_NOT_PREFETCHED','図asset欠落後の採点');
// 次問本文・図・選択肢・回答要求を完全検証してから採点可能。
const flow=answerWait();
const ready=flow.prefetchNext(3,q3Input());
ok(ready.ready===true&&ready.number===3&&ready.packetHash==='p3','次問prefetch成功');
ok(flow.answer(4).correct===true,'固定済み公式正答で採点');
flow.explain('explanation');
throws(()=>flow.next(3),'NEXT_REQUIRES_READY_PACKET','見出しだけの次問遷移');
const next=flow.commitPrefetchedNext();
ok(next.state.phase==='QUESTION_FIXED'&&next.state.question.id==='q3','準備済み次問へ遷移');
ok(next.payload.status==='ready'&&next.payload.questionId==='q3'&&next.payload.packetHash==='p3','次問payload完全');
ok(next.payload.nodes.some(n=>n.role==='official_figure'&&n.value==='inline-f3'),'公式図を保持');
ok(next.payload.nodes.at(-1).role==='instruction'&&next.payload.nodes.at(-1).value==='番号で答えてください。',
 '次問末尾に回答要求');
ok(next.payload.nodes.some(n=>n.role==='choices'),'次問選択肢を保持');
console.log('PASS deterministic inline flow mandatory prefetch and fail-closed cases');
