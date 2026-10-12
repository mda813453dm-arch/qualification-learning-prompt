import { adaptVerifiedExtraction } from "./retrieval-evidence-adapter.js";

const isSha256 = value => /^[a-f0-9]{64}$/.test(value || "");

/**
 * 公式取得を承認済みの同一単元候補列に限定する。
 * resolveCandidates は公式索引等から候補を構築するサーバー所有関数。
 * AIや利用者から渡された任意の候補列をそのまま信頼しない。
 */
export function createOfficialRetrievalPipeline({ retrieveAndVerify, adapters, resolveCandidates }) {
  if (typeof retrieveAndVerify !== "function" || !Array.isArray(adapters) ||
      typeof resolveCandidates !== "function") throw new Error("PIPELINE_CONFIGURATION_REQUIRED");

  return async function retrieve({ studyPlan, studyUnitId, yearFixed = null } = {}) {
    if (!studyPlan || studyPlan.status !== "approved" || !studyPlan.qualificationId ||
        !isSha256(studyPlan.sha256) || !Array.isArray(studyPlan.itemIds) ||
        !studyPlan.itemIds.includes(studyUnitId)) {
      return { status: "rejected", reason: "APPROVED_STUDY_PLAN_REQUIRED", attempts: [] };
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
        return { status: "rejected", reason: "CANDIDATE_BINDING_INVALID", attempts: [] };
      }
      if (yearFixed !== null && candidate.year !== yearFixed) {
        return { status: "rejected", reason: "FIXED_YEAR_CANDIDATE_MISMATCH", attempts: [] };
      }
      if (candidate.year > previousYear) {
        return { status: "rejected", reason: "CANDIDATE_YEAR_ORDER_INVALID", attempts: [] };
      }
      previousYear = candidate.year;
      const key = [candidate.qualificationId, candidate.year, candidate.section, candidate.questionId].join(":");
      if (seen.has(key)) return { status: "rejected", reason: "CANDIDATE_DUPLICATE", attempts: [] };
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
      attempts.push({ candidateId: candidate.questionId, year: candidate.year, status: "ready" });
      return {
        status: "ready",
        verifiedQuestion: Object.freeze({
          ...gated,
          studyUnitId,
          studyPlanSha256: studyPlan.sha256,
          kind: "official_practice",
          origin: "official",
          verifiedBundle: true
        }),
        attempts
      };
    }

    return { status: "unavailable", reason: "SAME_UNIT_CANDIDATES_EXHAUSTED", attempts };
  };
}
