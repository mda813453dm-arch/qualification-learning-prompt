import {createOfficialRetrievalPipeline} from './official-retrieval-pipeline.js';
import {createProvenanceGate} from './provenance-policy.js';
/** Fail-closed composition. Verification and packet compilation callbacks are server-owned. */
export function createProvenanceCheckedPipeline({
 retrieveAndVerify,adapters,verifyOfficialSource,resolveCandidates,buildInlinePayload
}) {
 if(typeof retrieveAndVerify!=='function')throw new Error('RETRIEVER_REQUIRED');
 const gate=createProvenanceGate({verifyOfficialSource});
 const inner=createOfficialRetrievalPipeline({
  adapters,resolveCandidates,buildInlinePayload,
  retrieveAndVerify:async(candidate,adaptersArg)=>{
   const result=await retrieveAndVerify(candidate,adaptersArg);
   if(!result||result.status!=='verified')return result;
   const expectedRegistryKey = `${result.key?.qualification}:${result.question?.year}:${result.question?.section}`;
   if(result.provenance?.registryKey && result.provenance.registryKey !== expectedRegistryKey) return {status:'unavailable',reason:'REGISTRY_KEY_MISMATCH',attempts:result.attempts??[]};
   const classification=await gate(result.provenance);
   if(classification.status!=='official_verified')return {status:'unavailable',reason:classification.reason||'OFFICIAL_PROVENANCE_UNVERIFIED',attempts:result.attempts??[]};
   if(result.question?.source?.url!==result.provenance?.questionPdfUrl || result.answer?.source?.url!==result.provenance?.answerPdfUrl) return {status:'unavailable',reason:'SOURCE_URL_MISMATCH',attempts:result.attempts??[]};
   return result;
  }
 });
 return inner;
}
