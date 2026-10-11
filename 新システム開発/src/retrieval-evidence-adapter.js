/**
 * 旧runtimeの検証済み抽出結果を新システムの採点ゲートへ接続する。
 * 呼び出し元は信頼できるサーバー側のPDF取得・照合処理でなければならない。
 * 未検証のAI出力を渡すことは禁止。
 */
import { gateVerifiedQuestion } from "./verified-question-gate.js";
export function adaptVerifiedExtraction(evidence, { trustedServerVerification = false } = {}) {
  if (trustedServerVerification !== true) return { ok: false, failures: ["TRUSTED_VERIFICATION_REQUIRED"] };
  if (!evidence || evidence.verified !== true || !evidence.question || !evidence.answer) {
    return { ok: false, failures: ["EXTRACTION_NOT_VERIFIED"] };
  }
  const q = evidence.question, a = evidence.answer;
  if (a.questionId !== q.id || String(a.year) !== String(q.year) || a.section !== q.section) {
    return { ok: false, failures: ["QUESTION_ANSWER_IDENTITY_MISMATCH"] };
  }
  const choices = Array.isArray(q.choices) ? q.choices.map(c => c?.text) : [];
  return gateVerifiedQuestion({
    sourceVerified: q.source?.official === true && a.source?.official === true,
    questionVerified: evidence.verified === true,
    answerVerified: evidence.verified === true && Number.isInteger(a.page) && !!a.evidence?.trim(),
    identityMatched: true,
    questionText: q.text,
    choices,
    correctChoice: a.number,
    answerPdfUrl: a.source?.url,
    key: {
      qualification: evidence.key?.qualification,
      year: q.year,
      section: q.section,
      questionNumber: q.id
    }
  });
}
