import { createOfficialRetrievalPipeline } from './official-retrieval-pipeline.js';
import { gradeVerifiedAnswer } from './verified-question-gate.js';
/** In-process prototype; retrieval must be trusted server-owned verification. */
export function createOfficialPracticeController({retrieveAndVerify, adapters}) {
  const retrieve = createOfficialRetrievalPipeline({retrieveAndVerify, adapters});
  const active = new Map();
  return {
    async request(sessionKey, candidate) {
      if (typeof sessionKey !== 'string' || !sessionKey.trim()) throw new Error('SESSION_KEY_REQUIRED');
      active.delete(sessionKey);
      const result = await retrieve(candidate);
      if (result.status !== 'ready') return {status: result.status, reason: result.reason, failures: result.failures};
      const verified = result.verifiedQuestion;
      active.set(sessionKey, verified);
      return {status:'question', key:structuredClone(verified.question.key), text:verified.question.text, choices:[...verified.question.choices]};
    },
    submit(sessionKey, choice) {
      const verified = active.get(sessionKey);
      if (!verified) throw new Error('NO_VERIFIED_ACTIVE_QUESTION');
      const result = gradeVerifiedAnswer(verified, choice);
      active.delete(sessionKey);
      return {status:'graded', ...result};
    },
    cancel(sessionKey) {active.delete(sessionKey);}
  };
}
