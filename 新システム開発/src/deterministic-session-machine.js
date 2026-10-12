/**
 * 決定論的な学習セッション状態機械。
 * AIは dispatch() にイベントを渡せるだけで、状態を直接変更できない。
 */
export const PHASES=Object.freeze([
 'IDLE','QUALIFICATION_FIXED','SOURCE_FIXED','QUESTION_FIXED','ASSETS_FIXED',
 'PACKET_VALIDATED','RENDERED','ANSWER_WAIT','GRADED','EXPLAINED','NEXT_FIXED','FINISHED'
]);

const NEXT=Object.freeze({
 IDLE:['SET_QUALIFICATION','QUALIFICATION_FIXED'],
 QUALIFICATION_FIXED:['PIN_SOURCE','SOURCE_FIXED'],
 SOURCE_FIXED:['PIN_QUESTION','QUESTION_FIXED'],
 QUESTION_FIXED:['PIN_ASSETS','ASSETS_FIXED'],
 ASSETS_FIXED:['VALIDATE_PACKET','PACKET_VALIDATED'],
 PACKET_VALIDATED:['COMMIT_RENDER','RENDERED'],
 RENDERED:['OPEN_ANSWER','ANSWER_WAIT'],
 ANSWER_WAIT:['SUBMIT_ANSWER','GRADED'],
 GRADED:['COMMIT_EXPLANATION','EXPLAINED'],
 EXPLAINED:['FIX_NEXT','NEXT_FIXED'],
 NEXT_FIXED:['LOAD_NEXT','QUESTION_FIXED']
});

export function createDeterministicSession(initial={}){
 let state=Object.freeze({phase:'IDLE',qualification:null,source:null,question:null,assets:null,packet:null,renderReceipt:null,grade:null,...initial});
 const snapshot=()=>state;
 const reject=(reason)=>Object.freeze({ok:false,reason,state:snapshot()});
 const commit=(phase,patch={})=>{
   state=Object.freeze({...state,...patch,phase});
   return Object.freeze({ok:true,state:snapshot()});
 };
 return Object.freeze({
  state:snapshot,
  dispatch(event){
   if(!event||typeof event.type!=='string')return reject('EVENT_REQUIRED');
   const rule=NEXT[state.phase];
   if(!rule||event.type!==rule[0])return reject('TRANSITION_FORBIDDEN');

   switch(event.type){
    case 'SET_QUALIFICATION':
      if(!event.qualificationId)return reject('QUALIFICATION_REQUIRED');
      return commit(rule[1],{qualification:event.qualificationId});
    case 'PIN_SOURCE':
      if(!event.source||!event.source.problemSha256||!event.source.answerSha256)return reject('SOURCE_EVIDENCE_REQUIRED');
      return commit(rule[1],{source:Object.freeze({...event.source})});
    case 'PIN_QUESTION':
      if(!event.question||event.question.status!=='ready')return reject('READY_QUESTION_REQUIRED');
      return commit(rule[1],{question:event.question});
    case 'PIN_ASSETS':
      if(!Array.isArray(event.assets))return reject('ASSET_ARRAY_REQUIRED');
      if(event.assets.some(a=>!a.assetId||!a.sha256||!a.sourcePage))return reject('ASSET_EVIDENCE_REQUIRED');
      return commit(rule[1],{assets:Object.freeze(event.assets.map(a=>Object.freeze({...a})))});
    case 'VALIDATE_PACKET':
      if(!event.packet||event.packet.status!=='ready'||!event.packet.packetHash)return reject('VALID_PACKET_REQUIRED');
      return commit(rule[1],{packet:event.packet});
    case 'COMMIT_RENDER':
      if(!event.receipt||event.receipt.complete!==true||event.receipt.packetHash!==state.packet.packetHash)return reject('RENDER_RECEIPT_INVALID');
      return commit(rule[1],{renderReceipt:Object.freeze({...event.receipt})});
    case 'OPEN_ANSWER':
      return commit(rule[1]);
    case 'SUBMIT_ANSWER': {
      const n=Number(String(event.value).trim());
      const a=Number(state.packet?.answer?.value);
      if(!Number.isInteger(n)||!Number.isInteger(a))return reject('ANSWER_BINDING_INVALID');
      return commit(rule[1],{grade:Object.freeze({selected:n,correctAnswer:a,correct:n===a,packetHash:state.packet.packetHash})});
    }
    case 'COMMIT_EXPLANATION':
      if(!event.explanation||event.packetHash!==state.packet.packetHash)return reject('EXPLANATION_BINDING_INVALID');
      return commit(rule[1],{explanation:event.explanation,explanationSkipped:false});
    case 'SKIP_EXPLANATION':
      if(state.phase!=='GRADED'||event.packetHash!==state.packet.packetHash)return reject('EXPLANATION_BINDING_INVALID');
      return commit('EXPLAINED',{explanation:null,explanationSkipped:true});
    case 'SKIP_EXPLANATION':
      if(state.phase!=='GRADED'||event.packetHash!==state.packet.packetHash)return reject('EXPLANATION_BINDING_INVALID');
      return commit('EXPLAINED',{explanation:null,explanationSkipped:true});
    case 'FIX_NEXT':
      if(event.nextQuestionNumber===undefined)return reject('NEXT_REQUIRED');
      return commit(rule[1],{nextQuestionNumber:event.nextQuestionNumber});
    case 'LOAD_NEXT':
      if(!event.question||event.question.status!=='ready'||event.question.number!==state.nextQuestionNumber)return reject('NEXT_QUESTION_MISMATCH');
      return commit(rule[1],{question:event.question,assets:null,packet:null,renderReceipt:null,grade:null,explanation:null,nextQuestionNumber:null});
    default:return reject('UNKNOWN_EVENT');
   }
  }
 });
}

/** AIからの直接状態変更を機械的に拒否する。 */
export function rejectDirectMutation(action){
 const forbidden=new Set(['set_phase','set_answer','set_grade','set_next','bypass_validation','replace_asset']);
 if(forbidden.has(action))throw new Error('DIRECT_MUTATION_FORBIDDEN:'+action);
 return true;
}
