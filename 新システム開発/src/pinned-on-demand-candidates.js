import { OFFICIAL_PDF_PINS } from "./official-pdf-pins.js";

/**
 * Construct one source candidate at request time, never a question bank.
 * The caller must supply an explicitly approved question-to-unit mapping.
 * PDF text, answer and visual verification remain downstream requirements.
 */
export function createPinnedOnDemandCandidateLoader({ approvedQuestionUnit, pins = OFFICIAL_PDF_PINS } = {}) {
  if (typeof approvedQuestionUnit !== "function") throw new Error("APPROVED_QUESTION_UNIT_SOURCE_REQUIRED");
  return async function loadOfficialCandidateRecords({ qualificationId, studyUnitId, questionNumber, year = 2025 } = {}) {
    if (!qualificationId || !studyUnitId || !Number.isInteger(questionNumber) ||
        questionNumber < 1 || questionNumber > 100 || !Number.isInteger(year))
      return [];
    const approved = await approvedQuestionUnit({ qualificationId, studyUnitId, questionNumber, year });
    if (approved !== true) return [];
    const matches = Object.entries(pins).filter(([key]) =>
      key.startsWith(`${qualificationId}:${year}:`));
    if (matches.length !== 1) return [];
    const [registryKey, pin] = matches[0];
    const section = registryKey.split(":").slice(2).join(":");
    return [{
      qualificationId, studyUnitId, year, section,
      questionId: `${qualificationId}:${year}:${section}:${questionNumber}`,
      registryKey,
      questionPdfUrl: pin.questionPdfUrl, answerPdfUrl: pin.answerPdfUrl,
      questionPdfSha256: pin.questionSha256, answerPdfSha256: pin.answerSha256
    }];
  };
}
