import test from "node:test";
import assert from "node:assert/strict";
import { createPdfFetchAdapter } from "../src/retrieval-engine.js";

const pdf = new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37]);
function response(url, { status = 200, contentType = "application/pdf", body = pdf } = {}) {
  return { ok: status >= 200 && status < 300, status, url, headers: { get: key => key === "content-type" ? contentType : null }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}
const candidate = { questionUrl: "https://www.retio.or.jp/q.pdf", answerCandidates: ["https://www.retio.or.jp/a.pdf"] };

test("fetch adapter downloads both indexed PDFs and passes bytes to extractor", async () => {
  const urls = [];
  const adapter = createPdfFetchAdapter({ officialHosts: ["retio.or.jp"], fetchImpl: async u => { urls.push(u); return response(u); }, extractPdf: async ({ questionPdf, answerPdf, candidate: c }) => {
    assert.ok(questionPdf.length > 0 && answerPdf.length > 0);
    return { question: { id: "q1", year: "2025", section: "x", page: 1, text: "q", choices: [{text:"a"},{text:"b"}], source: {url:c.questionUrl} }, answer: { questionId:"q1", year:"2025", section:"x", page: 1, number:1, numberOfChoices:2, evidence:"answer", source:{url:c.answerCandidates[0]} } };
  } });
  const out = await adapter.retrieve(candidate);
  assert.deepEqual(urls, [candidate.questionUrl, candidate.answerCandidates[0]]);
  assert.equal(out.httpStatus, 200);
  assert.equal(out.extracted.question.source.official, true);
  assert.ok(out.extracted.answer.source.retrievedAt);
});
test("rejects host not explicitly configured", async () => {
  const adapter = createPdfFetchAdapter({ officialHosts: ["retio.or.jp"], fetchImpl: async () => { throw Error("must not fetch"); }, extractPdf: async () => ({}) });
  await assert.rejects(() => adapter.retrieve({ questionUrl: "https://retio.or.jp.attacker.example/q.pdf", answerCandidates: [] }), /URL_NOT_FROM_CONFIGURED_OFFICIAL_HOST/);
});
test("rejects HTML masquerading at PDF URL", async () => {
  const adapter = createPdfFetchAdapter({ officialHosts: ["retio.or.jp"], fetchImpl: async u => response(u, { contentType: "text/html", body: new TextEncoder().encode("Access denied") }), extractPdf: async () => ({}) });
  await assert.rejects(() => adapter.retrieve({ questionUrl: candidate.questionUrl, answerCandidates: [candidate.questionUrl] }), /BODY_IS_NOT_PDF/);
});
test("rejects redirect to a different host", async () => {
  const adapter = createPdfFetchAdapter({ officialHosts: ["retio.or.jp"], fetchImpl: async () => response("https://evil.example/q.pdf"), extractPdf: async () => ({}) });
  await assert.rejects(() => adapter.retrieve({ questionUrl: candidate.questionUrl, answerCandidates: [] }), /REDIRECT_LEFT_OFFICIAL_HOST/);
});
