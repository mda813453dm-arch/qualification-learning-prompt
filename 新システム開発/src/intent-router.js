/**
 * 対話の意図を分類する補助部品（試作）。
 * AIの自由な対話を置き換えない。曖昧な依頼はAIに委ねる。
 * 公式問題の照合や採点の権限は持たない。
 */
export const INTENTS = Object.freeze({
  STOP: "stop",
  EXPLAIN: "explain",
  PRACTICE: "practice",
  REVIEW: "review",
  SWITCH: "switch",
  QUESTION: "question",
  AMBIGUOUS: "ambiguous"
});
export function classifyIntent(input) {
  if (typeof input !== "string" || !input.trim()) return { intent: INTENTS.AMBIGUOUS, confidence: "none" };
  const text = input.trim().normalize("NFKC");
  if (/^(終了|終わり|やめる|中断|ストップ|今日はここまで)[。.!！\s]*$/.test(text)) return { intent: INTENTS.STOP, confidence: "explicit" };
  if (/(別の資格|資格を変更|に切り替え|へ切り替え)/.test(text)) return { intent: INTENTS.SWITCH, confidence: "explicit" };
  if (/(過去問|問題を.{0,8}(解き|出し|出題)|演習したい)/.test(text)) return { intent: INTENTS.PRACTICE, confidence: "explicit" };
  if (/(復習|間違えたところ|弱点を確認)/.test(text)) return { intent: INTENTS.REVIEW, confidence: "explicit" };
  if (/(詳しく|わかりやすく|分かりやすく|基礎から|説明して|解説して|例え話)/.test(text)) return { intent: INTENTS.EXPLAIN, confidence: "explicit" };
  if (/[?？]$/.test(text) || /(教えて|とは|どうして|なぜ)/.test(text)) return { intent: INTENTS.QUESTION, confidence: "explicit" };
  return { intent: INTENTS.AMBIGUOUS, confidence: "none" };
}
