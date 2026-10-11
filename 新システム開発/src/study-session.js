/**
 * 対話型学習の軽量セッション（試作）。
 * AIの会話生成は担当しない。公式出題・採点は別の検証ゲートに委ねる。
 */
import { classifyIntent, INTENTS } from "./intent-router.js";
export function createSession(qualification = null) {
  return { schemaVersion: 1, qualification, mode: "conversation", pendingQuestion: null, history: [], lastIntent: null };
}
export function applyUserMessage(session, message) {
  if (!session || !Array.isArray(session.history)) throw new Error("INVALID_SESSION");
  if (typeof message !== "string" || !message.trim()) return { session, action: "clarify" };
  const classified = classifyIntent(message);
  const next = { ...session, history: [...session.history, { role: "user", text: message }], lastIntent: classified.intent };
  if (classified.intent === INTENTS.STOP) return { session: { ...next, mode: "paused" }, action: "pause" };
  if (classified.intent === INTENTS.SWITCH) {
    // 新しい資格名を推測して確定しない。AIが利用者の指定を確認してから更新する。
    return { session: { ...next, mode: "conversation", pendingQuestion: null }, action: "resolve_qualification" };
  }
  if (classified.intent === INTENTS.PRACTICE) return { session: { ...next, mode: "practice_request" }, action: "request_verified_question" };
  if (classified.intent === INTENTS.REVIEW) return { session: { ...next, mode: "review" }, action: "review" };
  if (classified.intent === INTENTS.EXPLAIN || classified.intent === INTENTS.QUESTION) return { session: { ...next, mode: "conversation" }, action: "explain" };
  return { session: next, action: "interpret_in_context" };
}
export function setQualification(session, qualification) {
  if (typeof qualification !== "string" || !qualification.trim()) throw new Error("INVALID_QUALIFICATION");
  return { ...session, qualification: qualification.trim(), mode: "conversation", pendingQuestion: null };
}
