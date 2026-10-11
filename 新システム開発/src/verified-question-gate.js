/**
 * 公式過去問の出題・採点を行う前に必要な根拠を確認するゲート。
 * 証拠はサーバー所有の検証処理から受け取ること。AI出力を直接渡さない。
 */
export function gateVerifiedQuestion(record) {
  const failures = [];
  if (!record || typeof record !== "object") return { ok: false, failures: ["RECORD_MISSING"] };
  if (record.sourceVerified !== true) failures.push("SOURCE_NOT_VERIFIED");
  if (record.questionVerified !== true) failures.push("QUESTION_NOT_VERIFIED");
  if (record.answerVerified !== true) failures.push("ANSWER_NOT_VERIFIED");
  if (record.identityMatched !== true) failures.push("QUESTION_ANSWER_IDENTITY_MISMATCH");
  if (typeof record.questionText !== "string" || !record.questionText.trim()) failures.push("QUESTION_TEXT_MISSING");
  if (!Array.isArray(record.choices) || record.choices.length < 2 || record.choices.some(c => typeof c !== "string" || !c.trim())) failures.push("CHOICES_INCOMPLETE");
  if (!Number.isInteger(record.correctChoice) || record.correctChoice < 1 || record.correctChoice > (record.choices?.length ?? 0)) failures.push("ANSWER_INVALID");
  if (typeof record.answerPdfUrl !== "string" || !/^https:\/\//.test(record.answerPdfUrl)) failures.push("ANSWER_SOURCE_MISSING");
  if (!record.key || !record.key.qualification || !record.key.year || !record.key.section || !record.key.questionNumber) failures.push("QUESTION_KEY_INCOMPLETE");
  if (failures.length) return { ok: false, failures };
  return {
    ok: true,
    question: {
      key: structuredClone(record.key),
      text: record.questionText,
      choices: [...record.choices],
      correctChoice: record.correctChoice,
      answerPdfUrl: record.answerPdfUrl
    }
  };
}
export function gradeVerifiedAnswer(verified, choice) {
  if (!verified || verified.ok !== true || !verified.question) throw new Error("VERIFIED_QUESTION_REQUIRED");
  if (!Number.isInteger(choice) || choice < 1 || choice > verified.question.choices.length) throw new Error("INVALID_CHOICE");
  return {
    correct: choice === verified.question.correctChoice,
    correctChoice: verified.question.correctChoice,
    answerPdfUrl: verified.question.answerPdfUrl,
    key: structuredClone(verified.question.key)
  };
}
