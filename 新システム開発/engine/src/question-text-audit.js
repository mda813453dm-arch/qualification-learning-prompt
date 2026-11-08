/**
 * 公式過去問パケットの文字化・完全性を資格共通で監査する。
 *
 * 問数・正答が揃っていても「問題の写真＋数字だけの選択肢」を
 * 文字化済みとして扱わない。ここでは原本照合を実施できないため、
 * OCR は別区分（要原本照合）のまま保持する。
 */

const NUMBER_MARKER = /^(?:[0-9０-９]{1,2}|[①-⑳]|[アイウエオカキクケコ]|[A-JＡ-Ｊ])$/u;
const IMAGE_NOTES = new Set([
  'official_original_image_question',
  'generic_official_question_image',
  'ipa_fe_b_full_official_question_crop',
  'source_sha_pinned_image_heading_review',
]);

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

export function textAuditReasons(packet) {
  const p = packet ?? {};
  const reasons = [];
  const choices = Array.isArray(p.choices) ? p.choices : [];
  const imageText = p.stemMode === 'official_image' || p.choiceMode === 'official_image';
  if (imageText) reasons.push('FULL_QUESTION_IMAGE');
  if (!nonempty(p.stem)) reasons.push('STEM_EMPTY');
  if (choices.length < 2 || choices.some((value) => !nonempty(value))) reasons.push('CHOICES_INCOMPLETE');
  if (choices.length >= 2 && choices.every((choice) =>
    typeof choice === 'string' && NUMBER_MARKER.test(choice.trim()))) {
    reasons.push('CHOICES_PLACEHOLDERS');
  }
  if (p.stemMode === 'ocr' || p.choiceMode === 'ocr' ||
      p.verification?.questionText === 'ocr_unverified' ||
      p.verification?.choices === 'ocr_unverified') {
    reasons.push('OCR_UNVERIFIED');
  }
  if (Array.isArray(p.evidence?.notes) && p.evidence.notes.some((note) => IMAGE_NOTES.has(note))) {
    reasons.push('FULL_QUESTION_CROP_RECORDED');
  }
  if (p.diagramRequired && !Array.isArray(p.figures)) reasons.push('FIGURES_MISSING');
  if (p.diagramRequired && Array.isArray(p.figures) && !p.figures.length) reasons.push('FIGURES_MISSING');
  return reasons;
}

export function auditQuestionPackets(packets) {
  const rows = Array.isArray(packets) ? packets : [];
  const reasonCounts = {};
  const pending = [];
  let fullyText = 0;
  let imageOnly = 0;
  let ocrPending = 0;
  for (const p of rows) {
    const reasons = textAuditReasons(p);
    if (!reasons.length) fullyText++;
    if (reasons.includes('FULL_QUESTION_IMAGE')) imageOnly++;
    if (reasons.includes('OCR_UNVERIFIED')) ocrPending++;
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    if (reasons.length) pending.push({ questionNumber: p?.questionNumber ?? null, reasons });
  }
  return { total: rows.length, fullyText, imageOnly, ocrPending,
    pendingCount: pending.length, reasonCounts, pending };
}

