const INDEX_COLUMNS = ["資格名", "過去問一覧URL", "種別", "年度", "区分・状況", "URL"];

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

export function parseQualificationIndex(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("CSV_EMPTY");
  const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());
  const positions = Object.fromEntries(INDEX_COLUMNS.map(k => [k, headers.indexOf(k)]));
  for (const [name, pos] of Object.entries(positions)) if (pos < 0) throw new Error("CSV_COLUMN_MISSING:" + name);
  return rows.slice(1).map(cells => Object.fromEntries(
    INDEX_COLUMNS.map(k => [k, (cells[positions[k]] ?? "").trim()])
  ));
}

const clean = s => String(s ?? "").normalize("NFKC").replace(/[\s　()（）・:：]/g, "").toLowerCase();
const isHttp = value => { try { return new URL(value).protocol === "https:" || new URL(value).protocol === "http:"; } catch { return false; } };

export function findCandidates(records, { qualification, year, section = "" }) {
  if (!qualification?.trim()) throw new Error("QUALIFICATION_REQUIRED");
  const relevant = records.filter(r => clean(r["資格名"]) === clean(qualification));
  const questions = relevant.filter(r => r["種別"] === "問題" && isHttp(r.URL) && (!year || String(r["年度"]) === String(year)) && (!section || clean(r["区分・状況"]).includes(clean(section))));
  return questions.map(q => {
    const linked = relevant.filter(a => a["種別"] === "正解" &&
      ((a.URL && a["年度"] === q["年度"] && clean(a["区分・状況"]) === clean(q["区分・状況"])) ||
       (!a.URL && a["年度"] === q["年度"] && a["区分・状況"].includes("同一PDF") && a["過去問一覧URL"] === q["過去問一覧URL"])));
    return {
      key: { qualification, year: q["年度"], section: q["区分・状況"] },
      questionUrl: q.URL,
      indexUrl: q["過去問一覧URL"],
      answerCandidates: linked.map(a => a.URL || q.URL),
      answerIndexNotes: linked.filter(a => !a.URL).map(a => a["区分・状況"])
    };
  });
}

export function verifyQuestionEvidence(candidate, extracted) {
  const fail = reason => ({ verified: false, reason });
  if (!candidate || !extracted) return fail("EVIDENCE_MISSING");
  const q = extracted.question, a = extracted.answer;
  if (!q || !a) return fail("QUESTION_OR_ANSWER_MISSING");
  if (!q.text?.trim()) return fail("QUESTION_TEXT_MISSING");
  if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.some(c => !String(c.text ?? "").trim())) return fail("CHOICES_INCOMPLETE");
  if (!q.id || !q.year || !q.section || !Number.isInteger(q.page)) return fail("QUESTION_KEY_INCOMPLETE");
  const expected = candidate.key;
  if (String(q.year) !== String(expected.year) || clean(q.section) !== clean(expected.section)) return fail("QUESTION_KEY_MISMATCH");
  if (!Number.isInteger(a.number) || a.number < 1 || !a.questionId || a.questionId !== q.id || String(a.year) !== String(q.year) || clean(a.section) !== clean(q.section)) return fail("ANSWER_KEY_MISMATCH");
  if (!Number.isInteger(a.page) || !a.evidence?.trim()) return fail("ANSWER_EVIDENCE_INCOMPLETE");
  if (!Number.isInteger(a.numberOfChoices) || a.numberOfChoices !== q.choices.length || a.number > a.numberOfChoices) return fail("ANSWER_CHOICE_MAPPING_MISMATCH");
  const allowed = new Set([candidate.questionUrl, ...candidate.answerCandidates].filter(Boolean));
  for (const source of [q.source, a.source]) {
    if (!source?.url || !allowed.has(source.url) || source.official !== true || !source.retrievedAt) return fail("SOURCE_NOT_VERIFIED");
  }
  return { verified: true, question: q, answer: a, key: { ...candidate.key, questionId: q.id } };
}

export async function retrieveAndVerify(candidate, adapters, { maxRoutes = 5, retriesPerRoute = 1, now = () => new Date().toISOString() } = {}) {
  const attempts = [];
  const routes = adapters.slice(0, maxRoutes);
  if (!routes.length) return { status: "not_attempted", attempts, reason: "NO_ADAPTERS" };
  for (const adapter of routes) {
    for (let retry = 0; retry <= retriesPerRoute; retry++) {
      const attempt = { route: adapter.name, url: candidate.questionUrl, retry, startedAt: now(), status: "started" };
      attempts.push(attempt);
      try {
        const result = await adapter.retrieve(candidate);
        attempt.finishedAt = now();
        attempt.httpStatus = result.httpStatus ?? null;
        if (result.httpStatus < 200 || result.httpStatus >= 300) throw Object.assign(new Error("HTTP_ERROR"), { code: "HTTP_" + result.httpStatus });
        if (!result.contentType || (!result.contentType.includes("pdf") && !result.contentType.includes("text") && !result.contentType.includes("html"))) throw Object.assign(new Error("UNSUPPORTED_CONTENT_TYPE"), { code: "CONTENT_TYPE_INVALID" });
        if (!result.extracted) throw Object.assign(new Error("EXTRACTION_NOT_COMPLETED"), { code: "EXTRACTION_NOT_COMPLETED" });
        const checked = verifyQuestionEvidence(candidate, result.extracted);
        if (!checked.verified) throw Object.assign(new Error(checked.reason), { code: checked.reason });
        attempt.status = "verified";
        attempt.contentType = result.contentType;
        attempt.bytes = result.bytes ?? null;
        return { status: "verified", question: checked.question, answer: checked.answer, key: checked.key, attempts };
      } catch (error) {
        attempt.status = "failed";
        attempt.error = error.code || error.message || "UNKNOWN_ERROR";
      }
    }
  }
  return { status: "exhausted", attempts, reason: "ROUTE_LIMIT_REACHED" };
}
