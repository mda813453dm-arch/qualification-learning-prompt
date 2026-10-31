/**
 * 平成19・20年度の旧PDFの試験区分を決める。
 * 原本の通算問題数（記述式を含む）が最優先。
 * 11問=午前（択一10+記述1）、22問=午後（択一20+記述2）。
 * 旧archiveの c_h19/20(am|pm)_q.pdf というファイル名は
 * この問題数と逆向きなので、記録済みハッシュが同一である場合に限り
 * 帳票名の識別補助に使う。ファイル名からの推測だけでは採点を許可しない。
 */
export const LEGACY_LAND_YEARS = Object.freeze([2007, 2008]);

export function landSectionFromTotalQuestions(year, total) {
  if (!LEGACY_LAND_YEARS.includes(Number(year))) return null;
  if (total === 11) return '午前の部';
  if (total === 22) return '午後の部';
  return null;
}

export function legacyLandSectionFromArchivedFileName(year, name) {
  if (!LEGACY_LAND_YEARS.includes(Number(year))) return null;
  const matched = /(?:^|[\\/])c_h(19|20)(am|pm)_q\.pdf(?:$|\?)/i.exec(String(name ?? ''));
  if (!matched || 1988 + Number(matched[1]) !== Number(year)) return null;
  const total = matched[2].toLowerCase() === 'am' ? 22 : 11;
  return landSectionFromTotalQuestions(Number(year), total);
}
