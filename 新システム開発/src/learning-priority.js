// Deterministic learning-priority engine.
// All AI clients must use the same supplied evidence; they must not invent frequency data.

export const PRIORITY_EVIDENCE = Object.freeze({
  VERIFIED_FREQUENCY: "verified_frequency",
  OFFICIAL_OVERVIEW_ORDER: "official_overview_order",
  FIXED_FALLBACK_ORDER: "fixed_fallback_order"
});

function normalizeArea(area, index) {
  if (typeof area === "string") return { id: area, label: area, overviewOrder: index + 1 };
  return { ...area, overviewOrder: area.overviewOrder ?? index + 1 };
}

export function rankLearningAreas({ areas, questionRecords = [] }) {
  if (!Array.isArray(areas) || areas.length === 0) throw new Error("areas required");
  const normalized = areas.map(normalizeArea);
  const valid = questionRecords.filter(r =>
    r && r.officialVerified === true && r.areaId &&
    Number.isInteger(r.year) && Number.isInteger(r.questionNumber)
  );

  const counts = new Map(normalized.map(a => [a.id, 0]));
  for (const r of valid) if (counts.has(r.areaId)) counts.set(r.areaId, counts.get(r.areaId) + 1);

  // Frequency is usable only when verified records actually cover at least two areas.
  const coveredAreas = [...counts.values()].filter(n => n > 0).length;
  if (valid.length > 0 && coveredAreas >= 2) {
    return {
      basis: PRIORITY_EVIDENCE.VERIFIED_FREQUENCY,
      evidenceCount: valid.length,
      areas: normalized.slice().sort((a,b) =>
        counts.get(b.id) - counts.get(a.id) ||
        a.overviewOrder - b.overviewOrder ||
        String(a.id).localeCompare(String(b.id), "ja")
      ).map((a,i) => ({...a, priority:i+1, verifiedQuestionCount:counts.get(a.id)}))
    };
  }

  const hasOverviewOrder = normalized.every(a => Number.isInteger(a.overviewOrder));
  if (hasOverviewOrder) {
    return {
      basis: PRIORITY_EVIDENCE.OFFICIAL_OVERVIEW_ORDER,
      evidenceCount: valid.length,
      areas: normalized.slice().sort((a,b) => a.overviewOrder-b.overviewOrder)
        .map((a,i)=>({...a, priority:i+1, verifiedQuestionCount:counts.get(a.id) ?? 0}))
    };
  }

  return {
    basis: PRIORITY_EVIDENCE.FIXED_FALLBACK_ORDER,
    evidenceCount: valid.length,
    areas: normalized.map((a,i)=>({...a, priority:i+1, verifiedQuestionCount:counts.get(a.id) ?? 0}))
  };
}

export function priorityReason(result) {
  if (result.basis === PRIORITY_EVIDENCE.VERIFIED_FREQUENCY)
    return "公式過去問の検証済み分野分類を集計した出題数順";
  if (result.basis === PRIORITY_EVIDENCE.OFFICIAL_OVERVIEW_ORDER)
    return "検証済みの分野別出題数が不足しているため公式試験概要の分野順";
  return "出題頻度・公式分野順を確定できないため固定順";
}
