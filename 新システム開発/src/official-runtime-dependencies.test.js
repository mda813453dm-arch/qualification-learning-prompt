import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createResolveCandidates, createBuildInlinePayload } from "./official-runtime-dependencies.js";

const PLAN_HASH = "a".repeat(64);
const pin = {
  registryKey: "土地家屋調査士:2025:午後",
  questionPdfUrl: "https://www.moj.go.jp/content/001450011.pdf",
  answerPdfUrl: "https://www.moj.go.jp/content/001450015.pdf",
  questionPdfSha256: "928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c",
  answerPdfSha256: "3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad"
};
const plan = { status: "approved", qualificationId: "土地家屋調査士", sha256: PLAN_HASH, itemIds: ["control-points"] };
const row = { ...pin, qualificationId: plan.qualificationId, studyUnitId: "control-points",
  studyPlanSha256: PLAN_HASH, year: 2025, section: "午後", questionId: "土地家屋調査士:2025:午後:2" };

test("resolver returns only approved same-unit candidate rows bound to existing PDF pins", async () => {
  const resolve = createResolveCandidates({
    loadApprovedStudyPlan: async () => plan,
    loadOfficialCandidateRecords: async () => [row]
  });
  const result = await resolve({ qualificationId: plan.qualificationId, studyUnitId: "control-points", studyPlanSha256: PLAN_HASH });
  assert.equal(result.status, "approved");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].questionId, row.questionId);
});

test("resolver fails closed when the existing source has no same-unit candidates", async () => {
  const resolve = createResolveCandidates({
    loadApprovedStudyPlan: async () => plan,
    loadOfficialCandidateRecords: async () => []
  });
  assert.equal((await resolve({ qualificationId: plan.qualificationId, studyUnitId: "control-points", studyPlanSha256: PLAN_HASH })).reason,
    "SAME_UNIT_OFFICIAL_CANDIDATES_NOT_FOUND");
});

test("resolver rejects a row whose PDF hashes differ from the existing pin", async () => {
  const resolve = createResolveCandidates({
    loadApprovedStudyPlan: async () => plan,
    loadOfficialCandidateRecords: async () => [{ ...row, questionPdfSha256: "0".repeat(64) }]
  });
  assert.equal((await resolve({ qualificationId: plan.qualificationId, studyUnitId: "control-points", studyPlanSha256: PLAN_HASH })).reason,
    "OFFICIAL_CANDIDATE_PIN_MISMATCH");
});

test("inline payload rejects missing assets, hash mismatch, and incomplete display packet", async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const hash = createHash("sha256").update(png).digest("hex");
  const candidate = { questionId: row.questionId, studyUnitId: row.studyUnitId, studyPlanSha256: PLAN_HASH };
  const base = { status: "ready", questionId: row.questionId, packetHash: PLAN_HASH, signature: "question_number>body>official_figure>choices>instruction",
    nodes: [
      { type: "text", role: "question_number", value: "問2" }, { type: "text", role: "body", value: "本文" },
      { type: "image", role: "official_figure", value: "https://assets.example/q2.png", assetId: "fig-q2", sha256: hash },
      { type: "choices", role: "choices", value: ["A", "B"] },
      { type: "text", role: "instruction", value: "番号で答えてください。" }
    ], markdown: "問2\n\n本文\n\n![公式図](https://assets.example/q2.png)\n\n選択肢\n1. A\n2. B\n\n番号で答えてください。",
    question: { id: row.questionId }, packet: { id: row.questionId, packetHash: PLAN_HASH } };
  const input = { candidate, verifiedResult: { status: "verified" }, studyUnitId: row.studyUnitId, studyPlanSha256: PLAN_HASH };
  const good = createBuildInlinePayload({ compileVerifiedBundle: async () => base,
    fetchImpl: async () => new Response(png, { headers: { "content-type": "image/png" } }) });
  assert.equal((await good(input)).status, "ready");
  const missing = createBuildInlinePayload({ compileVerifiedBundle: async () => base,
    fetchImpl: async () => { throw new Error("missing asset"); } });
  assert.equal((await missing(input)).reason, "OFFICIAL_PNG_FETCH_REJECTED");
  const mismatch = createBuildInlinePayload({ compileVerifiedBundle: async () => base,
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }) });
  assert.equal((await mismatch(input)).reason, "OFFICIAL_PNG_CONTENT_HASH_MISMATCH");
  const incomplete = createBuildInlinePayload({ compileVerifiedBundle: async () => ({ ...base, nodes: base.nodes.slice(0, -1) }),
    fetchImpl: async () => new Response(png, { headers: { "content-type": "image/png" } }) });
  assert.equal((await incomplete(input)).reason, "COMPLETE_INLINE_PACKET_REQUIRED");
});
