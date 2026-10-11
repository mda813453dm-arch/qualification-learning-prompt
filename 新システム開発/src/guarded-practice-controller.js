import {createProvenanceCheckedPipeline} from './provenance-checked-pipeline.js';
import {gradeVerifiedAnswer} from './verified-question-gate.js';
/** Public-safe controller: the legacy controller is development-only. */
export function createGuardedPracticeController({retrieveAndVerify,adapters,verifyOfficialSource}) {
 const retrieve=createProvenanceCheckedPipeline({retrieveAndVerify,adapters,verifyOfficialSource});
 const active=new Map();
 const generations=new Map();
 return {
  async request(sessionKey,candidate) {
   if(typeof sessionKey!=='string'||!sessionKey.trim())throw new Error('SESSION_KEY_REQUIRED');
   const generation=(generations.get(sessionKey)||0)+1;
   generations.set(sessionKey,generation);
   active.delete(sessionKey);
   let result;
   try {result=await retrieve(candidate);}
   catch {return {status:'unavailable',reason:'RETRIEVAL_FAILED'};}
   if(generations.get(sessionKey)!==generation)return {status:'superseded'};
   if(result.status!=='ready')return {status:result.status,reason:result.reason,failures:result.failures};
   active.set(sessionKey,result.verifiedQuestion);
   const q=result.verifiedQuestion.question;
   return {status:'question',key:structuredClone(q.key),text:q.text,choices:[...q.choices]};
  },
  submit(sessionKey,choice) {
   const q=active.get(sessionKey);
   if(!q)throw new Error('NO_VERIFIED_ACTIVE_QUESTION');
   const result=gradeVerifiedAnswer(q,choice);
   active.delete(sessionKey);
   return {status:'graded',...result};
  },
  cancel(sessionKey) {
   generations.set(sessionKey,(generations.get(sessionKey)||0)+1);
   active.delete(sessionKey);
  }
 };
}
