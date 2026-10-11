/**
 * 会話エンジンから呼び出すサービス層。
 * 信頼できる接続層が本人識別を渡す前提。ユーザー入力からIDを採用しない。
 */
import { applyUserMessage, setQualification } from "./study-session.js";
function requireUserId(userId) {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("AUTHENTICATED_USER_REQUIRED");
  return userId;
}
export function createStudyService(store) {
  if (!store || typeof store.load !== "function" || typeof store.save !== "function" || typeof store.start !== "function") throw new Error("INVALID_STORE");
  return {
    async start(authenticatedUserId, qualification = null) {
      return store.start(requireUserId(authenticatedUserId), qualification);
    },
    async get(authenticatedUserId) {
      return store.load(requireUserId(authenticatedUserId));
    },
    async message(authenticatedUserId, message) {
      const id = requireUserId(authenticatedUserId);
      const session = await store.load(id);
      if (!session) return { action: "start_required", session: null };
      const result = applyUserMessage(session, message);
      if (result.session !== session) await store.save(id, result.session);
      return result;
    },
    async confirmQualification(authenticatedUserId, qualification) {
      const id = requireUserId(authenticatedUserId);
      const session = await store.load(id);
      if (!session) throw new Error("SESSION_NOT_FOUND");
      const updated = setQualification(session, qualification);
      await store.save(id, updated);
      return updated;
    }
  };
}
