import assert from "node:assert/strict";import {extractPdfPageText} from "./pdfjs-page-text-extractor.js";
assert.equal((await extractPdfPageText(new Uint8Array([1,2,3]))).reason,"PDF_BYTES_INVALID");
assert.equal((await extractPdfPageText(new TextEncoder().encode("abcde-not-pdf"))).reason,"PDF_SIGNATURE_INVALID");
console.log("pdfjs-page-text-extractor guards: PASS");
