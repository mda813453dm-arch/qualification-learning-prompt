/**
 * Qualification-neutral gate between a trusted source-format adapter and the
 * study flow. Adapters must be server-owned; never pass model-produced fields
 * here. Text extraction alone is not proof that a question/answer pair matches.
 */
export async function verifyParsedEvidence({ candidate, questionPdf, answerPdf, parsedQuestion, parsedAnswer }) {
  const failures = [];
  if (!candidate?.key?.qualification || !candidate?.key?.year || !candidate?.key?.section) failures.push("QUESTION_KEY_INCOMPLETE");
  if (!isPdf(questionPdf) || !isPdf(answerPdf)) failures.push("PDF_SIGNATURE_INVALID");
  if (!sameIndexedSource(candidate?.questionUrl, questionPdf?.url)) failures.push("QUESTION_SOURCE_MISMATCH");
  if (!candidate?.answerCandidates?.some(url => sameIndexedSource(url, answerPdf?.url))) failures.push("ANSWER_SOURCE_MISMATCH");
  if (!parsedQuestion || !parsedAnswer) failures.push("SOURCE_ADAPTER_PARSE_FAILED");

  const q = parsedQuestion;
  const a = parsedAnswer;
  if (q && (q.qualification !== candidate.key.qualification || String(q.year) !== String(candidate.key.year) || q.section !== candidate.key.section)) failures.push("QUESTION_IDENTITY_MISMATCH");
  if (a && (a.qualification !== candidate.key.qualification || String(a.year) !== String(candidate.key.year) || a.section !== candidate.key.section)) failures.push("ANSWER_IDENTITY_MISMATCH");
  if (q && (!nonEmpty(q.stem) || !Array.isArray(q.choices) || q.choices.length < 2)) failures.push("QUESTION_OR_CHOICES_INCOMPLETE");
  if (q && Array.isArray(q.choices)) {
    const ids = q.choices.map(choice => choice?.id);
    if (ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length || q.choices.some(choice => !nonEmpty(choice?.text))) failures.push("CHOICE_SET_INVALID");
  }
  if (q && a && q.questionId !== a.questionId) failures.push("QUESTION_ANSWER_ID_MISMATCH");
  if (a && (typeof a.correctChoiceId !== "string" || !a.answerLocation || !nonEmpty(a.answerEvidence))) failures.push("ANSWER_CELL_NOT_EVIDENCED");
  if (q && a && Array.isArray(q.choices) && !q.choices.some(choice => choice.id === a.correctChoiceId)) failures.push("ANSWER_NOT_IN_CHOICE_SET");

  const passed = failures.length === 0;
  return {
    passed,
    status: passed ? "verified" : "rejected",
    failures,
    questionKey: passed ? { ...candidate.key, questionId: q.questionId } : null,
    sourceDigests: passed ? { question: await digest(questionPdf.bytes), answer: await digest(answerPdf.bytes) } : null,
    // Intentionally omit the answer from this gate. A separate controlled
    // operation may release it after the learner submits a choice.
  };
}

function isPdf(doc) {
  return doc && typeof doc.url === "string" && doc.bytes instanceof Uint8Array && doc.bytes.length > 8 &&
    new TextDecoder().decode(doc.bytes.slice(0, 5)) === "%PDF-";
}
function sameIndexedSource(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  try { const a = new URL(expected), b = new URL(actual); return a.href === b.href && a.protocol === "https:"; } catch { return false; }
}
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
}
