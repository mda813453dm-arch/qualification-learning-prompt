/**
 * セッション保存境界。開発用メモリ実装であり、本番用の永続DBではない。
 * 外部APIに依存しないため、保存・再開の契約を先にテストできる。
 */
import { createSession } from "./study-session.js";
function clone(value) { return structuredClone(value); }
export function createMemorySessionStore() {
  const users = new Map();
  return {
    async save(userId, session) {
      if (typeof userId !== "string" || !userId.trim()) throw new Error("USER_ID_REQUIRED");
      if (!session || session.schemaVersion !== 1 || !Array.isArray(session.history)) throw new Error("INVALID_SESSION");
      users.set(userId, clone(session));
      return { saved: true };
    },
    async load(userId) {
      if (typeof userId !== "string" || !userId.trim()) throw new Error("USER_ID_REQUIRED");
      return users.has(userId) ? clone(users.get(userId)) : null;
    },
    async start(userId, qualification = null) {
      const session = createSession(qualification);
      await this.save(userId, session);
      return clone(session);
    }
  };
}
