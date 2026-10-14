/**
 * Runtime-only official question packet validation.
 * This module does NOT persist a corpus of past questions.
 * Packets are created from an official PDF during the current ingestion run.
 */

function unavailable(reason) {
  return Object.freeze({ status: "unavailable", reason });
}

export function validateRuntimePacket(packet) {
  if (!packet || typeof packet !== "object") return unavailable("PACKET_REQUIRED");
  const staticMode=packet.sourceMode==="static_verified_official_packet";
  const liveMode=packet.sourceMode==="runtime_official_pdf";
  if (!staticMode && !liveMode) return unavailable("OFFICIAL_SOURCE_MODE_REQUIRED");
  if (typeof packet.qualificationId !== "string" || !packet.qualificationId) return unavailable("QUALIFICATION_REQUIRED");
  if (typeof packet.fieldId !== "string" || !packet.fieldId) return unavailable("FIELD_REQUIRED");
  if (!Number.isInteger(packet.year) || !Number.isInteger(packet.questionNumber)) return unavailable("QUESTION_IDENTITY_REQUIRED");
  if (typeof packet.questionId !== "string" || !packet.questionId) return unavailable("QUESTION_ID_REQUIRED");
  if (typeof packet.stem !== "string" || !packet.stem.trim()) return unavailable("QUESTION_TEXT_REQUIRED");
  if (!Array.isArray(packet.choices) || packet.choices.length < 2 ||
      packet.choices.some(v => typeof v !== "string" || !v.trim()))
    return unavailable("COMPLETE_CHOICES_REQUIRED");
  if (!Number.isInteger(packet.correctAnswer) ||
      packet.correctAnswer < 1 || packet.correctAnswer > packet.choices.length)
    return unavailable("OFFICIAL_ANSWER_REQUIRED");
  if (typeof packet.questionPdfUrl !== "string" || !packet.questionPdfUrl.startsWith("https://"))
    return unavailable("QUESTION_SOURCE_REQUIRED");
  if (typeof packet.answerPdfUrl !== "string" || !packet.answerPdfUrl.startsWith("https://"))
    return unavailable("ANSWER_SOURCE_REQUIRED");
  const textExpected=staticMode?"official_pdf_checked":"runtime_pdf_checked";
  if (packet.verification?.questionText !== textExpected ||
      packet.verification?.choices !== textExpected ||
      packet.verification?.answer !== "same_year_official_answer_checked" ||
      packet.verification?.field !== "verified" ||
      !["question_level_pdf_graphics_checked","question_level_review_checked"].includes(packet.verification?.visual))
    return unavailable("OFFICIAL_VERIFICATION_REQUIRED");
  return Object.freeze({ status: "ready" });
}

export function buildRuntimeLearnerQuestion(packet) {
  const check = validateRuntimePacket(packet);
  if (check.status !== "ready") return check;
  return Object.freeze({
    status: "ready",
    questionId: packet.questionId,
    year: packet.year,
    questionNumber: packet.questionNumber,
    stem: packet.stem,
    choices: Object.freeze([...packet.choices]),
    instruction: "番号で答えてください。"
  });
}

export function gradeRuntimeQuestion(packet, selectedNumber) {
  const check = validateRuntimePacket(packet);
  if (check.status !== "ready") return check;
  if (!Number.isInteger(selectedNumber) || selectedNumber < 1 || selectedNumber > packet.choices.length)
    return unavailable("ANSWER_OUT_OF_RANGE");
  return Object.freeze({
    status: "graded",
    correct: selectedNumber === packet.correctAnswer,
    selectedNumber,
    correctAnswer: packet.correctAnswer,
    answerPdfUrl: packet.answerPdfUrl,
    questionPdfUrl: packet.questionPdfUrl,
    sourceMode: packet.sourceMode
  });
}
