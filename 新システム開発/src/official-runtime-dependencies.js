import { createHash } from "node:crypto";
import { OFFICIAL_PDF_PINS } from "./official-pdf-pins.js";
import { renderChatInlineMarkdown } from "./chat-inline-render-adapter.js";

const HASH = /^[a-f0-9]{64}$/;
const blocked = reason => Object.freeze({ status: "unavailable", reason });

/**
 * Resolve only candidate rows supplied by the already-approved official
 * candidate source. Shared official source rows may omit per-user plan hashes;
 * the approved study plan is checked separately at selection time.
 * This module does not create or extend a candidate ledger.
 */
export function createResolveCandidates({
  loadApprovedStudyPlan,
  loadOfficialCandidateRecords,
  pins = OFFICIAL_PDF_PINS
} = {}) {
  if (typeof loadApprovedStudyPlan !== "function" || typeof loadOfficialCandidateRecords !== "function")
    throw new Error("OFFICIAL_CANDIDATE_SOURCE_REQUIRED");

  return async function resolveCandidates({ qualificationId, studyUnitId, studyPlanSha256, yearFixed = null, questionNumber = null } = {}) {
    if (!qualificationId || !studyUnitId || !HASH.test(studyPlanSha256 || "")) return blocked("STUDY_PLAN_BINDING_REQUIRED");
    let plan, records;
    try {
      plan = await loadApprovedStudyPlan({ qualificationId, studyUnitId, studyPlanSha256 });
      records = await loadOfficialCandidateRecords({ qualificationId, studyUnitId, questionNumber, year: yearFixed ?? 2025 });
    } catch {
      return blocked("OFFICIAL_CANDIDATE_SOURCE_UNAVAILABLE");
    }
    if (!plan || plan.status !== "approved" || plan.qualificationId !== qualificationId ||
        plan.sha256 !== studyPlanSha256 || !Array.isArray(plan.itemIds) || !plan.itemIds.includes(studyUnitId))
      return blocked("APPROVED_STUDY_PLAN_MISMATCH");
    if (!Array.isArray(records)) return blocked("OFFICIAL_CANDIDATE_SOURCE_INVALID");

    const candidates = [];
    const seen = new Set();
    let priorYear = Infinity;
    for (const row of records) {
      if (!row || row.qualificationId !== qualificationId || row.studyUnitId !== studyUnitId ||
          (row.studyPlanSha256 !== undefined && row.studyPlanSha256 !== studyPlanSha256) || !Number.isInteger(row.year) ||
          typeof row.questionId !== "string" || !row.questionId || typeof row.section !== "string" || !row.section)
        return blocked("OFFICIAL_CANDIDATE_BINDING_INVALID");
      if (yearFixed !== null && row.year !== yearFixed) continue;
      const pin = pins[row.registryKey];
      if (!pin || row.questionPdfUrl !== pin.questionPdfUrl || row.answerPdfUrl !== pin.answerPdfUrl ||
          row.questionPdfSha256 !== pin.questionSha256 || row.answerPdfSha256 !== pin.answerSha256)
        return blocked("OFFICIAL_CANDIDATE_PIN_MISMATCH");
      const registryParts = row.registryKey.split(":");
      if (registryParts.length < 3 || registryParts[1] !== String(row.year) ||
          registryParts.slice(2).join(":") !== row.section)
        return blocked("OFFICIAL_CANDIDATE_REGISTRY_IDENTITY_MISMATCH");
      if (row.year > priorYear) return blocked("OFFICIAL_CANDIDATE_ORDER_INVALID");
      priorYear = row.year;
      const key = `${row.qualificationId}:${row.year}:${row.section}:${row.questionId}`;
      if (seen.has(key)) return blocked("OFFICIAL_CANDIDATE_DUPLICATE");
      seen.add(key);
      candidates.push(Object.freeze({
        qualificationId, studyUnitId, studyPlanSha256, year: row.year,
        section: row.section, questionId: row.questionId,
        registryKey: row.registryKey,
        key: Object.freeze({ qualification: registryParts[0], year: String(row.year), section: row.section, questionId: row.questionId }),
        questionUrl: row.questionPdfUrl, answerCandidates: Object.freeze([row.answerPdfUrl])
      }));
    }
    return candidates.length
      ? Object.freeze({ status: "approved", candidates: Object.freeze(candidates) })
      : blocked("SAME_UNIT_OFFICIAL_CANDIDATES_NOT_FOUND");
  };
}

function parseHttpsPng(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash ||
        (url.port && url.port !== "443") || !url.pathname.toLowerCase().endsWith(".png")) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const p = host.split(".").map(Number);
      if (p.some(n => n > 255) || p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
          (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
          (p[0] === 192 && p[1] === 168)) return null;
    }
    return url;
  } catch { return null; }
}

/**
 * Adapt the repository's verified bundle compiler and independently verify
 * every emitted PNG against the asset digest before returning a payload.
 */
export function createBuildInlinePayload({ compileVerifiedBundle, fetchImpl = fetch, maxAssetBytes = 8_000_000 } = {}) {
  if (typeof compileVerifiedBundle !== "function" || typeof fetchImpl !== "function")
    throw new Error("VERIFIED_BUNDLE_COMPILER_AND_FETCH_REQUIRED");

  return async function buildInlinePayload(input = {}) {
    const { candidate, verifiedResult, studyUnitId, studyPlanSha256 } = input;
    if (!candidate || !verifiedResult || verifiedResult.status !== "verified" ||
        candidate.studyUnitId !== studyUnitId || candidate.studyPlanSha256 !== studyPlanSha256)
      return blocked("VERIFIED_BUNDLE_INPUTS_REQUIRED");
    let payload;
    try { payload = await compileVerifiedBundle(input); }
    catch { return blocked("VERIFIED_BUNDLE_COMPILATION_FAILED"); }
    if (!payload || payload.status !== "ready" || payload.questionId !== candidate.questionId ||
        payload.question?.id !== candidate.questionId || payload.packet?.id !== candidate.questionId ||
        !HASH.test(payload.packetHash || "") || payload.packet?.packetHash !== payload.packetHash ||
        !Array.isArray(payload.nodes) || payload.nodes.at(-1)?.role !== "instruction" ||
        payload.nodes.at(-1)?.value !== "番号で答えてください。" ||
        !payload.nodes.some(n => n?.role === "choices" && Array.isArray(n.value) && n.value.length >= 2))
      return blocked("COMPLETE_INLINE_PACKET_REQUIRED");
    if (payload.signature !== payload.nodes.map(n => n?.role).join(">")) return blocked("INLINE_SIGNATURE_MISMATCH");

    for (const node of payload.nodes.filter(n => n?.type === "image" && ["official_figure", "official_table"].includes(n.role))) {
      const url = parseHttpsPng(node.value);
      if (!url || !node.assetId || !HASH.test(node.sha256 || "")) return blocked("OFFICIAL_PNG_REFERENCE_INVALID");
      let response, bytes;
      try {
        response = await fetchImpl(url, { redirect: "error", headers: { accept: "image/png" } });
        if (!response?.ok || response.redirected || (response.url && response.url !== url.href) ||
            String(response.headers?.get?.("content-type") || "").toLowerCase().split(";")[0].trim() !== "image/png")
          return blocked("OFFICIAL_PNG_FETCH_REJECTED");
        const declared = Number(response.headers?.get?.("content-length"));
        if (Number.isFinite(declared) && declared > maxAssetBytes) return blocked("OFFICIAL_PNG_TOO_LARGE");
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch { return blocked("OFFICIAL_PNG_FETCH_REJECTED"); }
      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (bytes.length < pngSignature.length || pngSignature.some((value, index) => bytes[index] !== value) ||
          bytes.length > maxAssetBytes || createHash("sha256").update(bytes).digest("hex") !== node.sha256)
        return blocked("OFFICIAL_PNG_CONTENT_HASH_MISMATCH");
    }
    const rendered = renderChatInlineMarkdown(payload);
    if (rendered.status !== "ready" || rendered.markdown !== payload.markdown)
      return blocked("INLINE_RENDER_INTEGRITY_FAILED");
    return Object.freeze(payload);
  };
}

// Verified qualification master: deterministic exemption decision for AI clients.
export { QUALIFICATION_MASTER, resolveQualification, validateQualificationRecord,
  planExemption, createPendingQualification } from "./qualification-master.js";
