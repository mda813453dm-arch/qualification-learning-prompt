import {createOfficialPracticeEntry} from './official-practice-entry.js';
import {createPdfByteEvidenceGate} from './pdf-byte-evidence-gate.js';
/**
 * Server-only composition. Never expose extractText, retrieveAndVerify or PDF bytes
 * as user-controlled API parameters. Candidate resolution and packet compilation
 * are trusted server dependencies and must be supplied explicitly.
 */
export function createPdfBoundPracticeEntry({
 retrieveAndVerify,extractText,adapters,resolveCandidates,buildInlinePayload
}) {
 if(typeof retrieveAndVerify!=='function'||typeof extractText!=='function')throw new Error('TRUSTED_INTERNAL_DEPENDENCIES_REQUIRED');
 const byteGate=createPdfByteEvidenceGate({extractText});
 const verifiedRetrieve=async(candidate,adapterList)=>{
  const result=await retrieveAndVerify(candidate,adapterList);
  if(!result||result.status!=='verified')return result;
  const evidence=result.byteEvidence;
  if(!evidence)return {status:'unavailable',reason:'PDF_BYTE_EVIDENCE_REQUIRED'};
  const verified=await byteGate(evidence);
  if(!verified.ok)return {status:'unavailable',reason:verified.reason};
  if(evidence.registryKey!==result.provenance?.registryKey||evidence.rawSpan!==result.spanEvidence?.rawSpan)return {status:'unavailable',reason:'BYTE_SPAN_IDENTITY_MISMATCH'};
  if(typeof evidence.answerEvidence!=='string'||!result.answer?.evidence?.includes(evidence.answerEvidence))return {status:'unavailable',reason:'ANSWER_EVIDENCE_MISMATCH'};
  return result;
 };
 return createOfficialPracticeEntry({retrieveAndVerify:verifiedRetrieve,adapters,resolveCandidates,buildInlinePayload});
}
