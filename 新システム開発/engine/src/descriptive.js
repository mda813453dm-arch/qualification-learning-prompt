/** 土地家屋調査士の記述式。既存の択一問題や採点履歴は変更しない。 */
export const DESCRIPTIVE_FILES = Object.freeze({
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
  return { year, section, number, sha, url: `https://www.moj.go.jp/content/${file}.pdf`,
    questionId: `land_surveyor:${year}:${section}:${number}` };
}
export function requestedDescriptive(text) {
  const t = String(text ?? '').normalize('NFKC');
  const q = /(?:第\s*(11|21|22)\s*問|問\s*(11|21|22))/.exec(t);
  if (!q) return null;
  const number = Number(q[1] || q[2]);
  const y = /20(?:22|23|24|25)/.exec(t)?.[0] ?? null;
  const r = /(?:令和|R)\s*([4-7])/.exec(t)?.[1] ?? null;
  const year = y ? Number(y) : r ? Number(r) + 2018 : 2025;
  const section = number === 11 ? '午前の部' : '午後の部';
  if (t.includes('午前') && section !== '午前の部') return null;
  if (t.includes('午後') && section !== '午後の部') return null;
  return { year, section, number };
}
export function descriptiveView(stored, sessionId, revealed = false) {
  return { status: revealed ? 'descriptiveReveal' : 'descriptiveQuestion', sessionId,
    question: { kind: 'descriptive', gradingMode: 'none', questionId: stored.questionId,
      year: stored.year, section: stored.section, number: stored.number,
      shownAt: stored.shownAt ?? null,
      text: stored.text, pages: stored.pages, layout: stored.layout ?? [], sourceUrl: stored.sourceUrl,
      drawingAutoGraded: false },
    notice: revealed
      ? '採点は行いません。公式模範解答は確認できていません。AI参考解答は公式正解ではありません。'
      : '記述式・採点なし。公式原本の問題と図表を表示しています。' };
}
