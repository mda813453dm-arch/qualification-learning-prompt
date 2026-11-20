/**
 * Optional, answer-neutral prompts for the *pre-answer* phase of a question.
 * Never read choices, accepted answers, grade, official answer key or history.
 * These are thinking strategies, not verified legal/technical explanations.
 */
export function preAnswerHint(q) {
  const field = typeof q?.fieldName === 'string' ? q.fieldName : '';
  const isReview = q?.kind === 'review' || q?.progress?.review === true;
  let strategy = '設問が「正しい」「誤り」「組合せ」のどれを求めるかを確認し、選択肢ごとに判断の根拠を思い出してから選びましょう。';
  if (/民法|法令|法律|登記|業法|宅建|行政|租税|規制|契約|権利|条文/.test(field)) {
    strategy = '誰に・いつ・どの要件で適用されるかを整理し、原則と例外を分けて考えましょう。条文や制度を思い出せない部分は、解答後に確認します。';
  } else if (/測量|計算|数値|数学|面積|距離|座標|統計|アルゴリズム|データ構造|会計/.test(field)) {
    strategy = '求められている量・条件・単位を先に整理し、使う式や手順を思い出してから選びましょう。計算結果は桁と単位も確認します。';
  }
  return {
    isReview,
    kind: 'thinking_strategy',
    // Do not vary these messages based on any answer, even a previously graded one.
    text: isReview ? '復習の再想起です。前に見た解説を思い出しつつ、まず自力で答えを選んでください。' + strategy : strategy,
  };
}
