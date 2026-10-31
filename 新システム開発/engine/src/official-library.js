/**
 * 全ユーザー共通の「検証済み公式過去問」ライブラリ。
 * 保存先は既存 ingestSource の _shared 無期限保存。利用者別データは読まない。
 * 「解析器が対応できる年度」と「本当に保存済みの年度」を区別する。
 *
 * 共有に入れるのはサーバー側の既知SHAと、解析済み原本・正答・図表が
 * 全問一致した結果のみ。何も保存されていない年度は絶対に使用可能としない。
 */
import { readResult } from './cache.js';
import { descriptiveSpec, DESCRIPTIVE_FILES, SCANNED_DESCRIPTIVE_FILES } from './descriptive.js';

const SHARED_OWNER = '_shared';

function sectionsForYear(spec, year) {
  return spec.sectionsByYear?.[year] ?? spec.uploadSections ?? [];
}

function expectedRows(cat) {
  const spec = cat?.officialShared ?? cat;
  if (!spec?.officialPdfPins || !spec?.uploadSections || !spec?.validatedUploadYears) return [];
  return spec.validatedUploadYears.flatMap((year) => {
    const pins = spec.officialPdfPins[year];
    if (!pins) return [];
    return sectionsForYear(spec, year).map((section) => {
      const sha = pins[section];
      const answerSha = pins.answers?.[section] ?? pins.answer;
      const count = spec.uploadQuestionCounts?.[section];
      if (!/^[a-f0-9]{64}$/.test(String(sha || '')) ||
          !/^[a-f0-9]{64}$/.test(String(answerSha || '')) ||
          !Number.isInteger(count) || count < 1) return null;
      return { year, section, questionSha256: sha, answerSha256: answerSha, count };
    }).filter(Boolean);
  });
}

/** 原本とは別に、解析・検証と読み戻しを終えた区分だけ使用可能とする。 */
async function ipaReadyRows(store, cat) {
  const qualification = cat.qualificationId;
  const codes = {
    '科目A': 'a', '科目B': 'b',
    '春期午前': 'spring-am', '秋期午前': 'autumn-am', '10月午前': 'october-am',
  };
  const result = await Promise.all(cat.sources.map(async ({ year, section }) => {
    const code = codes[section];
    if (!code) return null;
    const row = await store.get(`ipa-source/${qualification}/${year}/${code}`, 'json').catch(() => null);
    if (!['learning-ready', 'learning-partial'].includes(row?.status) || !Number.isInteger(row.learningQuestionCount) ||
        row.learningQuestionCount < 1 || !/^[a-f0-9]{64}$/.test(row.question?.sha256 ?? '') ||
        !/^[a-f0-9]{64}$/.test(row.answer?.sha256 ?? '')) return null;
    return { year, section, questionSha256: row.question.sha256,
      answerSha256: row.answer.sha256, count: row.learningQuestionCount,
      partial: row.status === 'learning-partial',
      excludedCount: row.learningExcludedCount ?? 0 };
  }));
  return result.filter(Boolean);
}

export function publicLibraryView(library) {
  if (!library) return null;
  const { supportedYears, stored, missing, completeYears, totalQuestions, sectionsByYear, descriptive } = library;
  return { supportedYears, stored, missing, completeYears, totalQuestions, sectionsByYear,
    ...(descriptive ? { descriptive } : {}) };
}

// 記述式は原本のSHA固定と出題アダプタの対応状況だけを列挙する。
// 択一式の共有保存済み件数や正答付き採点可能件数には足さない。
function descriptiveAvailability(cat) {
  if (cat?.qualificationId !== 'land_surveyor') return null;
  const years = [...new Set([...Object.keys(DESCRIPTIVE_FILES),
    ...Object.keys(SCANNED_DESCRIPTIVE_FILES)].map(Number))].sort((a,b) => b-a);
  const byYear = {};
  for (const year of years) {
    const morning = descriptiveSpec(year, '午前の部', 11, cat.officialPdfPins);
    const land = descriptiveSpec(year, '午後の部', 21, cat.officialPdfPins);
    const building = descriptiveSpec(year, '午後の部', 22, cat.officialPdfPins);
    const sections = { ...(morning ? { '午前の部': 1 } : {}),
      ...(land || building ? { '午後の部': Number(!!land) + Number(!!building) } : {}) };
    if (Object.keys(sections).length) byYear[year] = sections;
  }
  const availableYears = years.filter((year) => byYear[year]);
  return { years: availableYears, byYear,
    totalQuestions: availableYears.reduce((sum, year) =>
      sum + Object.values(byYear[year]).reduce((a,b) => a+b, 0), 0),
    gradingMode: 'none', scannedYears: availableYears.filter((year) => !!SCANNED_DESCRIPTIVE_FILES[year]),
  };
}

/** 共有キャッシュの存在を実際に確認してから表示する。個人の学習記録は含めない。 */
export async function officialLibrary(store, cat, parserVersion, now = Date.now()) {
  const spec = cat?.officialShared ?? cat;
  const expected = cat?.ipaOfficialArchive ? await ipaReadyRows(store, cat) : expectedRows(cat);
  const stored = [];
  const missing = [];
  const sources = [];
  await Promise.all(expected.map(async (item) => {
    const keyParts = {
      qualificationId: cat.qualificationId,
      year: item.year, section: item.section,
      questionSha256: item.questionSha256,
      answerSha256: item.answerSha256,
      parserVersion, owner: SHARED_OWNER,
    };
    const found = await readResult(store, keyParts, now);
    const r = found.hit ? found.result : null;
    const packets = r?.packets ?? [];
    const valid = (r?.status === 'ready' || cat?.ipaOfficialArchive && item.partial && r?.status === 'partial') &&
      r.qualificationId === cat.qualificationId && r.year === item.year &&
      r.section === item.section && r.parserVersion === parserVersion &&
      r.questionPdfSha256 === item.questionSha256 && r.answerPdfSha256 === item.answerSha256 &&
      (cat?.ipaOfficialArchive && item.partial
        ? (r.excluded ?? []).length === item.excludedCount
        : (r.excluded ?? []).length === 0) && packets.length === item.count &&
      new Set(packets.map((p) => p.questionNumber)).size === item.count &&
      packets.every((p) => p.questionPdfSha256 === item.questionSha256 &&
        p.answerPdfSha256 === item.answerSha256 &&
        (Array.isArray(p.figures) && p.figures.length > 0 ||
          (Array.isArray(p.figures) && !p.figures.length && p.diagramRequired === false &&
            ['text', 'ocr'].includes(p.stemMode) && ['text', 'ocr'].includes(p.choiceMode) &&
            p.verification?.visual === 'question_level_pdf_graphics_checked')));
    if (valid) {
      stored.push({ year: item.year, section: item.section, questions: item.count,
        ...(cat.qualificationId === 'land_surveyor' && [2022,2023,2024,2025].includes(item.year)
          ? { writtenQuestions: item.section === '午前の部' ? 1 : 2 } : {}),
        ...(item.partial ? { partial: true, excludedQuestions: item.excludedCount } : {}) });
      sources.push({
        qualificationId: cat.qualificationId, adapter: spec.uploadAdapter,
        year: item.year, section: item.section, status: 'done',
        packetCount: item.count, excludedCount: item.excludedCount ?? 0, keyParts, from: 'shared',
      });
    } else {
      missing.push({ year: item.year, section: item.section });
    }
  }));
  const order = (a, b) => b.year - a.year || sectionsForYear(spec, a.year).indexOf(a.section) - sectionsForYear(spec, b.year).indexOf(b.section);
  stored.sort(order); missing.sort(order); sources.sort(order);
  const completeYears = [...new Set(stored.map((s) => s.year))]
    .filter((year) => cat?.ipaOfficialArchive
      ? cat.sources.filter((s) => s.year === year).every((s) => stored.some((r) => r.year === year && r.section === s.section && !r.partial))
      : sectionsForYear(spec, year).every((section) => stored.some((s) => s.year === year && s.section === section)))
    .sort((a, b) => b - a);
  const supportedYears = [...(cat?.ipaOfficialArchive ? new Set(cat.sources.map((s) => s.year)) : (spec?.validatedUploadYears ?? []))].sort((a,b) => b - a);
  // 資格ごとの試験区分をデータから返す。宅建に午前・午後という架空の区分を表示しない。
  const sectionsByYear = Object.fromEntries(supportedYears.map((year) => [year,
    cat?.ipaOfficialArchive ? cat.sources.filter((s) => s.year === year).map((s) => s.section) : sectionsForYear(spec, year)]));
  const descriptive = descriptiveAvailability(cat);
  return {
    supportedYears, sectionsByYear,
    stored, missing, completeYears,
    totalQuestions: stored.reduce((sum, row) => sum + row.questions, 0),
    ...(descriptive ? { descriptive } : {}),
    sources,
  };
}

export function combineWithSharedJob(job, shared, qualificationId, now) {
  if (!shared?.sources?.length) return job;
  const sources = new Map((job?.sources ?? []).map((s) => [`${s.year}:${s.section}`, s]));
  // 同じ年度の共有版が完成していれば、利用者別の未取込・失敗より共有を優先。
  for (const src of shared.sources) sources.set(`${src.year}:${src.section}`, src);
  const all = [...sources.values()];
  const pending = all.some((s) => s.status === 'pending');
  return {
    ...(job ?? {}),
    qualificationId: job?.qualificationId ?? qualificationId,
    startedAt: job?.startedAt ?? now,
    state: pending ? 'running' : all.some((s) => s.status === 'done') ? 'done' : 'failed',
    sources: all,
    sharedAvailable: true,
  };
}
