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

export function createPdfFetchAdapter({ name = "official-pdf-fetch", officialHosts, fetchImpl = fetch, extractPdf, maxBytes = 25_000_000 }) {
  if (!Array.isArray(officialHosts) || !officialHosts.length) throw new Error("OFFICIAL_HOSTS_REQUIRED");
  if (typeof extractPdf !== "function") throw new Error("PDF_EXTRACTOR_REQUIRED");
  const allowedHost = value => {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) && officialHosts.some(host => u.hostname === host || u.hostname.endsWith("." + host));
  };
  return {
    name,
    async retrieve(candidate) {
      const qUrl = candidate?.questionUrl;
      const aUrl = candidate?.answerCandidates?.[0] || qUrl;
      if (!allowedHost(qUrl) || !allowedHost(aUrl)) throw Object.assign(new Error("URL_NOT_FROM_CONFIGURED_OFFICIAL_HOST"), { code: "URL_NOT_OFFICIAL_HOST" });
      async function get(url) {
        const response = await fetchImpl(url, { redirect: "manual" });
        if (!response.ok) return { httpStatus: response.status, contentType: response.headers.get("content-type") || "" };
        const finalUrl = response.url || url;
        if (!allowedHost(finalUrl)) throw Object.assign(new Error("REDIRECT_LEFT_OFFICIAL_HOST"), { code: "REDIRECT_NOT_OFFICIAL_HOST" });
        const contentType = response.headers.get("content-type") || "";
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (buffer.byteLength > maxBytes) throw Object.assign(new Error("PDF_TOO_LARGE"), { code: "RESPONSE_TOO_LARGE" });
        if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) throw Object.assign(new Error("BODY_IS_NOT_PDF"), { code: "PDF_SIGNATURE_MISSING" });
        return { httpStatus: response.status, contentType, buffer, url: finalUrl, bytes: buffer.byteLength };
      }
      const q = await get(qUrl);
      if (q.httpStatus < 200 || q.httpStatus >= 300) return q;
      const a = aUrl === qUrl ? q : await get(aUrl);
      if (a.httpStatus < 200 || a.httpStatus >= 300) return a;
      const extracted = await extractPdf({ questionPdf: q.buffer, answerPdf: a.buffer, candidate });
      const stamp = new Date().toISOString();
      for (const side of [extracted?.question, extracted?.answer]) {
        if (side) side.source = { ...side.source, official: true, retrievedAt: stamp };
      }
      return { httpStatus: 200, contentType: "application/pdf", bytes: q.bytes + (aUrl === qUrl ? 0 : a.bytes), extracted };
    }
  };
}


export async function fetchQualificationIndex(url, { fetchImpl = fetch } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("INDEX_URL_INVALID"); }
  if (parsed.protocol !== "https:") throw new Error("INDEX_URL_MUST_USE_HTTPS");
  const response = await fetchImpl(url, { redirect: "manual" });
  if (!response.ok) throw Object.assign(new Error("INDEX_HTTP_ERROR"), { code: "INDEX_HTTP_" + response.status });
  const finalUrl = response.url || url;
  if (new URL(finalUrl).protocol !== "https:") throw new Error("INDEX_REDIRECT_NOT_HTTPS");
  const type = response.headers.get("content-type") || "";
  if (!/(csv|text|octet-stream)/i.test(type)) throw new Error("INDEX_CONTENT_TYPE_INVALID");
  const body = await response.text();
  const records = parseQualificationIndex(body);
  return { sourceUrl: url, finalUrl, retrievedAt: new Date().toISOString(), records };
}

export function parseTakkenQuestionAndAnswer(textByPage, { year, section, questionNumber, url }) {
  const joined = textByPage.map((text, index) => `\n[PAGE ${index + 1}]\n${text}`).join("\n");
  const marker = /【\s*問\s*(\d+)\s*】/g;
  const matches = [...joined.matchAll(marker)];
  const currentIndex = matches.findIndex(m => Number(m[1]) === Number(questionNumber));
  if (currentIndex < 0) throw new Error("QUESTION_MARKER_NOT_FOUND");
  const current = matches[currentIndex];
  const end = matches[currentIndex + 1]?.index ?? joined.indexOf("試験問題の正解番号", current.index);
  const block = joined.slice(current.index + current[0].length, end < 0 ? joined.length : end);
  const pageMatch = joined.slice(0, current.index).match(/\[PAGE (\d+)\]/g);
  const questionPage = pageMatch?.length ? Number(pageMatch.at(-1).match(/\d+/)[0]) : null;
  const lines = block.split(/\r?\n/).map(s => s.replace(/\[PAGE \d+\]/g, "").trim()).filter(Boolean);
  const choiceStart = /^([1-4])\s+(.+)$/;
  let stem = [], choices = [], lastNumber = 0;
  for (const line of lines) {
    const m = line.match(choiceStart);
    if (m && Number(m[1]) === lastNumber + 1) { lastNumber++; choices.push({ number: lastNumber, text: m[2].trim() }); }
    else if (choices.length) choices.at(-1).text += " " + line;
    else stem.push(line);
  }
  if (choices.length !== 4 || choices.some(c => !c.text.trim()) || !questionPage) throw new Error("QUESTION_OR_CHOICES_INCOMPLETE");

  const answerStart = joined.indexOf("試験問題の正解番号", current.index);
  if (answerStart < 0) throw new Error("ANSWER_TABLE_NOT_FOUND");
  const answerText = joined.slice(answerStart);
  const answerLines = answerText.split(/\r?\n/).filter(Boolean);
  let answer = null, answerPage = null;
  for (let i = 0; i < answerLines.length - 1; i++) {
    const headerNums = [...answerLines[i].matchAll(/問\s*(\d+)/g)].map(m => Number(m[1]));
    if (!headerNums.includes(Number(questionNumber))) continue;
    const values = [...answerLines[i + 1].matchAll(/[1-4]/g)].map(m => Number(m[0]));
    if (values.length !== headerNums.length) continue;
    const idx = headerNums.indexOf(Number(questionNumber));
    answer = values[idx];
    const p = joined.slice(0, answerStart).match(/\\[PAGE (\\d+)\\]/g);
    answerPage = p?.length ? Number(p.at(-1).match(/\\d+/)[0]) : null;
    break;
  }
  if (!answer || !answerPage) throw new Error("ANSWER_MAPPING_NOT_VERIFIED");
  const id = `${year}|${section}|問${questionNumber}`;
  return {
    question: {
      id, year: String(year), section, page: questionPage, text: stem.join(" ").trim(),
      choices, source: { url }
    },
    answer: {
      questionId: id, year: String(year), section, page: answerPage,
      number: answer, numberOfChoices: choices.length,
      evidence: `公式正解番号表の問${questionNumber}セル=${answer}（ページ${answerPage}）`,
      source: { url }
    }
  };
}

export async function extractPdfPages(pdfBytes) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: pdfBytes, useSystemFonts: true, isEvalSupported: false });
  const document = await task.promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!("str" in item) || !item.str) continue;
      const y = Math.round(item.transform[5] * 2) / 2;
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, text: item.str });
    }
    pages.push([...rows.entries()].sort((a,b) => b[0]-a[0]).map(([,items]) => items.sort((a,b) => a.x-b.x).map(i => i.text).join(" ")).join("\n"));
  }
  await document.destroy();
  return pages;
}
