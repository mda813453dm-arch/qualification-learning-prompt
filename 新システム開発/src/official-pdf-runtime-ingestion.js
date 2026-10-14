import { createHash } from "node:crypto";

const PDF_MAGIC = [0x25,0x50,0x44,0x46,0x2d]; // %PDF-

const unavailable = (reason, extra = {}) =>
  Object.freeze({ status: "unavailable", reason, ...extra });

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function validPdf(bytes) {
  return bytes && bytes.length > PDF_MAGIC.length &&
    PDF_MAGIC.every((v,i) => bytes[i] === v);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Runtime ingestion only.
 *
 * The caller (AI client connector / backend adapter) supplies the official PDF
 * bytes for the current learning request. This module never requires a stored
 * corpus of question text.
 *
 * parseQuestionPdf({bytes, provenance}) must return:
 * { status:"ready", questions:[{questionNumber, stem, choices, diagramRequired?, diagramAssets?}] }
 *
 * parseAnswerPdf({bytes, provenance}) must return:
 * { status:"ready", answers:{[questionNumber]: correctChoiceNumber} }
 *
 * classifyQuestion({qualificationId, question, year, section}) must return:
 * { status:"ready", fieldId, unitId? }
 */
export function createOfficialPdfRuntimeIngestion({
  parseQuestionPdf,
  parseAnswerPdf,
  classifyQuestion
} = {}) {
  if (typeof parseQuestionPdf !== "function" ||
      typeof parseAnswerPdf !== "function" ||
      typeof classifyQuestion !== "function")
    throw new Error("RUNTIME_PDF_ADAPTERS_REQUIRED");

  return async function ingest({
    qualificationId,
    requestedFieldId,
    year,
    section = "default",
    questionPdfs = [],
    answerPdf,
    setSize = 3
  } = {}) {
    if (!qualificationId || !requestedFieldId || !Number.isInteger(year) ||
        !Array.isArray(questionPdfs) || !questionPdfs.length || !answerPdf ||
        !Number.isInteger(setSize) || setSize < 1)
      return unavailable("INGEST_INPUT_INVALID");

    const answerBytes = asBytes(answerPdf.bytes);
    if (!validPdf(answerBytes)) return unavailable("ANSWER_PDF_INVALID");
    const answerHash = sha256(answerBytes);
    if (answerPdf.sha256 && answerPdf.sha256 !== answerHash)
      return unavailable("ANSWER_PDF_HASH_MISMATCH");

    let parsedAnswers;
    try {
      parsedAnswers = await parseAnswerPdf({
        bytes: answerBytes,
        provenance: {
          qualificationId, year, section,
          url: answerPdf.url ?? null,
          sha256: answerHash
        }
      });
    } catch {
      return unavailable("ANSWER_PDF_PARSE_FAILED");
    }
    if (!parsedAnswers || parsedAnswers.status !== "ready" ||
        !parsedAnswers.answers || typeof parsedAnswers.answers !== "object")
      return unavailable("ANSWER_PDF_PARSE_INCOMPLETE");

    const packets = [];
    const seen = new Set();

    for (const source of questionPdfs) {
      const bytes = asBytes(source?.bytes);
      if (!validPdf(bytes)) continue;
      const questionHash = sha256(bytes);
      if (source.sha256 && source.sha256 !== questionHash) continue;

      let parsed;
      try {
        parsed = await parseQuestionPdf({
          bytes,
          provenance: {
            qualificationId, year, section,
            url: source.url ?? null,
            sha256: questionHash
          }
        });
      } catch {
        continue;
      }
      if (!parsed || parsed.status !== "ready" || !Array.isArray(parsed.questions))
        continue;

      for (const q of parsed.questions) {
        if (!q || !Number.isInteger(q.questionNumber) ||
            typeof q.stem !== "string" || !q.stem.trim() ||
            !Array.isArray(q.choices) || q.choices.length < 2 ||
            q.choices.some(v => typeof v !== "string" || !v.trim()))
          continue;

        let classification;
        try {
          classification = await classifyQuestion({
            qualificationId, year, section, question: q
          });
        } catch {
          continue;
        }
        if (!classification || classification.status !== "ready" ||
            classification.fieldId !== requestedFieldId)
          continue;

        const correctAnswer = Number(parsedAnswers.answers[q.questionNumber]);
        if (!Number.isInteger(correctAnswer) ||
            correctAnswer < 1 || correctAnswer > q.choices.length)
          continue;

        if (q.diagramRequired === true &&
            (!Array.isArray(q.diagramAssets) || !q.diagramAssets.length))
          continue;

        const questionId = `${qualificationId}:${year}:${section}:${q.questionNumber}`;
        if (seen.has(questionId)) continue;
        seen.add(questionId);

        packets.push(Object.freeze({
          sourceMode: "runtime_official_pdf",
          qualificationId,
          fieldId: classification.fieldId,
          unitId: classification.unitId ?? null,
          year,
          section,
          questionId,
          questionNumber: q.questionNumber,
          stem: q.stem,
          choices: Object.freeze([...q.choices]),
          correctAnswer,
          diagramRequired: q.diagramRequired === true,
          diagramAssets: Object.freeze(Array.isArray(q.diagramAssets) ? [...q.diagramAssets] : []),
          questionPdfUrl: source.url ?? null,
          answerPdfUrl: answerPdf.url ?? null,
          questionPdfSha256: questionHash,
          answerPdfSha256: answerHash,
          verification: Object.freeze({
            questionText: "runtime_pdf_checked",
            choices: "runtime_pdf_checked",
            answer: "same_year_official_answer_checked"
          })
        }));

        if (packets.length >= setSize) {
          return Object.freeze({
            status: "ready",
            sourceMode: "runtime_official_pdf",
            packets: Object.freeze(packets)
          });
        }
      }
    }

    return unavailable("SAME_FIELD_COMPLETE_PACKETS_INSUFFICIENT", {
      availablePacketCount: packets.length,
      requestedSetSize: setSize,
      packets: Object.freeze(packets)
    });
  };
}
