import {createGuardedPracticeController} from './guarded-practice-controller.js';
/**
 * Compatibility entry: a trusted independent verifier and deterministic
 * candidate/payload dependencies are mandatory.
 */
export function createOfficialPracticeController({
 retrieveAndVerify,adapters,verifyOfficialSource,resolveCandidates,buildInlinePayload
}={}) {
 if(typeof verifyOfficialSource!=='function')throw new Error('TRUSTED_SOURCE_VERIFIER_REQUIRED');
 return createGuardedPracticeController({
  retrieveAndVerify,adapters,verifyOfficialSource,resolveCandidates,buildInlinePayload
 });
}
