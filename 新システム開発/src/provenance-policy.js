/** Evidence classification. Uploaded PDF pinning never means official provenance. */
export function classifyProvenance(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return {status:'unverified',reason:'EVIDENCE_MISSING'};
  if (evidence.sourceType === 'uploaded_pinned_pdf') return {status:'user_supplied',reason:'OFFICIAL_PROVENANCE_UNVERIFIED'};
  return {status:'unverified',reason:'TRUSTED_PROVENANCE_REQUIRED'};
}
/** Verifier must be runtime-owned and independently inspect source; never pass LLM assertions as proof. */
export function createProvenanceGate({verifyOfficialSource}) {
  if (typeof verifyOfficialSource !== 'function') throw new Error('TRUSTED_SOURCE_VERIFIER_REQUIRED');
  return async function check(evidence) {
    const base=classifyProvenance(evidence);
    if (base.status==='user_supplied') return base;
    if (!evidence || evidence.sourceType!=='official_pdf_pair') return base;
    let verified=false;
    try { verified=await verifyOfficialSource(evidence); }
    catch { return {status:'unverified',reason:'SOURCE_VERIFICATION_FAILED'}; }
    if (verified!==true) return {status:'unverified',reason:'SOURCE_VERIFICATION_FAILED'};
    return {status:'official_verified',reason:null};
  };
}
