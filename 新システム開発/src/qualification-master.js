import { QUALIFICATION_CATALOG } from "./qualification-catalog.js";

/**
 * Official-source qualification registry. Unverified fields never become facts.
 * Data discovery is external; only validated official evidence can be promoted.
 */
const VERIFIED_OVERRIDES = Object.freeze({
  fp_1: Object.freeze({
    id: "q001", name: "FP技能検定1級", aliases: ["FP技能検定1級", "FP1級", "FP 1級"],
    year: 2026, subjects: ["学科試験（きんざい）", "実技試験（実施団体・科目によって異なる）"],
    exemption: Object.freeze({ status: "unverified", scopeStatus: "unverified",
      officialEvidenceOfScheme: "学科試験の一部合格等による免除制度がある。条件・実施団体別適用を要確認",
      evidence: [
        {url:"https://www.jafp.or.jp/exam/outline/1fp/",authority:"日本FP協会",year:2026,claim:"1級実技試験における学科試験免除申請条件"},
        {url:"https://www.kinzai.or.jp/fp",authority:"金融財政事情研究会",year:2026,claim:"一部合格による免除制度"}
      ] })
  }),
  fp_2: Object.freeze({
    id: "q002", name: "FP技能検定2級", aliases: ["FP技能検定2級", "FP2級", "FP 2級"],
    year: 2026, subjects: ["学科試験", "実技試験（資産設計提案業務など実施団体別）"],
    exemption: Object.freeze({ status: "unverified", scopeStatus: "unverified",
      officialEvidenceOfScheme: "学科・実技の一部合格者等に試験免除制度あり。免除期限・実技科目・実施団体を確認する必要あり",
      evidence: [
        {url:"https://www.jafp.or.jp/exam/outline/",authority:"日本FP協会",year:2026,claim:"学科・実技試験の一部合格による免除"},
        {url:"https://www.kinzai.or.jp/fp",authority:"金融財政事情研究会",year:2026,claim:"学科・実技試験の一部合格による免除"}
      ] })
  }),
  fp_3: Object.freeze({
    id: "q003", name: "FP技能検定3級", aliases: ["FP技能検定3級", "FP3級", "FP 3級"],
    year: 2026, subjects: ["学科試験", "実技試験（資産設計提案業務など実施団体別）"],
    exemption: Object.freeze({ status: "unverified", scopeStatus: "unverified",
      officialEvidenceOfScheme: "学科・実技の一部合格者等に試験免除制度あり。免除期限・実技科目・実施団体を確認する必要あり",
      evidence: [
        {url:"https://www.jafp.or.jp/exam/outline/",authority:"日本FP協会",year:2026,claim:"学科・実技試験の一部合格による免除"},
        {url:"https://www.kinzai.or.jp/fp",authority:"金融財政事情研究会",year:2026,claim:"学科・実技試験の一部合格による免除"}
      ] })
  }),

  land_surveyor: Object.freeze({
    id: "land_surveyor", name: "土地家屋調査士", aliases: ["土地家屋調査士", "調査士"],
    year: 2026, authority: "法務省・法務局",
    subjects: ["午前の部", "午後の部（択一式）", "午後の部（記述式）"],
    exemption: Object.freeze({ status: "unverified", scopeStatus: "unverified",
      officialEvidenceOfScheme: "午前の部の免除制度あり（公式受験案内で確認）",
      evidence: [{url:"https://houmukyoku.moj.go.jp/tokyo/page000001_01085.html",authority:"法務局",year:2026,claim:"午前の部免除制度の案内"}] })
  }),
  surveyor: Object.freeze({
    id: "surveyor", name: "測量士", aliases: ["測量士"],
    year: 2026, authority: "国土地理院",
    subjects: ["測量に関する法規", "測地測量", "測図測量・GIS", "三次元点群測量", "応用測量"],
    exemption: Object.freeze({status:"unverified",scopeStatus:"unverified",
      evidence:[{url:"https://www.gsi.go.jp/LAW/R8shiken_00001.html",authority:"国土地理院",year:2026,claim:"試験概要と科目を確認、免除制度は未確定"}]})
  }),
  assistant_surveyor: Object.freeze({
    id: "assistant_surveyor", name: "測量士補", aliases: ["測量士補"],
    year: 2026, authority: "国土地理院",
    subjects: ["測量に関する法規", "測地測量", "測図測量", "応用測量"],
    exemption: Object.freeze({status:"unverified",scopeStatus:"unverified",
      evidence:[{url:"https://www.gsi.go.jp/LAW/R8shiken_00001.html",authority:"国土地理院",year:2026,claim:"試験概要と科目を確認、免除制度は未確定"}]})
  }),
  customs_broker: Object.freeze({
    id: "customs_broker", name: "通関士", aliases: ["通関士"],
    year: 2026, authority: "税関",
    subjects: ["通関業法", "関税法等", "通関実務"],
    exemption: Object.freeze({status:"unverified",scopeStatus:"unverified",
      officialEvidenceOfScheme:"試験科目の一部免除制度あり（公式案内で確認）",
      evidence:[{url:"https://www.customs.go.jp/tsukanshi/60_shiken.htm",authority:"税関",year:2026,claim:"試験科目一部免除申請の案内"}]})
  }),
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

const mergedByName = new Map(QUALIFICATION_CATALOG.map(row => [row.name, row]));
for (const override of Object.values(VERIFIED_OVERRIDES)) {
  const base = mergedByName.get(override.name) ?? {};
  mergedByName.set(override.name, Object.freeze({
    ...base,
    ...override,
    aliases: Object.freeze([...new Set([...(base.aliases ?? []), ...(override.aliases ?? [])])]),
    exemption: override.exemption
  }));
}
export const QUALIFICATION_MASTER = Object.freeze(Object.fromEntries(
  [...mergedByName.values()].map(record => [record.id, record])
));
if (Object.keys(QUALIFICATION_MASTER).length !== 103) {
  throw new Error(`QUALIFICATION_MASTER_COUNT_MISMATCH:${Object.keys(QUALIFICATION_MASTER).length}`);
}

const normalizeQualificationName = value =>
  String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, "");

export function resolveQualification(name, registry = QUALIFICATION_MASTER) {
  const normalized = normalizeQualificationName(name);
  return Object.values(registry).find(q =>
    q.aliases.some(a => normalizeQualificationName(a) === normalized)
  ) ?? null;
}

const normalizedHost = value => {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
};

const isOfficialForRecord = (record, url) => {
  const evidenceHost = normalizedHost(url);
  const sourceHost = normalizedHost(record?.pastQuestionsUrl);
  if (!evidenceHost || !sourceHost) return false;
  return evidenceHost === sourceHost ||
    evidenceHost.endsWith(`.${sourceHost}`) ||
    sourceHost.endsWith(`.${evidenceHost}`);
};

export function validateQualificationRecord(record, year) {
  if (!record || !Number.isInteger(year) || record.year !== year || !record.id) return { status: "rejected", reason: "YEAR_OR_ID_INVALID" };
  const e = record.exemption;
  if (!e || !["verified_present", "verified_absent", "unverified"].includes(e.status)) return { status: "rejected", reason: "EXEMPTION_STATUS_INVALID" };
  if (e.status === "unverified") return { status: "pending", reason: "OFFICIAL_VERIFICATION_REQUIRED" };
  if (!Array.isArray(e.evidence) || !e.evidence.length || e.evidence.some(s => !isOfficialForRecord(record, s.url) || s.year !== year || !s.claim))
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
