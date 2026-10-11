import test from "node:test";
import assert from "node:assert/strict";
import { extractPdfPages } from "../src/legacy-retrieval-engine.js";

// 有効な1ページPDFを最小構成で生成。公式問題の検証ではない。
function makePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length 40 >>\nstream\nBT /F1 14 Tf 20 200 Td (PDFTEST) Tj ET\nendstream"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body));
}
test("pdfjs-distでPDF本文を実際に抽出", async () => {
  const pages = await extractPdfPages(makePdf());
  assert.equal(pages.length,1);
  assert.match(pages[0],/PDFTEST/);
});
