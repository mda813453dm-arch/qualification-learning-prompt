/**
 * Deterministic candidate ordering. PDF availability is NOT proof of extraction.
 * A candidate may be used only after question, choices, field and same-year
 * official answer have been validated.
 */
export function resolveOfficialPdfCandidates(registry, qualificationId, { preferredYear } = {}) {
  if (!registry || registry.qualificationId !== qualificationId) {
    return { status: "qualification_mismatch", candidates: [] };
  }
  const rows = Array.isArray(registry.years) ? registry.years : [];
  const sorted = [...rows].sort((a,b) => {
    if (a.year === preferredYear) return -1;
    if (b.year === preferredYear) return 1;
    return b.year - a.year;
  });
  const candidates = [];
  for (const row of sorted) {
    if (!Number.isInteger(row.year) || !Array.isArray(row.questionPdfs) ||
        !row.questionPdfs.length || typeof row.answerPdf !== "string") continue;
    for (let part=0; part<row.questionPdfs.length; part++) {
      const url=row.questionPdfs[part];
      if (typeof url !== "string" || !url.startsWith("https://www.gsi.go.jp/")) continue;
      if (!row.answerPdf.startsWith("https://www.gsi.go.jp/")) continue;
      candidates.push({qualificationId,year:row.year,part:part+1,
        questionPdf:url,answerPdf:row.answerPdf,listingUrl:registry.listingUrl,
        verifiedQuestionPacket:false});
    }
  }
  return {status:candidates.length?"candidates_found":"no_candidates",candidates};
}
