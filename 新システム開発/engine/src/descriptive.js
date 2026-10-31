/** 土地家屋調査士の記述式。既存の択一問題や採点履歴は変更しない。 */
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
  if (!Number.isInteger(year) || !DESCRIPTIVE_FILES[year] ||
      !['午前の部', '午後の部'].includes(section) ||
      !(section === '午前の部' ? number === 11 : [21,22].includes(number))) return null;
  const sha = pins?.[year]?.[section];
  const file = DESCRIPTIVE_FILES[year][section];
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

export function descriptiveView(stored, sessionId, revealed = false) {
  const explanationMarkdown = revealed && typeof stored.explanationMarkdown === 'string'
    ? stored.explanationMarkdown : '';
  return { status: explanationMarkdown ? 'descriptiveActions' : revealed ? 'descriptiveReveal' : 'descriptiveQuestion', sessionId,
    ...(explanationMarkdown ? { explanationMarkdown } : {}),
    question: { kind: 'descriptive', gradingMode: 'none', questionId: stored.questionId,
      year: stored.year, section: stored.section, number: stored.number,
      shownAt: stored.shownAt ?? null,
      ...(revealed ? {} : { text: stored.text, pages: stored.pages, layout: stored.layout ?? [] }),
      sourceUrl: stored.sourceUrl,
      drawingAutoGraded: false },
    notice: revealed
      ? '採点は行いません。公式模範解答は確認できていません。AI参考解答は公式正解ではありません。'
      : '記述式・採点なし。公式原本の問題と図表を表示しています。' };
}
