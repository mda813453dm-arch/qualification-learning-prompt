/**
 * Build a source-bounded instant correction from a program-graded official question.
 * Only the engine's answer mapping is authoritative here. An official answer sheet
 * proves the answer number, not a legal or mathematical explanation.
 * Do not add rationale text unless a separately verified source is introduced.
 */
export function instantFeedbackModel(q, g) {
  if (!q || !g || g.skipped || !q.questionId || q.questionId !== g.questionId) {
    return { status: 'binding_unavailable' };
  }
  const choices = Array.isArray(q.choices) ? q.choices : [];
  const nums = Array.isArray(g.acceptedAnswers) && g.acceptedAnswers.length
    ? g.acceptedAnswers : [g.correctAnswer];
  const valid = [...new Set(nums.map(Number).filter((n) =>
    Number.isInteger(n) && n >= 1 && n <= choices.length
  ))];
  const correctChoices = valid.map((n) => ({ number: n, text: String(choices[n-1] ?? '') }));
  const selectedNum = g.selected == null ? null : Number(g.selected);
  const selected = Number.isInteger(selectedNum) && selectedNum >= 1 && selectedNum <= choices.length
    ? { number: selectedNum, text: String(choices[selectedNum-1] ?? '') } : null;
  const correctLabel = g.correctAnswerLabel == null || String(g.correctAnswerLabel).trim() === ''
    ? String(g.correctAnswer ?? '未確認') : String(g.correctAnswerLabel);
  return {
    status: 'ready',
    correctLabel,
    correctChoices,
    selected,
    dontKnow: !!g.dontKnow,
    correct: g.correct === true,
    answerSourceType: String(g.answerSourceType || ''),
    // A verified answer number alone never supplies a verified judgment reason.
    rationaleVerified: false,
  };
}
