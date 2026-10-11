import {createGuardedPracticeController} from './guarded-practice-controller.js';
/**
 * Compatibility entry: a trusted independent verifier is mandatory.
 * The old flag-only implementation has been disabled.
 */
export function createOfficialPracticeController({retrieveAndVerify,adapters,verifyOfficialSource}={}) {
 if(typeof verifyOfficialSource!=='function')throw new Error('TRUSTED_SOURCE_VERIFIER_REQUIRED');
 return createGuardedPracticeController({retrieveAndVerify,adapters,verifyOfficialSource});
}
