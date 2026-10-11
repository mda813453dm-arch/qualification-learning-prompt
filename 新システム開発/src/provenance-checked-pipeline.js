import {createOfficialRetrievalPipeline} from './official-retrieval-pipeline.js';
import {createProvenanceGate} from './provenance-policy.js';
/** Fail-closed composition. Verification callback MUST independently verify official PDF provenance. */
export function createProvenanceCheckedPipeline({retrieveAndVerify,adapters,verifyOfficialSource}) {
 if(typeof retrieveAndVerify!=='function')throw new Error('RETRIEVER_REQUIRED');
 const gate=createProvenanceGate({verifyOfficialSource});
 const inner=createOfficialRetrievalPipeline({adapters,retrieveAndVerify:async(candidate,adaptersArg)=>{
  const result=await retrieveAndVerify(candidate,adaptersArg);
  if(!result||result.status!=='verified')return result;
  const classification=await gate(result.provenance);
  if(classification.status!=='official_verified')return {status:'unavailable',reason:classification.reason||'OFFICIAL_PROVENANCE_UNVERIFIED',attempts:result.attempts??[]};
  if(result.question?.source?.url!==result.provenance?.questionPdfUrl || result.answer?.source?.url!==result.provenance?.answerPdfUrl) return {status:'unavailable',reason:'SOURCE_URL_MISMATCH',attempts:result.attempts??[]};
  return result;
 }});
 return inner;
}
