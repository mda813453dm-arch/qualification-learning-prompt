/**
 * Official-source qualification registry. Unverified fields never become facts.
 * Data discovery is external; only validated official evidence can be promoted.
 */
export const QUALIFICATION_MASTER = Object.freeze({
  takken: Object.freeze({
    id: "takken", name: "宅地建物取引士", aliases: ["宅建", "宅建士", "宅地建物取引士"],
    year: 2026,
    exemption: Object.freeze({
      status: "verified_present",
      scopeStatus: "verified",
      name: "登録講習修了者の5問免除",
      excludedQuestionNumbers: [46, 47, 48, 49, 50],
      excludedTopics: ["土地・建物の形質等（免除対象部分）", "宅地・建物の需給に関する法令及び実務（免除対象部分）"],
      evidence: [
        { url: "https://moushikomi.retio.or.jp/", authority: "指定試験機関", year: 2026, claim: "登録講習修了者は5問免除、対象は試験案内の(1)及び(5)" },
        { url: "https://www.retio.or.jp/exam/tourokukosyu/", authority: "指定試験機関", year: 2026, claim: "登録講習修了者の5問免除制度" }
      ]
    })
  })
});

export function resolveQualification(name, registry = QUALIFICATION_MASTER) {
  const normalized = String(name ?? "").normalize("NFKC").trim().replace(/\s+/g, "");
  return Object.values(registry).find(q => q.aliases.some(a => a.normalize("NFKC") === normalized)) ?? null;
}

const isOfficial = url => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password &&
      (u.hostname === "retio.or.jp" || u.hostname.endsWith(".retio.or.jp") ||
       u.hostname === "mlit.go.jp" || u.hostname.endsWith(".mlit.go.jp") ||
       u.hostname === "moj.go.jp" || u.hostname.endsWith(".moj.go.jp"));
  } catch { return false; }
};

export function validateQualificationRecord(record, year) {
  if (!record || !Number.isInteger(year) || record.year !== year || !record.id) return { status: "rejected", reason: "YEAR_OR_ID_INVALID" };
  const e = record.exemption;
  if (!e || !["verified_present", "verified_absent", "unverified"].includes(e.status)) return { status: "rejected", reason: "EXEMPTION_STATUS_INVALID" };
  if (e.status === "unverified") return { status: "pending", reason: "OFFICIAL_VERIFICATION_REQUIRED" };
  if (!Array.isArray(e.evidence) || !e.evidence.length || e.evidence.some(s => !isOfficial(s.url) || s.year !== year || !s.claim))
    return { status: "rejected", reason: "OFFICIAL_EVIDENCE_REQUIRED" };
  if (e.status === "verified_present" && (e.scopeStatus !== "verified" ||
      !Array.isArray(e.excludedQuestionNumbers) || !e.excludedQuestionNumbers.length ||
      new Set(e.excludedQuestionNumbers).size !== e.excludedQuestionNumbers.length ||
      e.excludedQuestionNumbers.some(n => !Number.isInteger(n) || n < 1 || n > 100)))
    return { status: "pending", reason: "EXEMPTION_SCOPE_UNVERIFIED" };
  return { status: "verified" };
}

/**
 * Never infer exemption scope from a learner's assertion.
 * The question-number exclusion is exact; broad topics are NOT excluded wholesale.
 */
export function planExemption({ qualificationName, examYear = 2026, userUsesExemption = null, registry = QUALIFICATION_MASTER } = {}) {
  const record = resolveQualification(qualificationName, registry);
  if (!record) return { status: "master_missing", next: "official_research_required" };
  const checked = validateQualificationRecord(record, examYear);
  if (checked.status !== "verified") return { status: "blocked", reason: checked.reason, next: "official_research_required" };
  if (record.exemption.status === "verified_absent") return { status: "ready", askExemption: false, excludedQuestionNumbers: [] };
  if (userUsesExemption === null) return { status: "needs_user_choice", askExemption: true, choices: ["利用する", "利用しない"] };
  if (typeof userUsesExemption !== "boolean") return { status: "blocked", reason: "INVALID_USER_CHOICE" };
  return { status: "ready", askExemption: false,
    excludedQuestionNumbers: userUsesExemption ? [...record.exemption.excludedQuestionNumbers] : [],
    exclusionMode: "question_numbers_only", exemptionApplied: userUsesExemption };
}

/** Candidate records from AI research must remain pending until externally checked. */
export function createPendingQualification({ id, name, year, evidence = [] } = {}) {
  return { id, name, year, exemption: { status: "unverified", scopeStatus: "unverified", evidence }, approval: "pending" };
}
