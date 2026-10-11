/** A verified identity must come from a trusted authentication verifier, never request JSON. */
const principals = new WeakSet();
export function createPrincipalFactory(verifyToken) {
  if (typeof verifyToken !== 'function') throw new TypeError('TOKEN_VERIFIER_REQUIRED');
  return async function fromBearer(token) {
    if (typeof token !== 'string' || !token) throw new Error('AUTHENTICATION_REQUIRED');
    const claims = await verifyToken(token);
    if (!claims || claims.verified !== true || claims.issuerVerified !== true ||
        claims.audienceVerified !== true || claims.expiryVerified !== true ||
        typeof claims.subject !== 'string' || !claims.subject.trim()) {
      throw new Error('AUTHENTICATION_REQUIRED');
    }
    const principal = Object.freeze({userId: claims.subject});
    principals.add(principal);
    return principal;
  };
}
export function scopedStudyStore(db, principal) {
  if (!principals.has(principal)) throw new Error('AUTHENTICATION_REQUIRED');
  if (!db) throw new Error('STORE_UNAVAILABLE');
  return {
    async save(sessionId, state) {
      if (!sessionId || !state || typeof state !== 'object') throw new Error('INVALID_SESSION');
      const result = await db.prepare('UPDATE study_sessions SET state_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(JSON.stringify(state), new Date().toISOString(), sessionId, principal.userId).run();
      if (result?.meta?.changes !== 1) throw new Error('SESSION_NOT_FOUND_OR_FORBIDDEN');
      return {saved:true};
    },
    async load(sessionId) {
      if (!sessionId) throw new Error('INVALID_SESSION');
      const row = await db.prepare('SELECT state_json FROM study_sessions WHERE id = ? AND user_id = ?')
        .bind(sessionId, principal.userId).first();
      if (!row) throw new Error('SESSION_NOT_FOUND_OR_FORBIDDEN');
      return JSON.parse(row.state_json);
    }
  };
}
