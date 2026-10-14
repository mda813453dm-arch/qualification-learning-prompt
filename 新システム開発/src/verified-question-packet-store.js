const VERIFIED_STATUS = "verified_official";

function invalid(reason) {
  return Object.freeze({ status: "unavailable", reason, packets: Object.freeze([]) });
}

export function validateVerifiedQuestionPacketStore(store) {
  if (!store || store.schemaVersion !== 1 || typeof store.qualificationId !== "string" ||
      typeof store.fieldId !== "string" || !Array.isArray(store.packets))
    return invalid("STORE_SCHEMA_INVALID");

  const seen = new Set();
  for (const p of store.packets) {
    if (!p || p.packetStatus !== VERIFIED_STATUS ||
        p.verification?.questionText !== "official_pdf_checked" ||
        p.verification?.choices !== "official_pdf_checked" ||
        p.verification?.answer !== "same_year_official_answer_checked" ||
        typeof p.questionId !== "string" || !p.questionId ||
        !Number.isInteger(p.year) || !Number.isInteger(p.questionNumber) ||
        typeof p.stem !== "string" || !p.stem.trim() ||
        !Array.isArray(p.choices) || p.choices.length < 2 ||
        p.choices.some(x => typeof x !== "string" || !x.trim()) ||
        !Number.isInteger(p.correctAnswer) || p.correctAnswer < 1 || p.correctAnswer > p.choices.length ||
        typeof p.diagramRequired !== "boolean")
      return invalid("PACKET_VALIDATION_FAILED");
    if (seen.has(p.questionId)) return invalid("PACKET_DUPLICATE");
    seen.add(p.questionId);
    if (p.diagramRequired) return invalid("DIAGRAM_ASSET_NOT_PREVERIFIED");
  }

  return Object.freeze({ status: "ready", packetCount: store.packets.length });
}

/**
 * Runtime path for AI clients:
 * 1) use preverified packet store first;
 * 2) do not re-download/re-extract the source PDF when enough packets exist;
 * 3) return live_pdf_required only when the store is insufficient.
 */
export function resolveVerifiedPracticeSet(store, {
  qualificationId,
  fieldId,
  recentQuestionIds = [],
  setSize = 3
} = {}) {
  const validation = validateVerifiedQuestionPacketStore(store);
  if (validation.status !== "ready") return validation;
  if (store.qualificationId !== qualificationId || store.fieldId !== fieldId)
    return invalid("PACKET_SCOPE_MISMATCH");
  if (!Number.isInteger(setSize) || setSize < 1) return invalid("SET_SIZE_INVALID");

  const recent = new Set(Array.isArray(recentQuestionIds) ? recentQuestionIds : []);
  const ordered = [...store.packets].sort((a,b) => {
    const ar = recent.has(a.questionId) ? 1 : 0;
    const br = recent.has(b.questionId) ? 1 : 0;
    if (ar !== br) return ar - br;
    if (a.year !== b.year) return b.year - a.year;
    return a.questionNumber - b.questionNumber;
  });

  if (ordered.length < setSize) {
    return Object.freeze({
      status: "live_pdf_required",
      reason: "PREVERIFIED_PACKETS_INSUFFICIENT",
      availablePacketCount: ordered.length,
      requestedSetSize: setSize,
      packets: Object.freeze(ordered)
    });
  }

  return Object.freeze({
    status: "ready",
    sourceMode: "preverified_official_packet",
    packets: Object.freeze(ordered.slice(0,setSize))
  });
}

export function buildLearnerQuestion(packet) {
  if (!packet || packet.packetStatus !== VERIFIED_STATUS) return invalid("PACKET_NOT_VERIFIED");
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

export function gradeVerifiedQuestion(packet, selectedNumber, source = {}) {
  if (!packet || packet.packetStatus !== VERIFIED_STATUS) return invalid("PACKET_NOT_VERIFIED");
  if (!Number.isInteger(selectedNumber) || selectedNumber < 1 || selectedNumber > packet.choices.length)
    return invalid("ANSWER_OUT_OF_RANGE");
  if (typeof source.answerSourceUrl !== "string" || !source.answerSourceUrl.startsWith("https://www.gsi.go.jp/"))
    return invalid("OFFICIAL_ANSWER_SOURCE_REQUIRED");
  return Object.freeze({
    status: "graded",
    correct: selectedNumber === packet.correctAnswer,
    selectedNumber,
    correctAnswer: packet.correctAnswer,
    answerSourceUrl: source.answerSourceUrl,
    sourceMode: "preverified_official_packet"
  });
}
