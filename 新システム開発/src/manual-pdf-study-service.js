import { createManualPdfRequest, registerManualPdfReceipt, resolveManualPdfEvidence } from "./manual-pdf-handoff.js";

/** 信頼できる接続層だけが呼ぶ、既存学習セッションとの接続口。 */
export function createManualPdfStudyService(store) {
  if (!store || typeof store.load !== "function" || typeof store.save !== "function") throw new Error("INVALID_STORE");
  async function withSession(authenticatedUserId, update) {
    if (typeof authenticatedUserId !== "string" || !authenticatedUserId.trim()) throw new Error("AUTHENTICATED_USER_REQUIRED");
    const session = await store.load(authenticatedUserId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    const next = update(session);
    await store.save(authenticatedUserId, next);
    return next;
  }
  return {
    async request(authenticatedUserId, { year, section, sourceUrl, reason } = {}) {
      return withSession(authenticatedUserId, session => {
        if (!session.qualification) throw new Error("QUALIFICATION_REQUIRED");
        return { ...session, manualPdf: createManualPdfRequest({ qualification: session.qualification, year, section, sourceUrl, reason }), mode: "awaiting_user_pdf" };
      });
    },
    async receipt(authenticatedUserId, serverReceipt) {
      return withSession(authenticatedUserId, session => {
        if (!session.manualPdf) throw new Error("MANUAL_PDF_NOT_REQUESTED");
        if (session.qualification !== session.manualPdf.key.qualification) throw new Error("QUALIFICATION_CHANGED");
        const manualPdf = registerManualPdfReceipt(session.manualPdf, serverReceipt);
        return { ...session, manualPdf, mode: manualPdf.status };
      });
    },
    async verify(authenticatedUserId, serverGateResult) {
      return withSession(authenticatedUserId, session => {
        if (!session.manualPdf) throw new Error("MANUAL_PDF_NOT_REQUESTED");
        if (session.qualification !== session.manualPdf.key.qualification) throw new Error("QUALIFICATION_CHANGED");
        const manualPdf = resolveManualPdfEvidence(session.manualPdf, serverGateResult);
        return { ...session, manualPdf, mode: manualPdf.status === "ready" ? "practice_request" : manualPdf.status };
      });
    }
  };
}
