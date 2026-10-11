import { adaptVerifiedExtraction } from "./retrieval-evidence-adapter.js";
/**
 * 取得・照合エンジンを呼び出し、検証済み問題だけを新採点ゲートに渡す。
 * retrieveAndVerify はサーバー所有の旧エンジン。外部の任意入力を渡さない。
 */
export function createOfficialRetrievalPipeline({ retrieveAndVerify, adapters }) {
  if (typeof retrieveAndVerify !== "function" || !Array.isArray(adapters)) throw new Error("PIPELINE_CONFIGURATION_REQUIRED");
  return async function retrieve(candidate) {
    const result = await retrieveAndVerify(candidate, adapters);
    if (!result || result.status !== "verified") {
      return { status: "unavailable", attempts: result?.attempts ?? [], reason: result?.reason ?? "NOT_VERIFIED" };
    }
    const gated = adaptVerifiedExtraction({
      verified: true,
      key: result.key,
      question: result.question,
      answer: result.answer
    }, { trustedServerVerification: true });
    if (!gated.ok) return { status: "rejected", failures: gated.failures, attempts: result.attempts ?? [] };
    return { status: "ready", verifiedQuestion: gated, attempts: result.attempts ?? [] };
  };
}
