import { adaptVerifiedExtraction } from "./retrieval-evidence-adapter.js";

const isSha256 = value => /^[a-f0-9]{64}$/.test(value || "");
const fail = reason => ({ status: "rejected", reason, attempts: [] });

function isCompleteInlinePayload(payload, candidate) {
  if (!payload || payload.status !== "ready" ||
      payload.questionId !== candidate.questionId ||
      payload.question?.id !== candidate.questionId ||
      payload.packet?.id !== candidate.questionId ||
      !isSha256(payload.packetHash) ||
      payload.packet?.packetHash !== payload.packetHash ||
      !Array.isArray(payload.nodes) || payload.nodes.length < 4) return false;
  const roles = payload.nodes.map(node => node?.role);
  if (roles[0] !== "question_number" || roles.at(-2) !== "choices" ||
      roles.at(-1) !== "instruction" ||
      payload.nodes.at(-1)?.value !== "番号で答えてください。" ||
      !Array.isArray(payload.nodes.at(-2)?.value) ||
      payload.nodes.at(-2).value.length < 2 ||
      roles.join(">") !== payload.signature) return false;
  return true;
}

/**
 * 公式取得を承認済みの同一単元候補列に限定する。
 * resolveCandidates / buildInlinePayload はサーバー所有関数。
 * 完全なインライン表示payloadが生成・照合されるまで出題可能としない。
 */
export function createOfficialRetrievalPipeline({
  retrieveAndVerify, adapters, resolveCandidates, buildInlinePayload
}) {
  if (typeof retrieveAndVerify !== "function" || !Array.isArray(adapters) ||
      typeof resolveCandidates !== "function" || typeof buildInlinePayload !== "function")
    throw new Error("PIPELINE_CONFIGURATION_REQUIRED");

  return async function retrieve({ studyPlan, studyUnitId, yearFixed = null } = {}) {
    if (!studyPlan || studyPlan.status !== "approved" || !studyPlan.qualificationId ||
        !isSha256(studyPlan.sha256) || !Array.isArray(studyPlan.itemIds) ||
        !studyPlan.itemIds.includes(studyUnitId)) {
      return fail("APPROVED_STUDY_PLAN_REQUIRED");
    }

    const resolved = await resolveCandidates({
      qualificationId: studyPlan.qualificationId,
      studyUnitId,
      studyPlanSha256: studyPlan.sha256,
      yearFixed
    });
    if (!resolved || resolved.status !== "approved" || !Array.isArray(resolved.candidates)) {
      return { status: "unavailable", reason: "APPROVED_CANDIDATE_QUEUE_REQUIRED", attempts: [] };
    }

    const candidates = resolved.candidates;
    if (candidates.length === 0 || candidates.length > 10) {
      return { status: "unavailable", reason: "CANDIDATE_QUEUE_EMPTY_OR_OVER_LIMIT", attempts: [] };
    }

    const seen = new Set();
    let previousYear = Infinity;
    for (const candidate of candidates) {
      if (!candidate || candidate.qualificationId !== studyPlan.qualificationId ||
          candidate.studyUnitId !== studyUnitId || candidate.studyPlanSha256 !== studyPlan.sha256 ||
          !Number.isInteger(candidate.year) || candidate.year < 1900 ||
          typeof candidate.questionId !== "string" || !candidate.questionId ||
          typeof candidate.section !== "string" || !candidate.section) {
        return fail("CANDIDATE_BINDING_INVALID");
      }
      if (yearFixed !== null && candidate.year !== yearFixed) {
        return fail("FIXED_YEAR_CANDIDATE_MISMATCH");
      }
      if (candidate.year > previousYear) return fail("CANDIDATE_YEAR_ORDER_INVALID");
      previousYear = candidate.year;
      const key = [candidate.qualificationId, candidate.year, candidate.section, candidate.questionId].join(":");
      if (seen.has(key)) return fail("CANDIDATE_DUPLICATE");
      seen.add(key);
    }

    const attempts = [];
    for (const candidate of candidates) {
      let result;
      try {
        result = await retrieveAndVerify(candidate, adapters);
      } catch (error) {
        attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "failed", reason: String(error?.message || "RETRIEVAL_ERROR") });
        continue;
      }
      if (!result || result.status !== "verified") {
        attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "unverified", reason: result?.reason ?? "NOT_VERIFIED" });
        continue;
      }

      const q = result.question, a = result.answer;
      if (!q || q.id !== candidate.questionId || String(q.year) !== String(candidate.year) ||
          q.section !== candidate.section || !a || a.questionId !== candidate.questionId ||
          String(a.year) !== String(candidate.year) || a.section !== candidate.section ||
          result.key?.qualification !== studyPlan.qualificationId) {
        attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "rejected", reason: "QUESTION_CANDIDATE_IDENTITY_MISMATCH" });
        continue;
      }

      const gated = adaptVerifiedExtraction({
        verified: true,
        key: result.key,
        question: q,
        answer: a
      }, { trustedServerVerification: true });
      if (!gated.ok) {
        attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "rejected", failures: gated.failures });
        continue;
      }

      let inlinePayload;
      try {
        inlinePayload = await buildInlinePayload({
          candidate, verifiedResult: result, questionEvidence: gated,
          studyUnitId, studyPlanSha256: studyPlan.sha256
        });
      } catch (error) {
        attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "rejected", reason: String(error?.message || "INLINE_BUILD_FAILED") });
        continue;
      }
      if (!isCompleteInlinePayload(inlinePayload, candidate)) {
        attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "rejected", reason: "COMPLETE_INLINE_PACKET_REQUIRED" });
        continue;
      }

      attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "ready" });
      return {
        status: "ready",
        verifiedQuestion: Object.freeze({
          ...gated,
          studyUnitId,
          studyPlanSha256: studyPlan.sha256,
          kind: "official_practice",
          origin: "official",
          verifiedBundle: true,
          inlinePayload
        }),
        attempts
      };
    }

    return { status: "unavailable", reason: "SAME_UNIT_CANDIDATES_EXHAUSTED", attempts };
  };
}
