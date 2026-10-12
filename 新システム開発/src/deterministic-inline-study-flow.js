import {createDeterministicSession} from './deterministic-session-machine.js';
import {compileChatInlinePayload,verifyChatInlineReceipt} from './chat-inline-render-adapter.js';
import {compileLegalBasisExplanation,resolveExplanationPolicy} from './legal-basis-explanation.js';

function immutableJson(value){
 const copy=JSON.parse(JSON.stringify(value));
 const freeze=x=>{
  if(x&&typeof x==='object'){
   for(const v of Object.values(x))freeze(v);
   Object.freeze(x);
  }
  return x;
 };
 return freeze(copy);
}
export function createInlineStudyFlow(assetRegistry,options={}){
 const machine=createDeterministicSession();
 const verifyOfficialSource=options.verifyOfficialSource;
 let payload=null;
 let prefetchedNext=null;
 let currentExplanationPolicy='general';
 const must=r=>{if(!r||r.ok!==true)throw new Error(r?.reason||'FLOW_REJECTED');return r};
 return Object.freeze({
  state(){return machine.state()},
  prepare(x){
   const policy=resolveExplanationPolicy(x.qualificationId,x.question,x.packet);
   must(machine.dispatch({type:'SET_QUALIFICATION',qualificationId:x.qualificationId}));
   must(machine.dispatch({type:'PIN_SOURCE',source:x.source}));
   must(machine.dispatch({type:'PIN_QUESTION',question:x.question}));
   must(machine.dispatch({type:'PIN_ASSETS',assets:x.assets}));
   must(machine.dispatch({type:'VALIDATE_PACKET',packet:x.packet}));
   payload=compileChatInlinePayload(x.packet,assetRegistry);
   if(payload.status!=='ready')throw new Error(payload.reason);
   currentExplanationPolicy=policy;
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
   const policy=resolveExplanationPolicy(machine.state().qualification,question,packet);
   if(!packet.packetHash||!Number.isInteger(Number(packet.answer?.value))||Number(packet.answer.value)<1)
    throw new Error('NEXT_OFFICIAL_ANSWER_REQUIRED');
   if(!Array.isArray(nextInput.assets))throw new Error('NEXT_ASSET_EVIDENCE_REQUIRED');
   const assetsById=new Map();
   for(const asset of nextInput.assets){
    if(!asset?.assetId||!asset.sha256||!Number.isInteger(asset.sourcePage)||asset.sourcePage<1||assetsById.has(asset.assetId))
     throw new Error('NEXT_ASSET_EVIDENCE_INVALID');
    assetsById.set(asset.assetId,asset);
   }
   const visualIds=new Set(packet.contentBlocks.filter(b=>(b.type==='figure'||b.type==='table')&&b.assetId).map(b=>b.assetId));
   for(const id of visualIds){
    const evidence=assetsById.get(id), registered=assetRegistry?.resolve?.(id);
    if(!evidence||!registered||registered.questionId!==packet.id||registered.verified!==true||
       !registered.sha256||evidence.sha256!==registered.sha256)
     throw new Error('NEXT_ASSET_EVIDENCE_MISMATCH');
   }
   const pinnedInput=immutableJson({question,packet,assets:nextInput.assets});
   const nextPayload=compileChatInlinePayload(pinnedInput.packet,assetRegistry);
   if(nextPayload.status!=='ready')throw new Error(nextPayload.reason||'NEXT_RENDER_NOT_READY');
   if(nextPayload.questionId!==pinnedInput.question.id||nextPayload.packetHash!==pinnedInput.packet.packetHash)
    throw new Error('NEXT_PAYLOAD_BINDING_MISMATCH');
   const tail=nextPayload.nodes.at(-1);
   if(tail?.role!=='instruction'||tail.value!=='番号で答えてください。')
    throw new Error('NEXT_INSTRUCTION_INCOMPLETE');
   if(!nextPayload.nodes.some(n=>n.role==='choices'&&Array.isArray(n.value)&&n.value.length>0))
    throw new Error('NEXT_CHOICES_INCOMPLETE');
   prefetchedNext=Object.freeze({number,input:pinnedInput,payload:nextPayload,policy});
   return Object.freeze({ready:true,number,packetHash:nextPayload.packetHash});
  },
  answer(value){
   if(machine.state().phase!=='ANSWER_WAIT')throw new Error('ANSWER_NOT_ALLOWED');
   if(!prefetchedNext)throw new Error('NEXT_NOT_PREFETCHED');
   return must(machine.dispatch({type:'SUBMIT_ANSWER',value})).state.grade;
  },
  async explain(text){
   const s=machine.state();
   if(s.phase!=='GRADED')throw new Error('EXPLANATION_NOT_ALLOWED');
   let display=text;
   if(currentExplanationPolicy==='legal_basis_required'){
    const result=await compileLegalBasisExplanation(text,{questionId:s.question?.id,packetHash:s.packet.packetHash,verifyOfficialSource});
    if(!result.ok)throw new Error(result.reason);
    display=result.displayText;
   }
   if(typeof display!=='string'||!display.trim())throw new Error('EXPLANATION_TEXT_MISSING');
   must(machine.dispatch({type:'COMMIT_EXPLANATION',explanation:display,packetHash:s.packet.packetHash}));
   return machine.state();
  },
  next(number){
   throw new Error('NEXT_REQUIRES_READY_PACKET');
  },
  commitPrefetchedNext(){
   if(machine.state().phase!=='EXPLAINED')throw new Error('NEXT_COMMIT_NOT_ALLOWED');
   if(!prefetchedNext)throw new Error('NEXT_NOT_PREFETCHED');
   const {number,input,payload:nextPayload,policy}=prefetchedNext;
   must(machine.dispatch({type:'FIX_NEXT',nextQuestionNumber:number}));
   must(machine.dispatch({type:'LOAD_NEXT',question:input.question}));
   must(machine.dispatch({type:'PIN_ASSETS',assets:input.assets}));
   must(machine.dispatch({type:'VALIDATE_PACKET',packet:input.packet}));
   payload=nextPayload; currentExplanationPolicy=policy; prefetchedNext=null;
   return Object.freeze({state:machine.state(),payload:nextPayload});
  },
  nextReady(number,nextInput){
   throw new Error('NEXT_REQUIRES_PREFETCHED_PACKET');
  },
  load(question){
   must(machine.dispatch({type:'LOAD_NEXT',question}));
   payload=null;
   return machine.state();
  }
 });
}
