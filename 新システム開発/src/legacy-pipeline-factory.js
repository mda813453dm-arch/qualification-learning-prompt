import { retrieveAndVerify } from "./legacy-retrieval-engine.js";
import { createOfficialRetrievalPipeline } from "./official-retrieval-pipeline.js";
/**
 * Legacy extractor adapter. The approved question queue and complete inline
 * packet builder remain explicit server-owned dependencies.
 */
export function createLegacyVerifiedPipeline({adapters,resolveCandidates,buildInlinePayload}={}) {
  return createOfficialRetrievalPipeline({
    retrieveAndVerify,adapters,resolveCandidates,buildInlinePayload
  });
}
