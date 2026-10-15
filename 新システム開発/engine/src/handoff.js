/**
 * 引継ぎ（方針5・設計計画§5）：問題本文を含めず、問題の「住所」と軽い学習状況だけを渡す。
 * 再開時は、引継ぎIDで保存してある分解結果から問題を読む。公式PDFは取り直さない（2026-10-15 決定）。
 */
import { STATE_VERSION } from './engine.js';

export const SCHEMA = 'qlp-handoff-v1';
const MAX_BYTES = 64 * 1024;
const MAX_QUESTIONS = 2000;
const RESULTS = new Set(['wrong', 'guess_correct', 'confident_correct']);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isSha = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const isUrl = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v) && v.length <= 500;

export function exportHandoff(state) {
  const questions = Object.entries(state.history).map(([questionId, h]) => ({
    year: h.source.year,
    section: h.source.section,
    number: h.source.number,
    questionPdfUrl: h.source.questionPdfUrl,
    questionPdfSha256: h.source.questionPdfSha256,
    answerPdfUrl: h.source.answerPdfUrl,
    answerPdfSha256: h.source.answerPdfSha256,
    result: h.result,
    answeredAt: h.answeredAt,
    reviewDue: state.review[questionId]?.dueDate ?? null,
  }));
  questions.sort((a, b) => b.year - a.year || a.number - b.number);
  const text = JSON.stringify({ schema: SCHEMA, qualificationId: state.qualificationId, learnerId: state.learnerId ?? null, questions, plan: state.plan });
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('HANDOFF_TOO_LARGE');
  return text;
}

function parse(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('HANDOFF_INVALID');
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error('HANDOFF_INVALID');
  }
  if (!v || v.schema !== SCHEMA || typeof v.qualificationId !== 'string' || !v.qualificationId || v.qualificationId.length > 100) throw new Error('HANDOFF_INVALID');
  if (!Array.isArray(v.questions) || v.questions.length > MAX_QUESTIONS) throw new Error('HANDOFF_INVALID');
  for (const q of v.questions) {
    const ok = q && Number.isInteger(q.year) && typeof q.section === 'string' && q.section.length <= 50 && Number.isInteger(q.number)
      && isUrl(q.questionPdfUrl) && isSha(q.questionPdfSha256) && isUrl(q.answerPdfUrl) && isSha(q.answerPdfSha256)
      && RESULTS.has(q.result) && isDate(q.answeredAt) && (q.reviewDue === null || isDate(q.reviewDue));
    if (!ok) throw new Error('HANDOFF_INVALID');
  }
  const plan = v.plan && typeof v.plan === 'object' ? v.plan : {};
  const learnerId = typeof v.learnerId === 'string' && /^[A-Za-z0-9]{1,40}$/.test(v.learnerId) ? v.learnerId : null;
  return { ...v, learnerId, plan: { examDate: isDate(plan.examDate) ? plan.examDate : null, fieldWeights: sanitizeWeights(plan.fieldWeights) } };
}

function sanitizeWeights(w) {
  if (!w || typeof w !== 'object') return {};
  return Object.fromEntries(Object.entries(w).filter(([k, n]) => k.length <= 100 && Number.isFinite(n)).slice(0, 100));
}

/**
 * 引継ぎデータから学習状況を戻す。公式PDFは取り直さない（再確認しない）。
 * 問題は引継ぎIDの保存（学習者ごとの取り込み）から読むので、ここでは学習状況だけを戻す。
 */
export function importHandoff(text, { now }) {
  const v = parse(text);
  const state = {
    v: STATE_VERSION,
    qualificationId: v.qualificationId,
    learnerId: v.learnerId,
    createdAt: now,
    plan: v.plan,
    history: {},
    review: {},
    current: null,
    withheld: [],
  };
  for (const q of v.questions) {
    const questionId = `${v.qualificationId}:${q.year}:${q.section}:${q.number}`;
    const source ={ year: q.year, section: q.section, number: q.number, questionPdfUrl: q.questionPdfUrl, questionPdfSha256: q.questionPdfSha256, answerPdfUrl: q.answerPdfUrl, answerPdfSha256: q.answerPdfSha256 };
    state.history[questionId] = { result: q.result, selected: null, answeredAt: q.answeredAt, source };
    if (q.reviewDue || q.result === 'wrong') {
      state.review[questionId] = {
        qualificationId: v.qualificationId,
        topicId: 'unclassified',
        unitId: questionId,
        pointId: null,
        source: q.result === 'wrong' ? 'wrong' : 'self_report',
        intervalDays: 1,
        recallSuccesses: 0,
        lastJudgedDate: q.answeredAt,
        dueDate: q.reviewDue,
        lastResult: q.result,
        comprehensive: false,
        exemptStopped: false,
      };
    }
  }
  return state;
}

/** 出題を止めた理由を、利用者に見せる文にする。 */
export const WITHHELD_MESSAGES = {
  OFFICIAL_PDF_REPLACED: '公式PDFが差し替えられていたため、この問題は出題しません。',
  OFFICIAL_PDF_UNAVAILABLE: '公式PDFを取得できなかったため（削除・移動の可能性）、この問題は出題しません。',
  OFFICIAL_PDF_INVALID: '公式PDFの内容を確認できなかったため、この問題は出題しません。',
};
