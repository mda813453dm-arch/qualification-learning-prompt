/**
 * 学習エンジン：出題・採点・復習・次問。AIは結果を表示するだけで、出題順や正誤は決めない。
 *
 * 固定の回帰ケース（AI共通運用ルール・設計計画§7-6）：
 * - 問番号・本文・正答の誤結合を防ぐ：採点は「出題したときに控えた questionId と正答」でだけ行う。
 *   回答に付いてきた questionId が出題中のものと違えば採点しない。
 * - 出題済みの問題を回答後に採点保留へ戻さない：採点済みの問への再回答は、同じ採点結果を返すだけ。
 * - 通常採点で再検索しない：採点時に公式PDFや保存データを読み直さない。
 */
import { readResult } from './cache.js';
import { selectDueReviews, updateReviewItem } from './review.js';

export const STATE_VERSION = 1;
const OCR_NOTICE = '問題文はOCRで読み取った文字のため、読み違いがある場合があります。原本は公式PDFで確認できます。';

export function newState({ qualificationId, plan = {}, now }) {
  if (!qualificationId) throw new Error('QUALIFICATION_REQUIRED');
  return {
    v: STATE_VERSION,
    qualificationId,
    createdAt: now,
    plan: { examDate: plan.examDate ?? null, fieldWeights: plan.fieldWeights ?? {} },
    history: {}, // questionId -> {result, selected, answeredAt, source}
    review: {}, // questionId -> 復習の予定（review.js の item）
    current: null, // 出題中の問（正答はここに控え、AIには渡さない）
    withheld: [], // 引継ぎ時に出題を止めた問と理由
  };
}

/** 取り込みが済んだ分解結果から、出題できる問を集める（年度の新しい順・問番号順）。 */
export async function availablePackets(store, job, now) {
  const out = [];
  for (const s of job?.sources ?? []) {
    if (s.status !== 'done' || !s.keyParts) continue;
    const r = await readResult(store, s.keyParts, now);
    if (!r.hit) continue; // 期限切れ：次の取り込みで取り直す
    for (const p of r.result.packets) out.push({ packet: p, keyParts: s.keyParts });
  }
  out.sort((a, b) => b.packet.year - a.packet.year || a.packet.questionNumber - b.packet.questionNumber);
  return out;
}

function weight(state, packet) {
  return Number(state.plan.fieldWeights?.[packet.fieldId] ?? 0);
}

/**
 * 次の問を決める。出題中で未採点の問があれば、それをもう一度返す（別の問に差し替えない）。
 * 返り値 {status, question?, notice?}。status: question | waiting | finished
 */
export function pickNext(state, items, { today, job }) {
  if (state.current && !state.current.grade) {
    const same = items.find((x) => x.packet.questionId === state.current.questionId);
    if (same) return { status: 'question', item: same, kind: state.current.kind, repeated: true };
  }
  const withheld = new Set(state.withheld.map((w) => w.questionId));
  const usable = items.filter((x) => !withheld.has(x.packet.questionId));
  const byId = new Map(usable.map((x) => [x.packet.questionId, x]));
  // 1) 期限の来た復習
  const due = selectDueReviews({ today, items: Object.values(state.review), sessionStart: true });
  for (const r of due.items ?? []) {
    const hit = byId.get(r.unitId);
    if (hit) return { status: 'question', item: hit, kind: 'review' };
  }
  // 2) まだ解いていない問（分野の重みが大きい順。重みが同じなら年度の新しい順・問番号順）
  const fresh = usable.filter((x) => !state.history[x.packet.questionId]);
  if (fresh.length) {
    const best = fresh.reduce((a, b) => (weight(state, b.packet) > weight(state, a.packet) ? b : a));
    return { status: 'question', item: best, kind: 'new' };
  }
  if (job && job.state === 'running') return { status: 'waiting' };
  return { status: 'finished' };
}

/** AIに渡す形。正答は入れない。図は保存先のURLにする。 */
export function present(item, kind, figureBase = '/v1/figure') {
  const p = item.packet;
  const notices = [];
  if (p.stemMode === 'ocr' || p.choiceMode === 'ocr') notices.push(OCR_NOTICE);
  return {
    questionId: p.questionId,
    kind,
    year: p.year,
    section: p.section,
    questionNumber: p.questionNumber,
    stem: p.stem,
    stemMode: p.stemMode ?? 'text',
    choices: p.choices,
    choiceMode: p.choiceMode ?? 'text',
    figures: (p.figures ?? []).map((f) => ({
      url: `${figureBase}/${p.questionPdfSha256}/${encodeURIComponent(item.keyParts.parserVersion)}/${encodeURIComponent(f.file)}`,
      width: f.width,
      height: f.height,
      sha256: f.sha256,
    })),
    questionPdfUrl: p.questionPdfUrl,
    questionPdfPages: p.evidence?.questionPdfPages ?? [],
    notices,
  };
}

/** 出題した問を控える（正答・出典もここで固定する）。 */
export function pin(state, item, kind, now) {
  const p = item.packet;
  if (state.current && !state.current.grade && state.current.questionId === p.questionId) return state;
  return {
    ...state,
    current: {
      questionId: p.questionId,
      kind,
      correctAnswer: p.correctAnswer,
      choiceCount: p.choices.length,
      fieldId: p.fieldId ?? null,
      source: sourceOf(p),
      presentedAt: now,
      grade: null,
    },
  };
}

function sourceOf(p) {
  return {
    year: p.year,
    section: p.section,
    number: p.questionNumber,
    questionPdfUrl: p.questionPdfUrl,
    questionPdfSha256: p.questionPdfSha256,
    answerPdfUrl: p.answerPdfUrl,
    answerPdfSha256: p.answerPdfSha256,
  };
}

/**
 * 回答を採点する。confidence: 'sure'（自信あり・既定）| 'guess'（勘で当てた）
 * 返り値 {ok, state, grade} / {ok:false, reason}
 */
export function grade(state, { questionId, value, confidence = 'sure' }, { today, now }) {
  const cur = state.current;
  if (!cur) return { ok: false, reason: 'NO_QUESTION_PRESENTED' };
  if (questionId !== cur.questionId) return { ok: false, reason: 'QUESTION_BINDING_MISMATCH' };
  if (cur.grade) return { ok: true, state, grade: { ...cur.grade, alreadyGraded: true } };
  const n = Number(String(value ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > cur.choiceCount) return { ok: false, reason: 'ANSWER_INPUT_INVALID' };
  const correct = n === cur.correctAnswer;
  const result = !correct ? 'wrong' : confidence === 'guess' ? 'guess_correct' : 'confident_correct';
  const g = { questionId, selected: n, correctAnswer: cur.correctAnswer, correct, result, answerPdfUrl: cur.source.answerPdfUrl };
  const upd = updateReviewItem(state.review[questionId] ?? null, {
    unitId: questionId,
    topicId: cur.fieldId ?? 'unclassified',
    qualificationId: state.qualificationId,
    result,
    source: correct ? 'self_report' : 'wrong',
  }, { today, examDate: state.plan.examDate });
  const review = { ...state.review };
  if (upd.status === 'updated') review[questionId] = upd.item;
  return {
    ok: true,
    grade: g,
    state: {
      ...state,
      current: { ...cur, grade: g },
      history: { ...state.history, [questionId]: { result, selected: n, answeredAt: today, source: cur.source } },
      review,
    },
  };
}

/** 日本時間の今日（YYYY-MM-DD）。 */
export function jstToday(now) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
