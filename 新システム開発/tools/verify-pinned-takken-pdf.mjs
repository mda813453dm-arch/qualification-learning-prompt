import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { OFFICIAL_PDF_PINS } from "../src/official-pdf-pins.js";

const pin = OFFICIAL_PDF_PINS["q041:2025:年度共通"];
const MAX_BYTES = 25_000_000;
const timeoutMs = 25_000;

async function main() {
  const response = await fetch(pin.questionPdfUrl, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  if (!response.ok) throw new Error(`OFFICIAL_PDF_HTTP_${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error("OFFICIAL_PDF_TOO_LARGE");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("OFFICIAL_PDF_TOO_LARGE");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("OFFICIAL_PDF_SIGNATURE_INVALID");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== pin.questionSha256) throw new Error(`OFFICIAL_PDF_SHA256_MISMATCH:actual=${sha256}`);
  await writeFile(process.env.RUNNER_TEMP ? `${process.env.RUNNER_TEMP}/takken-2025-verified.pdf` : "/tmp/takken-2025-verified.pdf", bytes);
  process.stdout.write(JSON.stringify({ status: "verified", bytes: size, sha256, url: pin.questionPdfUrl }) + "\n");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
