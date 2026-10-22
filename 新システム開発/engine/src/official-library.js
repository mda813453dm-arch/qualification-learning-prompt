/**
 * 全ユーザー共通の「検証済み公式過去問」ライブラリ。
 * 保存先は既存 ingestSource の _shared 無期限保存。利用者別データは読まない。
 * 「解析器が対応できる年度」と「本当に保存済みの年度」を区別する。
 *
 * 共有に入れるのはサーバー側の既知SHAと、解析済み原本・正答・図表が
 * 全問一致した結果のみ。何も保存されていない年度は絶対に使用可能としない。
 */
import { readResult } from './cache.js';

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

export function publicLibraryView(library) {
  if (!library) return null;
  const { supportedYears, stored, missing, completeYears, totalQuestions } = library;
  return { supportedYears, stored, missing, completeYears, totalQuestions };
}

/** 共有キャッシュの存在を実際に確認してから表示する。個人の学習記録は含めない。 */
export async function officialLibrary(store, cat, parserVersion, now = Date.now()) {
  const spec = cat?.officialShared ?? cat;
  const expected = expectedRows(cat);
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
    const valid = r?.status === 'ready' &&
      r.qualificationId === cat.qualificationId && r.year === item.year &&
      r.section === item.section && r.parserVersion === parserVersion &&
      r.questionPdfSha256 === item.questionSha256 && r.answerPdfSha256 === item.answerSha256 &&
      (r.excluded ?? []).length === 0 && packets.length === item.count &&
      new Set(packets.map((p) => p.questionNumber)).size === item.count &&
      packets.every((p) => p.questionPdfSha256 === item.questionSha256 &&
        p.answerPdfSha256 === item.answerSha256 &&
        (Array.isArray(p.figures) && p.figures.length > 0 ||
          (Array.isArray(p.figures) && !p.figures.length && p.diagramRequired === false &&
            ['text', 'ocr'].includes(p.stemMode) && ['text', 'ocr'].includes(p.choiceMode) &&
            p.verification?.visual === 'question_level_pdf_graphics_checked')));
    if (valid) {
      stored.push({ year: item.year, section: item.section, questions: item.count });
      sources.push({
        qualificationId: cat.qualificationId, adapter: spec.uploadAdapter,
        year: item.year, section: item.section, status: 'done',
        packetCount: item.count, excludedCount: 0, keyParts, from: 'shared',
      });
    } else {
      missing.push({ year: item.year, section: item.section });
    }
  }));
  const order = (a, b) => b.year - a.year || sectionsForYear(spec, a.year).indexOf(a.section) - sectionsForYear(spec, b.year).indexOf(b.section);
  stored.sort(order); missing.sort(order); sources.sort(order);
  const completeYears = [...new Set(stored.map((s) => s.year))]
    .filter((year) => sectionsForYear(spec, year).every((section) => stored.some((s) => s.year === year && s.section === section)))
    .sort((a, b) => b - a);
  return {
    supportedYears: [...(spec?.validatedUploadYears ?? [])].sort((a,b) => b - a),
    stored, missing, completeYears,
    totalQuestions: stored.reduce((sum, row) => sum + row.questions, 0),
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
