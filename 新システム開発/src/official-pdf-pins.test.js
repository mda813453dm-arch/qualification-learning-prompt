import test from "node:test";
import assert from "node:assert/strict";
import { OFFICIAL_PDF_PINS, createPinnedOfficialVerifier } from "./official-pdf-pins.js";

const surveyorCsvQuestionUrl = "https://www.moj.go.jp/content/001450011.pdf";
const surveyorCsvAnswerUrl = "https://www.moj.go.jp/content/001450015.pdf";
const takkenCsvUrl = "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf";
const takkenAttachedSha256 = "829cde5778e22d1a8f0050ce2ff8b4b8089749bcab5456fbde6d1d843a3ed8ed";

test("土地家屋調査士2025午後のpin URLがCSV登録値と完全一致する", () => {
  const pin = OFFICIAL_PDF_PINS["土地家屋調査士:2025:午後"];
  assert.equal(pin.questionPdfUrl, surveyorCsvQuestionUrl);
  assert.equal(pin.answerPdfUrl, surveyorCsvAnswerUrl);
});

test("宅建2025はCSV登録URLそのものと添付PDFの実測SHA-256を固定する", () => {
  const pin = OFFICIAL_PDF_PINS["宅地建物取引士:2025:年度共通"];
  assert.ok(pin);
  assert.equal(pin.questionPdfUrl, takkenCsvUrl);
  assert.equal(pin.answerPdfUrl, takkenCsvUrl);
  assert.equal(pin.questionSha256, takkenAttachedSha256);
  assert.equal(pin.answerSha256, takkenAttachedSha256);
});

test("pinと一致する公式PDF対だけを検証器へ渡す", async () => {
  let observed;
  const verify = createPinnedOfficialVerifier({
    verifyOfficialSource: async evidence => {
      observed = evidence;
      return true;
    }
  });
  const pin = OFFICIAL_PDF_PINS["宅地建物取引士:2025:年度共通"];
  const evidence = {
    sourceType: "official_pdf_pair",
    registryKey: "宅地建物取引士:2025:年度共通",
    ...pin
  };
  assert.equal(await verify(evidence), true);
  assert.deepEqual(observed, { ...pin, sourceType: "official_pdf_pair" });
});

test("URLまたはSHA-256の差し替えはpin verifierが拒否する", async () => {
  const verify = createPinnedOfficialVerifier({
    verifyOfficialSource: async () => {
      throw new Error("mismatched pin must not reach verifier");
    }
  });
  const pin = OFFICIAL_PDF_PINS["宅地建物取引士:2025:年度共通"];
  const evidence = {
    sourceType: "official_pdf_pair",
    registryKey: "宅地建物取引士:2025:年度共通",
    ...pin
  };
  assert.equal(await verify({ ...evidence, questionPdfUrl: "https://example.invalid/replaced.pdf" }), false);
  assert.equal(await verify({ ...evidence, answerSha256: "0".repeat(64) }), false);
});
