import {createDeterministicSession} from './deterministic-session-machine.js';
import {compileChatInlinePayload,verifyChatInlineReceipt} from './chat-inline-render-adapter.js';

export function createInlineStudyFlow(assetRegistry){
 const machine=createDeterministicSession();
 let payload=null;
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
  answer(value){
   if(machine.state().phase!=='ANSWER_WAIT')throw new Error('ANSWER_NOT_ALLOWED');
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
