/**
 * 学習計画・初期診断・苦手分野の判定・出題する分野と問題の選び方（ChatGPT開発版の学習進行仕様 2026-10-14 を実装）。
 * 順番や判定はすべてここで決め、AIは結果を表示するだけにする。
 *
 * 根拠にした仕様（ai-learning-system ブランチ）：
 * - 新システム開発/AIアプリ学習開始プロンプト_開発テスト版.md
 * - 新システム開発/初期診断_苦手分野判定と同率順位決定_20261014.md
 * - 新システム開発/src/learning-priority.js（頻出分野の決め方）
 */
import { SET_SIZE } from './engine.js';

/** 初期診断で1分野から出す問題の数（利用者の決定 2026-10-15：1分野2問）。 */
export const DIAG_PER_FIELD = 2;
/** 同じ分野でこの数だけ続けて間違えたら、確認問題へ移る。 */
export const WRONG_STREAK = 3;
/** 確認問題でこの数だけ続けて間違えたら、続け方を聞く。 */
export const CHECK_STREAK = 3;
/** 学習を始めたときに先に出す、期限の来た復習の最大数。そのあとは新しい問題2問ごとに1問。 */
export const REVIEW_AT_START = 5;
export const REVIEW_EVERY = 2;

/** 復習の間隔（日）の型。学習計画の見直し「復習頻度・タイミング」で選ぶ。 */
export const REVIEW_PATTERNS = {
  focus: { label: '集中型（当日・翌日・3日後・7日後）', days: [0, 1, 3, 7] },
  standard: { label: '標準型（翌日・3日後・7日後）', days: [1, 3, 7] },
  slow: { label: 'ゆっくり型（3日後・7日後・14日後）', days: [3, 7, 14] },
  ai: { label: 'AI調整型（翌日・3日後・7日後・14日後・30日後。正解が続くほど間隔をのばす）', days: [1, 3, 7, 14, 30] },
  // 「自分で間隔指定」で選べる型
  c1: { label: '当日・翌日・2日後・4日後', days: [0, 1, 2, 4] },
  c2: { label: '翌日・2日後・5日後・10日後', days: [1, 2, 5, 10] },
  c3: { label: '翌日・7日後・30日後', days: [1, 7, 30] },
  c4: { label: '7日ごと（7日後・14日後・21日後）', days: [7, 14, 21] },
};
export const CUSTOM_REVIEW = ['c1', 'c2', 'c3', 'c4'];

/** 分野ごとの、取り込み済みの公式過去問の数（免除で出さない問は呼び出し側で除いておく）。 */
export function fieldCounts(items, fieldIds) {
  const counts = Object.fromEntries(fieldIds.map((f) => [f, 0]));
  const seen = new Set();
  for (const { packet: p } of items) {
    if (seen.has(p.questionId) || !(p.fieldId in counts)) continue;
    seen.add(p.questionId);
    counts[p.fieldId] += 1;
  }
  return counts;
}

/** 取り込み済みの年度（新しい順）。 */
export function yearsOf(items) {
  return [...new Set(items.map((x) => x.packet.year))].sort((a, b) => b - a);
}

/**
 * 頻出分野の順番（learning-priority.js と同じ規則）。
 * 検証済みの分類が2分野以上にまたがるときだけ出題数の多い順。同数は公式の分野順。足りなければ公式の分野順。
 */
export function frequencyOrder(fieldIds, counts) {
  const covered = fieldIds.filter((f) => counts[f] > 0).length;
  const total = fieldIds.reduce((n, f) => n + (counts[f] ?? 0), 0);
  if (total > 0 && covered >= 2) {
    const order = fieldIds.map((f, i) => ({ f, i })).sort((a, b) => counts[b.f] - counts[a.f] || a.i - b.i).map((x) => x.f);
    return { basis: 'verified_frequency', order, total };
  }
  return { basis: 'official_overview_order', order: [...fieldIds], total };
}

/** 診断の分野別集計。n=有効回答数、w=誤答数、rate=誤答率（n=0 は評価不能で null）。 */
export function diagnosisRows(fieldIds, answers, counts = {}) {
  return fieldIds.map((f, i) => {
    const mine = answers.filter((a) => a.fieldId === f);
    const n = mine.length;
    const w = mine.filter((a) => a.result === 'wrong').length;
    return { fieldId: f, index: i, n, w, rate: n ? w / n : null, count: counts[f] ?? 0 };
  });
}

/**
 * 初期診断から学習順を決める（初期診断_苦手分野判定と同率順位決定_20261014.md）。
 * 1. 誤答率の高い順（誤答数ではなく率で比べる）
 * 2. 同率なら、検証済みの出題数の多い順
 * 3. なお同率なら、公式の分野順
 * 回答のない分野は「未診断」として順位を付けず、最後に公式の分野順で置く。
 * 確信度（迷った／勘）は「勘」と言われたときしか記録できず比べられないため、順位には使わない。
 */
export function diagnosisOrder(fieldIds, answers, counts = {}) {
  const rows = diagnosisRows(fieldIds, answers, counts);
  const done = rows.filter((r) => r.n > 0).sort((a, b) => b.rate - a.rate || b.count - a.count || a.index - b.index);
  const undiagnosed = rows.filter((r) => r.n === 0);
  const answered = done.reduce((n, r) => n + r.n, 0);
  const wrong = done.reduce((n, r) => n + r.w, 0);
  const ties = [];
  for (const r of done) {
    const same = done.filter((x) => x.rate === r.rate);
    if (same.length > 1 && !ties.some((t) => t.includes(r.fieldId))) ties.push(same.map((x) => x.fieldId));
  }
  return {
    order: [...done, ...undiagnosed].map((r) => r.fieldId),
    rows,
    undiagnosed: undiagnosed.map((r) => r.fieldId),
    ties,
    allWrong: answered > 0 && wrong === answered,
    allRight: answered > 0 && wrong === 0,
  };
}

/** 学習計画の分野の順番と、その根拠。 */
export function planOrder(result, fieldIds, counts) {
  const freq = frequencyOrder(fieldIds, counts);
  let order = freq.order;
  let basis = freq.basis;
  const diag = result.diag;
  if (diag?.status === 'done' && result.priority !== 'frequency' && diag.answers.length) {
    order = diagnosisOrder(fieldIds, diag.answers, counts).order;
    basis = 'diagnosis';
  }
  if (result.userTop && order.includes(result.userTop)) {
    order = [result.userTop, ...order.filter((f) => f !== result.userTop)];
  }
  return { order, basis, frequency: freq };
}

/** 分野ごとの成績（初期診断と実践問題の有効な回答）。 */
export function fieldStats(history) {
  const out = {};
  for (const h of Object.values(history)) {
    if (!h.fieldId) continue;
    const s = (out[h.fieldId] ??= { n: 0, w: 0 });
    s.n += 1;
    if (h.result === 'wrong') s.w += 1;
  }
  return out;
}

/**
 * 3問セットが終わったときに、次に学ぶ分野を選ぶ。
 * 計画の順位が高い（苦手・頻出）ほど、また正答率が低いほど多く出題する。
 * 重み＝（2×分野数−順位）÷分野数（1位が2、最下位が1に近い）×（0.5＋誤答率の推定値）、点数＝重み÷（1＋その分野で始めたセット数）。
 * 点数の高い分野。同点は計画の順。下位の分野も出題が減るだけで、出なくなることはない。
 */
export function chooseField({ order, stats = {}, sets = {}, candidates }) {
  const F = order.length;
  let best = null;
  order.forEach((f, r) => {
    if (!candidates.includes(f)) return;
    const s = stats[f] ?? { n: 0, w: 0 };
    const err = (s.w + 1) / (s.n + 2);
    const score = (((2 * F - r) / F) * (0.5 + err)) / (1 + (sets[f] ?? 0));
    if (!best || score > best.score) best = { f, score };
  });
  return best?.f ?? null;
}

/** まだ解いていない問（引継ぎで止めた問は除く）。 */
function freshIn(state, items, fieldId, exclude = new Set()) {
  const withheld = new Set([...(state.withheld ?? []), ...(state.skipped ?? [])].map((w) => w.questionId));
  return items.filter((x) => x.packet.fieldId === fieldId && !state.history[x.packet.questionId] && !withheld.has(x.packet.questionId) && !exclude.has(x.packet.questionId));
}

/**
 * 分野の中で次に出す問。複数の年度にまたがるように、その分野でこれまでに解いた数が少ない年度を先にする。
 * 同じなら新しい年度、問番号の小さい順。
 */
export function pickInField(state, items, fieldId, exclude) {
  const fresh = freshIn(state, items, fieldId, exclude);
  if (!fresh.length) return null;
  const used = {};
  for (const h of Object.values(state.history)) if (h.fieldId === fieldId && h.source?.year) used[h.source.year] = (used[h.source.year] ?? 0) + 1;
  if (state.current?.fieldId === fieldId && state.current.source?.year && !state.history[state.current.questionId]) {
    used[state.current.source.year] = (used[state.current.source.year] ?? 0) + 1;
  }
  fresh.sort((a, b) => (used[a.packet.year] ?? 0) - (used[b.packet.year] ?? 0) || b.packet.year - a.packet.year || a.packet.questionNumber - b.packet.questionNumber);
  return fresh[0];
}

/** 未出題の問がある分野。 */
export function fieldsWithQuestions(state, items, fieldIds) {
  return fieldIds.filter((f) => freshIn(state, items, f).length > 0);
}

/** 期限の来た復習の問（このセッションで復習済みの問は除く）。 */
export function dueReview(state, items, today, reviewed = []) {
  const done = new Set(reviewed);
  const byId = new Map(items.map((x) => [x.packet.questionId, x]));
  for (const r of selectAllDue(state, today)) {
    if (done.has(r.unitId)) continue;
    const hit = byId.get(r.unitId);
    if (hit) return hit;
  }
  return null;
}

function selectAllDue(state, today) {
  return Object.values(state.review)
    .filter((x) => !x.exemptStopped && x.dueDate && x.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.unitId.localeCompare(b.unitId));
}

/** 復習を今出すか（学習の最初は最大5問、そのあとは新しい問題2問ごとに1問）。 */
export function reviewTurn(session) {
  if ((session.newCount ?? 0) === 0) return (session.reviewCount ?? 0) < REVIEW_AT_START;
  return (session.sinceReview ?? 0) >= REVIEW_EVERY;
}

export { SET_SIZE };
