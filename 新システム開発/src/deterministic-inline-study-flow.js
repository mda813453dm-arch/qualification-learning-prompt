import {createDeterministicSession} from './deterministic-session-machine.js';
import {compileChatInlinePayload,verifyChatInlineReceipt} from './chat-inline-render-adapter.js';

export function createInlineStudyFlow(assetRegistry){
 const machine=createDeterministicSession();
 let payload=null;
 let prefetchedNext=null;
 const must=r=>{if(!r||r.ok!==true)throw new Error(r?.reason||'FLOW_REJECTED');return r};
 return Object.freeze({
  state(){return machine.state()},
  prepare(x){
   must(machine.dispatch({type:'SET_QUALIFICATION',qualificationId:x.qualificationId}));
   must(machine.dispatch({type:'PIN_SOURCE',source:x.source}));
   must(machine.dispatch({type:'PIN_QUESTION',question:x.question}));
   must(machine.dispatch({type:'PIN_ASSETS',assets:x.assets}));
   must(machine.dispatch({type:'VALIDATE_PACKET',packet:x.packet}));
   payload=compileChatInlinePayload(x.packet,assetRegistry);
   if(payload.status!=='ready')throw new Error(payload.reason);
   return payload;
  },
  rendered(receipt){
   if(!payload)throw new Error('PAYLOAD_NOT_PREPARED');
   const v=verifyChatInlineReceipt(payload,receipt);
   if(!v.ok)throw new Error(v.reason);
   must(machine.dispatch({type:'COMMIT_RENDER',receipt}));
   must(machine.dispatch({type:'OPEN_ANSWER'}));
   return machine.state();
  },
  prefetchNext(number,nextInput){
   if(machine.state().phase!=='ANSWER_WAIT')throw new Error('NEXT_PREFETCH_NOT_ALLOWED');
   const question=nextInput?.question;
   const packet=nextInput?.packet;
   if(!question||question.status!=='ready'||question.number!==number)throw new Error('NEXT_NUMBER_MISMATCH');
   if(!packet||packet.status!=='ready')throw new Error('NEXT_PACKET_NOT_READY');
   if(packet.number!==number)throw new Error('NEXT_PACKET_NUMBER_MISMATCH');
   if(!question.id||packet.id!==question.id)throw new Error('NEXT_QUESTION_ID_MISMATCH');
   if(!packet.packetHash||!Number.isInteger(Number(packet.answer?.value)))throw new Error('NEXT_OFFICIAL_ANSWER_REQUIRED');
   const nextPayload=compileChatInlinePayload(packet,assetRegistry);
   if(nextPayload.status!=='ready')throw new Error(nextPayload.reason||'NEXT_RENDER_NOT_READY');
   if(nextPayload.questionId!==question.id||nextPayload.packetHash!==packet.packetHash)throw new Error('NEXT_PAYLOAD_BINDING_MISMATCH');
   prefetchedNext=Object.freeze({number,nextInput,nextPayload});
   return Object.freeze({ready:true,number,packetHash:nextPayload.packetHash});
  },
  answer(value){
   if(machine.state().phase!=='ANSWER_WAIT')throw new Error('ANSWER_NOT_ALLOWED');
   if(!prefetchedNext)throw new Error('NEXT_NOT_PREFETCHED');
   return must(machine.dispatch({type:'SUBMIT_ANSWER',value})).state.grade;
  },
  explain(text){
   const s=machine.state();
   if(s.phase!=='GRADED')throw new Error('EXPLANATION_NOT_ALLOWED');
   must(machine.dispatch({type:'COMMIT_EXPLANATION',explanation:text,packetHash:s.packet.packetHash}));
   return machine.state();
  },
  next(number){
   throw new Error('NEXT_REQUIRES_READY_PACKET');
  },
  commitPrefetchedNext(){
   if(machine.state().phase!=='EXPLAINED')throw new Error('NEXT_COMMIT_NOT_ALLOWED');
   if(!prefetchedNext)throw new Error('NEXT_NOT_PREFETCHED');
   const {number,nextInput,nextPayload}=prefetchedNext;
   must(machine.dispatch({type:'FIX_NEXT',nextQuestionNumber:number}));
   must(machine.dispatch({type:'LOAD_NEXT',question:nextInput.question}));
   payload=nextPayload; prefetchedNext=null;
   return Object.freeze({state:machine.state(),payload:nextPayload});
  },
  nextReady(number,nextInput){
   if(!nextInput?.packet||nextInput.packet.status!=='ready')throw new Error('NEXT_PACKET_NOT_READY');
   const nextPayload=compileChatInlinePayload(nextInput.packet,assetRegistry);
   if(nextPayload.status!=='ready')throw new Error(nextPayload.reason||'NEXT_RENDER_NOT_READY');
   must(machine.dispatch({type:'FIX_NEXT',nextQuestionNumber:number}));
   must(machine.dispatch({type:'LOAD_NEXT',question:nextInput.question}));
   payload=nextPayload;
   return Object.freeze({state:machine.state(),payload:nextPayload});
  },
  load(question){
   must(machine.dispatch({type:'LOAD_NEXT',question}));
   payload=null;
   return machine.state();
  }
 });
}
