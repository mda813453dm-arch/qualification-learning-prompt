import {createGuardedPracticeController} from './guarded-practice-controller.js';
import {createOfficialPdfSourceVerifier} from './official-pdf-source-verifier.js';
import {createPinnedOfficialVerifier} from './official-pdf-pins.js';
/**
 * Application entrypoint: no caller-provided official-verification boolean or hash registry.
 * retrieveAndVerify must be internal extraction, never user or model input.
 */
export function createOfficialPracticeEntry({retrieveAndVerify,adapters}) {
 const verifyOfficialSource=createPinnedOfficialVerifier({
  verifyOfficialSource:createOfficialPdfSourceVerifier()
 });
 return createGuardedPracticeController({retrieveAndVerify,adapters,verifyOfficialSource});
}
