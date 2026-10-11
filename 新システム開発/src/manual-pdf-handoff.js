/**
 * PDF手動添付時の受け渡し状態を表す純粋関数。
 * ファイル本体の受信・解析・出典検証は信頼できる接続層が担当する。
 */
const validRoles = new Set(["question", "answer", "diagram"]);
export function createManualPdfRequest({ qualification, year, section, sourceUrl = null, reason = "AUTOMATIC_RETRIEVAL_FAILED" }) {
  if (typeof qualification !== "string" || !qualification.trim()) throw new Error("QUALIFICATION_REQUIRED");
  if (!year || typeof section !== "string" || !section.trim()) throw new Error("QUESTION_KEY_REQUIRED");
  if (sourceUrl !== null) {
    let url; try { url = new URL(sourceUrl); } catch { throw new Error("SOURCE_URL_INVALID"); }
    if (url.protocol !== "https:") throw new Error("SOURCE_URL_NOT_HTTPS");
  }
  return {
    status: "awaiting_user_pdf",
    key: { qualification: qualification.trim(), year: String(year), section: section.trim() },
    sourceUrl,
    reason,
    received: { question: false, answer: false, diagram: false },
    verified: false
  };
}
export function registerManualPdfReceipt(request, receipt) {
  if (request?.status !== "awaiting_user_pdf" || !receipt || !validRoles.has(receipt.role)) throw new Error("INVALID_PDF_RECEIPT");
  // 受信証跡は接続層が生成する。ファイル名だけでは受領扱いにしない。
  if (receipt.serverReceived !== true || typeof receipt.fileId !== "string" || !receipt.fileId.trim()) throw new Error("SERVER_RECEIPT_REQUIRED");
  if (receipt.mediaType !== "application/pdf") throw new Error("PDF_REQUIRED");
  const received = { ...request.received, [receipt.role]: true };
  return {
    ...request,
    received,
    status: received.question && received.answer ? "awaiting_evidence_verification" : "awaiting_user_pdf",
    verified: false
  };
}
export function resolveManualPdfEvidence(request, gateResult) {
  if (request?.status !== "awaiting_evidence_verification") throw new Error("DOCUMENTS_INCOMPLETE");
  if (gateResult?.ok !== true) return { ...request, status: "verification_failed", verified: false, failures: gateResult?.failures ?? ["EVIDENCE_NOT_VERIFIED"] };
  const k = gateResult.question?.key;
  if (!k || k.qualification !== request.key.qualification || String(k.year) !== request.key.year || k.section !== request.key.section) {
    return { ...request, status: "verification_failed", verified: false, failures: ["QUESTION_KEY_MISMATCH"] };
  }
  return { ...request, status: "ready", verified: true };
}
