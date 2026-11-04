/** 土地家屋調査士の記述式。既存の択一問題や採点履歴は変更しない。 */
import { landSurveyorMorningReference } from './land-surveyor-am-references.js';
// 2007-2014は無料の日本語OCR仮読取と原本画像照合。旧年度の択一採点用PINには混ぜない。
// 2007-2008の元サイトのam/pmファイル名は現行の11問／22問区分と逆。
export const SCANNED_DESCRIPTIVE_FILES = Object.freeze({
  2007: { '午前の部': ['c_h19pm_q.pdf','4ba49614f2362f5f88257dd9645868c49f8a05f318ba9fb5658163586ef2d15e'], '午後の部': ['c_h19am_q.pdf','d9b03f5e3ab434e3e323baa87d1174262389e48eec08ad0a38ecd9c8c8ac29aa'] },
  2008: { '午前の部': ['c_h20pm_q.pdf','7d3d4652f14c978cf7d5912426fe6dfcca9364897d2b78dc2022903fbcaf3d6d'], '午後の部': ['c_h20am_q.pdf','f0fa3edd7462534b15317fe81a7e6b9bda80113398fe6ca26ad03b0b19a750d5'] },
  2009: { '午前の部': ['c_h21am_q.pdf','f6156476c7e694736687f030751bb75bb593a0a661d78419c552f1887aeecd97'], '午後の部': ['c_h21pm_q.pdf','15d47f6f49d4acb93f58ac0307645f34bc9481e664b69ea8b6b82e5bd0b14535'] },
  2010: { '午前の部': ['c_h22am_q.pdf','4b54360ef36c2d9c195677cda258c33892b903f08fde3ddc7c1a1189eaf581a1'], '午後の部': ['c_h22pm_q.pdf','eefd4b1ebcc88ab5d4a18b876fe4d8e48cbc312c5eefc3ac76e7080ef16bc4a2'] },
  2011: { '午前の部': ['c_h23am_q.pdf','4d6f9d997b1b54427f4d68c26c3f2d0b9a9ef37d3a47d1309cb38815918d0a37'], '午後の部': ['c_h23pm_q.pdf','16b90155024afaff04ee1375ec1a2b57a8377bfb67036671fc086407efb54005'] },
  2012: { '午前の部': ['c_h24am_q.pdf','adf39e538daab75b8a2ff42ca5577dc116c774e9385bc4bd39d0aadd4fe71bcf'], '午後の部': ['c_h24pm_q.pdf','d4523d3ae584608cf8d59cbe36ee4afe1ac0ee248d89e0ea878aaa11cdee9e9f'] },
  2013: { '午前の部': ['c_h25am_q.pdf','c683d1e966142d01c30755301d9c644dd5e193017da132d41499abee01d25e27'], '午後の部': ['c_h25pm_q.pdf','6bdcebbb0aae372b7afcd0ebc3bbf35b0b95a624e2b466f17c6df652252da583'] },
  2014: { '午前の部': ['c_h26am_q.pdf','f585fa579b533ef1058817f457e5b0684e4fe71b279d58f858a9d802c5b0f766'], '午後の部': ['c_h26pm_q.pdf','8244f6cffbf1cc14560e4238a79ac77bf06e84902187cb0448b247e687197eb3'] },
});
export const DESCRIPTIVE_FILES = Object.freeze({
  2015: { '午前の部': 'https://izuki.net/wp-content/uploads/c_h27am_q.pdf', '午後の部': 'https://izuki.net/wp-content/uploads/c_h27pm_q.pdf' },
  2016: { '午前の部': 'https://izuki.net/wp-content/uploads/c_h28am_q.pdf', '午後の部': 'https://izuki.net/wp-content/uploads/c_h28pm_q.pdf' },
  2017: { '午前の部': 'https://izuki.net/wp-content/uploads/c_h29am_q.pdf', '午後の部': 'https://izuki.net/wp-content/uploads/c_h29pm_q.pdf' },
  2018: { '午前の部': 'https://izuki.net/wp-content/uploads/c_h30am_q.pdf', '午後の部': 'https://izuki.net/wp-content/uploads/c_h30pm_q.pdf' },
  2019: { '午前の部': 'https://izuki.net/wp-content/uploads/c_r1am_q.pdf', '午後の部': 'https://izuki.net/wp-content/uploads/c_r1pm_q.pdf' },
  2020: { '午前の部': 'https://izuki.net/wp-content/uploads/c_r2am_q.pdf', '午後の部': 'https://izuki.net/wp-content/uploads/c_r2pm_q.pdf' },
  2021: { '午前の部': 'https://izuki.net/wp-content/uploads/c_r3am_q.pdf', '午後の部': 'https://izuki.net/wp-content/uploads/c_r3pm_q.pdf' },
  2022: { '午前の部': '001383834', '午後の部': '001383847' },
  2023: { '午前の部': '001408935', '午後の部': '001408936' },
  2024: { '午前の部': '001427201', '午後の部': '001427202' },
  2025: { '午前の部': '001450010', '午後の部': '001450011' },
});
export function descriptiveSpec(year, section, number, pins) {
  if (!Number.isInteger(year) || !(DESCRIPTIVE_FILES[year] || SCANNED_DESCRIPTIVE_FILES[year]) ||
      !['午前の部', '午後の部'].includes(section) ||
      !(section === '午前の部' ? number === 11 : [21,22].includes(number))) return null;
  const scanned = SCANNED_DESCRIPTIVE_FILES[year]?.[section];
  const sha = scanned?.[1] ?? pins?.[year]?.[section];
  const file = scanned ? `https://izuki.net/wp-content/uploads/${scanned[0]}` : DESCRIPTIVE_FILES[year][section];
  if (typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha) || !file) return null;
  return { year, section, number, sha,
    url: file.startsWith('https://') ? file : `https://www.moj.go.jp/content/${file}.pdf`,
    questionId: `land_surveyor:${year}:${section}:${number}` };
}
export function requestedDescriptive(text) {
  const t = String(text ?? '').normalize('NFKC');
  const q = /(?:第\s*(11|21|22)\s*問|問\s*(11|21|22))/.exec(t);
  if (!q) return null;
  const number = Number(q[1] || q[2]);
  const y = /\b20(?:0[7-9]|1\d|2[0-5])\b/.exec(t)?.[0] ?? null;
  const r = /(?:令和|R)\s*(元|[1-7])/.exec(t)?.[1] ?? null;
  const h = /(?:平成|H)\s*(1[9]|2\d|30)/.exec(t)?.[1] ?? null;
  const year = y ? Number(y) : r ? (r === '元' ? 2019 : Number(r) + 2018) : h ? Number(h) + 1988 : 2025;
  const section = number === 11 ? '午前の部' : '午後の部';
  if (t.includes('午前') && section !== '午前の部') return null;
  if (t.includes('午後') && section !== '午後の部') return null;
  return { year, section, number };
}

// User-provided answer-sheet evidence (AGAROOT, 2022 / R4, morning Q11).
// This is NOT a Ministry of Justice model answer. The ministry's published
// answer-key PDF covers multiple choice and cannot verify these four results.
// Keep the provenance visible to the model; never present this as official.
export const PROVIDED_REFERENCE_2022_AM11 = Object.freeze({
  source: '利用者提供・令和4年度午前第11問の答案用紙画像（アガルート掲載、公式模範解答ではない）',
  answers: Object.freeze([
    { number: 1, answer: 'B点 X=-26.27m、Y=-6.84m', tokens: ['-26.27','-6.84'] },
    { number: 2, answer: '水平角279°29′、水平距離28.58m', tokens: ["279°29'",'28.58'] },
    { number: 3, answer: 'F点 X=1.51m、Y=1.40m', tokens: ['1.51','1.40'] },
    { number: 4, answer: '土地面積321.87㎡', tokens: ['321.87'] },
  ]),
  roundingNote: '利用者の再計算ではB点・F点の座標を0.01mに丸めてから面積計算すると321.8717㎡、未丸め座標では321.887299…㎡。原本の丸め指定は別途照合する。',
});

const isProvidedReferenceTarget = (current) =>
  Number(current?.year) === 2022 && current?.section === '午前の部' && Number(current?.number) === 11;
export function descriptiveProvidedReference(current) {
  if (isProvidedReferenceTarget(current)) return PROVIDED_REFERENCE_2022_AM11;
  if (current?.section === '午前の部' && Number(current?.number) === 11)
    return landSurveyorMorningReference(current.year);
  return null;
}

const pageFolio = /^(?:[（(]\s*[）)]\s*\d{1,3}|[（(]\s*\d{1,3}\s*[）)])$/;
/** Legacy parsed sessions may still contain printed PDF page numbers. This
 * filters display text, never the source PDF or any table/figure data. */
export function cleanDescriptivePageFolios(value) {
  if (typeof value !== 'string') return value;
  return value.split('\n').filter((line) => !pageFolio.test(line.trim()))
    .join('\n').replace(/(?:[。．]\s*)[（(]\s*[）)]\s*\d{1,3}(?=\s*$)/, (whole) => whole.slice(0, 1));
}
export function cleanDescriptiveLayout(layout) {
  if (!Array.isArray(layout)) return [];
  return layout.map((block) => block?.kind === 'text'
    ? { ...block, text: cleanDescriptivePageFolios(block.text) } : block)
    .filter((block) => block?.kind !== 'text' || block.text?.trim());
}

// A numerical answer previously registered for this pinned question was
// demonstrably inconsistent with the supplied answer-sheet. Reject it even if
// the explanation is long and contains mathematically plausible prose.
const normalizedCalculation = (value) => String(value ?? '').normalize('NFKC')
  .replace(/[−–—－]/g, '-').replace(/[′’‘＇]/g, "'")
  .replace(/度/g, '°').replace(/分/g, "'").replace(/\s+/g, '');
function hasExactNumber(text, numeric) {
  return new RegExp(`(^|[^0-9.])${numeric.replace('.', '\\.')}(?![0-9])`).test(text);
}
function hasReferenceTokens(value, tokens) {
  const text = normalizedCalculation(value);
  return tokens.every((token) => {
    const expected = normalizedCalculation(token);
    return /^-?\d+(?:\.\d+)?$/.test(expected)
      ? hasExactNumber(text, expected) : text.includes(expected);
  });
}
export function validateDescriptiveProvidedReference(markdown, summary, current) {
  const reference = descriptiveProvidedReference(current);
  if (!reference) return { ok: true };
  if (!Array.isArray(summary)) return { ok: false, code: 'DESCRIPTIVE_REFERENCE_SUMMARY_REQUIRED' };
  const prose = String(markdown ?? '').normalize('NFKC');
  const sections = [...prose.matchAll(
    /^\s*#{1,4}\s*(?:第\s*)?問\s*(\d{1,2})(?=\s|[：:（(]|$)/gm)];
  const chunkFor = (n) => {
    const idx = sections.findIndex((match) => Number(match[1]) === n);
    if (idx < 0) return '';
    return prose.slice(sections[idx].index, sections[idx + 1]?.index);
  };
  for (const ref of reference.answers) {
    const number = ref.number;
    if (!ref.tokens?.length) continue; // 作図の原本答案を推測で補完しない。
    const answer = summary.find((entry) => entry?.number === number)?.answer;
    if (!answer || !hasReferenceTokens(answer, ref.tokens) ||
        !hasReferenceTokens(chunkFor(number), ref.tokens))
      return { ok: false, code: 'DESCRIPTIVE_REFERENCE_ANSWER_MISMATCH', number };
  }
  return { ok: true };
}

export function hasPublishableDescriptiveExplanation(stored) {
  if (typeof stored?.explanationMarkdown !== 'string' || !stored.explanationMarkdown.trim()) return false;
  return validateDescriptiveProvidedReference(stored.explanationMarkdown,
    stored.answerSummary, stored).ok;
}
/**
 * AI作成の参考解説を公開する前に、関数電卓だけの断片的な説明を拒否する。
 * 数値・公式正答の正しさはここでは保証せず、原本照合はモデルに求める。
 */
export function validateDescriptiveExplanation(markdown, current) {
  if (typeof markdown !== 'string' || !markdown.trim() || markdown.length > 40000)
    return { ok: false, code: 'DESCRIPTIVE_EXPLANATION_REQUIRED' };
  const text = markdown.normalize('NFKC').trim();
  if (text.length < 160) return { ok: false, code: 'DESCRIPTIVE_EXPLANATION_TOO_SHORT' };
  if ([11, 21].includes(Number(current?.number))) {
    // 土地の記述式は複数小問から成る。電卓の公式だけを送る実装漏れを検出する。
    const headers = [...text.matchAll(/^\s*#{1,4}\s*(?:第\s*)?(?:問|設問|小問)\s*([0-9]{1,2})(?:\s|[：:（(]|$)/gm)];
    const ids = new Set(headers.map((m) => Number(m[1])));
    if (ids.size < 2) return { ok: false, code: 'DESCRIPTIVE_SUBQUESTIONS_MISSING' };
    if (text.length < 700) return { ok: false, code: 'DESCRIPTIVE_EXPLANATION_TOO_SHORT' };
    // 座標・登記の基本解法が欠け、複素数の入力例だけになる事故を阻止する。
    if (!/(?:通常解法|座標法|三角関数|法的根拠|登記の根拠)/.test(text) ||
        !/(?:根拠|理由|判断|検算)/.test(text))
      return { ok: false, code: 'DESCRIPTIVE_NORMAL_METHOD_MISSING' };
    // 元問題に地積計算が含まれる土地の問では電卓の別解も必須。
    if (/(?:地積|面積)/.test(String(current?.text || '')) &&
        (!/Conjg|Conj/i.test(text) || !/Imag|ImP/i.test(text)))
      return { ok: false, code: 'DESCRIPTIVE_AREA_CALCULATOR_MISSING' };
  }
  return { ok: true };
}


/** 解答一覧はAIが明示した内容のみ保存し、原本から数値を推測しない。
 * 未確認は「未確認」と書く。古い未指定の保存記録には空配列を使用。
 */
export function validateDescriptiveAnswerSummary(summary, markdown) {
  if (summary === undefined) return { ok: true, rows: [] };
  if (!Array.isArray(summary) || !summary.length || summary.length > 15)
    return { ok: false, code: 'DESCRIPTIVE_SUMMARY_INVALID' };
  const text = String(markdown ?? '').normalize('NFKC');
  const headings = [...text.matchAll(/^\s*#{1,4}\s*(?:第\s*)?問\s*(\d{1,2})(?=\s|[：:（(]|$)/gm)]
    .map((m) => Number(m[1]));
  const unique = new Set(headings);
  const seen = new Set();
  const rows = [];
  for (const entry of summary) {
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.number) ||
        entry.number < 1 || entry.number > 30 || seen.has(entry.number) ||
        typeof entry.answer !== 'string' || !entry.answer.trim() || entry.answer.length > 300 ||
        !unique.has(entry.number))
      return { ok: false, code: 'DESCRIPTIVE_SUMMARY_INVALID' };
    seen.add(entry.number);
    rows.push({ number: entry.number, answer: entry.answer.trim() });
  }
  if (seen.size !== unique.size) return { ok: false, code: 'DESCRIPTIVE_SUMMARY_INCOMPLETE' };
  rows.sort((a, b) => a.number - b.number);
  return { ok: true, rows };
}

export function descriptiveView(stored, sessionId, revealed = false) {
  const explanationMarkdown = revealed && hasPublishableDescriptiveExplanation(stored)
    ? stored.explanationMarkdown : '';
  return { status: explanationMarkdown ? 'descriptiveActions' : revealed ? 'descriptiveReveal' : 'descriptiveQuestion', sessionId,
    ...(explanationMarkdown ? { explanationMarkdown, answerSummary: stored.answerSummary ?? [] } : {}),
    ...(revealed && descriptiveProvidedReference(stored) ? {
      providedReference: descriptiveProvidedReference(stored),
      referenceCorrectionRequired: !!stored.explanationMarkdown && !explanationMarkdown,
    } : {}),
    question: { kind: 'descriptive', gradingMode: 'none', questionId: stored.questionId,
      year: stored.year, section: stored.section, number: stored.number,
      shownAt: stored.shownAt ?? null,
      ...(revealed ? {} : { text: cleanDescriptivePageFolios(stored.text), pages: stored.pages,
        layout: cleanDescriptiveLayout(stored.layout) }),
      sourceUrl: stored.sourceUrl,
      drawingAutoGraded: false },
    notice: revealed
      ? (stored.explanationMarkdown && !explanationMarkdown
        ? '前回のAI参考解答は提供された解答案と不一致のため、表示を停止しました。解答・解説の再作成を依頼してください。採点は行いません。'
        : '採点は行いません。公式模範解答は確認できていません。AI参考解答は公式正解ではありません。')
      : stored.year <= 2014
        ? '記述式・採点なし。OCRによる本文の仮読取と原本画像を区別しています。数値や図面は原本で確認してください。'
        : '記述式・採点なし。公式原本の問題と図表を表示しています。' };
}
