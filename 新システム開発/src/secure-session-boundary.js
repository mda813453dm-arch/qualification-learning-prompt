/**
 * フェーズ2：接続前の認証境界。署名・期限・audience を検証済みの
 * principal 以外から利用者IDを生成しない。
 * これは本番OAuth検証器ではない。
 */
export function verifiedPrincipal(context) {
  if (!context || context.verified !== true || context.issuerVerified !== true ||
      context.audienceVerified !== true || context.expiryVerified !== true ||
      typeof context.subject !== "string" || !context.subject.trim()) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }
  return Object.freeze({ userId: context.subject });
}
export function scopedStudyStore(db, principal) {
  if (!db || !principal?.userId) throw new Error("STORE_UNAVAILABLE");
  return {
    async save(sessionId, state) {
      if (!sessionId || !state || typeof state !== "object") throw new Error("INVALID_SESSION");
      const result = await db.prepare(
        "UPDATE study_sessions SET state_json = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      ).bind(JSON.stringify(state), new Date().toISOString(), sessionId, principal.userId).run();
      if (result?.meta?.changes !== 1) throw new Error("SESSION_NOT_FOUND_OR_FORBIDDEN");
      return { saved: true };
    },
    async load(sessionId) {
      if (!sessionId) throw new Error("INVALID_SESSION");
      const row = await db.prepare(
        "SELECT state_json FROM study_sessions WHERE id = ? AND user_id = ?"
      ).bind(sessionId, principal.userId).first();
      if (!row) throw new Error("SESSION_NOT_FOUND_OR_FORBIDDEN");
      return JSON.parse(row.state_json);
    }
  };
}
