import test from "node:test";
import assert from "node:assert/strict";
import { createPinnedOnDemandCandidateLoader } from "./pinned-on-demand-candidates.js";
import { createResolveCandidates } from "./official-runtime-dependencies.js";

const qualificationId = "q041";
const studyUnitId = "takken-u8";
const hash = "a".repeat(64);
const plan = { status: "approved", qualificationId, sha256: hash, itemIds: [studyUnitId] };

test("approved question 29 generates one pinned candidate and resolves without row plan hash", async () => {
  const loadOfficialCandidateRecords = createPinnedOnDemandCandidateLoader({
    approvedQuestionUnit: async ({ questionNumber, studyUnitId }) => questionNumber === 29 && studyUnitId === "takken-u8"
  });
  const resolve = createResolveCandidates({
    loadApprovedStudyPlan: async () => plan, loadOfficialCandidateRecords
  });
  const result = await resolve({ qualificationId, studyUnitId, studyPlanSha256: hash, yearFixed: 2025, questionNumber: 29 });
  assert.equal(result.status, "approved");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].questionId, "q041:2025:年度共通:29");
  assert.equal(result.candidates[0].studyPlanSha256, hash);
});

test("unapproved question-to-unit mapping cannot generate candidate", async () => {
  const loader = createPinnedOnDemandCandidateLoader({ approvedQuestionUnit: async () => false });
  assert.deepEqual(await loader({ qualificationId, studyUnitId, year: 2025, questionNumber: 30 }), []);
});

test("unknown year without a pinned PDF cannot generate candidate", async () => {
  const loader = createPinnedOnDemandCandidateLoader({ approvedQuestionUnit: async () => true });
  assert.deepEqual(await loader({ qualificationId, studyUnitId, year: 2024, questionNumber: 29 }), []);
});
