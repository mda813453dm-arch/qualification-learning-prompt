/**
 * 学習の開始・終了の時刻と、終了ログ（master_prompt H01）・引継ぎデータ（H02）。
 * 時刻はAIに推測させず、エンジンが取る。累計学習時間は引継ぎID（学習者ごと）に保存し、別のAIアプリでも同じ値を使う。
 * 文の形はエンジンが決め、AIは学習の中身（領域・結果・弱点など）を項目として渡すだけにする。
 */
const LID = /^[a-z2-9]{10}$/;
const MAX_TEXT = 300;
const MAX_LINES = 30;
const STUDY_TTL_S = 7 * 24 * 60 * 60;

export const studyKey = (id) => `study/${id}`;
export const timeKey = (lid) => `lrntime/${lid}`;
// 引継ぎIDごとの、最後に始めた学習（AIが studyId を忘れて引継ぎIDで終了を呼んでも終われるように）
export const lastStudyKey = (lid) => `lrnstudy/${lid}`;
export const validLearnerId = (v) => (typeof v === 'string' && LID.test(v.trim()) ? v.trim() : null);

/** JSTの「YYYY-MM-DD」と「HH:MM」。 */
export function jst(now) {
  const iso = new Date(now + 9 * 60 * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function formatTotal(min) {
  const h = Math.floor(min / 60);
  return h ? `${h}時間${min % 60}分` : `${min}分`;
}

const clean = (v) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_TEXT) : '');
/** 文字列か文字列の配列を、箇条書きの行にする。空なら fallback の1行。 */
function lines(v, fallback = 'なし') {
  const arr = (Array.isArray(v) ? v : [v]).map(clean).filter(Boolean).slice(0, MAX_LINES);
  return (arr.length ? arr : [fallback]).map((x) => `・${x}`);
}
const one = (v, fallback = '未確認') => clean(v) || fallback;
const n = (v) => (Number.isInteger(v) && v >= 0 && v < 100000 ? v : 0);

// 年度だけでは同じ問番号の午前・午後を区別できない。エンジンが保存した区分を用いる。
const GENERIC_SECTIONS = new Set(['', 'main', '年度共通', '本試験', 'default']);
export function sourceQuestionLabel(source = {}, questionId = '') {
  const pieces = String(questionId).split(':');
  const year = source?.year ?? (pieces.length >= 4 ? Number(pieces[1]) : null);
  const number = source?.number ?? (pieces.length >= 4 ? Number(pieces[3]) : null);
  const section = String(source?.section ?? (pieces.length >= 4 ? pieces[2] : '')).trim();
  const period = Number.isInteger(Number(year)) && Number(year) >= 1900 ? `${year}年度` : '年度未確認';
  const part = !GENERIC_SECTIONS.has(section) ? ` ${section}` : '';
  return `${period}${part} 問${Number.isInteger(Number(number)) && Number(number) > 0 ? number : '?'}`;
}

/** 学習ログの出題・採点履歴はAIの自由文ではなく、保存済みの問題ID・年度・区分から作る。 */
export function gradedQuestionContents(history = {}, startedAt = 0) {
  return Object.entries(history ?? {})
    .filter(([, h]) => Number.isFinite(h?.gradedAt) && h.gradedAt >= startedAt)
    .sort(([aId, a], [bId, b]) => a.gradedAt - b.gradedAt || aId.localeCompare(bId))
    .map(([id, h]) => `${sourceQuestionLabel(h.source, id)}：${h.result === 'wrong' ? '不正解' : h.result === 'recall_failure' ? '分からない（正答を確認）' : '正解'}`);
}


/** 学習の記録を作る（開始時刻はこの時点のエンジンの時刻）。 */
export function newStudy({ qualificationName, learnerId, now }) {
  return { qualificationName: one(qualificationName, '未確認'), learnerId, startedAt: now, endedAt: null, minutes: null };
}

/**
 * 終了：終了時刻・今回の時間・累計を確定し、H01とH02の全文を作る。
 * totalBefore は今回の学習を含まない累計。二度目の終了は最初の終了時刻と時間を使う（累計を二重に足さない）。
 */
export function finishStudy(study, totalBefore, input, now, engineHandoff = null) {
  const first = study.endedAt == null;
  const endedAt = first ? now : study.endedAt;
  const minutes = first ? Math.max(0, Math.round((endedAt - study.startedAt) / 60000)) : study.minutes;
  const total = totalBefore + minutes;
  const s = jst(study.startedAt);
  const e = jst(endedAt);
  const r = input.results ?? {};
  const p = input.progress ?? {};
  const correct = n(r.practiceCorrect) + n(r.checkCorrect);
  const wrong = n(r.practiceWrong) + n(r.checkWrong);
  const log = [
    '【今回の学習ログ】',
    `📚 学習開始｜${s.time}`,
    `🏁 学習終了｜${e.time}`,
    `⏱ 今回の学習時間：${minutes}分`,
    `📊 累計学習時間：${formatTotal(total)}`,
    '【今回の位置】',
    `・科目・領域：${one(input.area)}`,
    `・項目：${one(input.item)}`,
    `・今回の目的：${one(input.purpose)}`,
    '【学習した領域】',
    ...lines(input.studiedAreas, '記録なし'),
    '【主な学習内容】',
    ...lines(input.contents, '記録なし'),
    '【今回の結果】',
    `・採点確定回答${correct + wrong}問（正解${correct}問・不正解${wrong}問）／未回答・スキップ${n(r.skipped)}問`,
    `・内訳：実践問題${n(r.practiceCorrect) + n(r.practiceWrong)}問（正解${n(r.practiceCorrect)}問・不正解${n(r.practiceWrong)}問）／確認問題${n(r.checkCorrect) + n(r.checkWrong)}問（正解${n(r.checkCorrect)}問・不正解${n(r.checkWrong)}問）`,
    `・未回答・スキップ：${one(r.skippedDetail, 'なし')}`,
    `・採点保留・無効・公式の特別扱い：${one(r.pendingDetail, 'なし')}`,
    '【誤答・弱点】',
    ...lines(input.weaknesses, '記録なし'),
    '【復習対象】',
    ...lines(input.review, '記録なし'),
    '【全体の進捗】',
    `・学習済み：${one(p.done, 'なし')}`,
    `・学習中：${one(p.inProgress, 'なし')}`,
    `・未着手：${one(p.notStarted, 'なし')}`,
    `・要復習：${one(p.needReview, 'なし')}`,
    `・未確認：${one(p.unconfirmed, 'なし')}`,
    ...(clean(p.exempt) ? [`・免除により除外：${clean(p.exempt)}`] : []),
    '【次回優先】',
    ...lines(input.nextPriority, '記録なし'),
    '【次回の学習目的】',
    ...lines(input.nextPurpose, '記録なし'),
  ].join('\n');
  const q = input.qualification ?? {};
  const handoff = [
    '【学習引き継ぎデータ】',
    `作成日時：${e.date} ${e.time}`,
    `引継ぎID：${study.learnerId}`,
    '■1. 資格情報',
    `・資格名：${study.qualificationName}`,
    `・受験年度：${one(q.examYear)}`,
    `・試験日：${one(q.examDate)}`,
    `・免除：${one(q.exemption)}`,
    `・学習の段階：${one(q.stage)}`,
    `・進め方の設定：${one(q.settings)}`,
    '■2. 試験範囲と学習計画の状態',
    ...lines(input.plan, '未確認'),
    '■3. 累計学習時間',
    `・${formatTotal(total)}（引継ぎIDで記録。今回${minutes}分を含む）`,
    '■4. 学習済みの領域',
    ...lines(input.studiedAreas, '記録なし'),
    '■5. 正誤や弱点などの学習状況',
    `・今回：正解${correct}問・不正解${wrong}問・未回答${n(r.skipped)}問`,
    '・公式問題の履歴（年度・試験区分・問番号）：',
    ...lines(input.contents, '今回の出題記録なし'),
    ...lines(input.weaknesses, '弱点の記録なし'),
    ...(engineHandoff ? [`・エンジンの記録：${engineHandoff}`] : []),
    '■6. 復習対象',
    ...lines(input.review, 'なし'),
    '■7. 次回に優先して学習する内容',
    ...lines(input.nextPriority, '記録なし'),
    '■8. 未回答・スキップした問題の論点',
    ...lines(input.skippedTopics, 'なし'),
    '【引き継ぎデータ ここまで】',
  ].join('\n');
  return { study: { ...study, endedAt, minutes }, total, minutes, log, handoff, display: `${log}\n\n\`\`\`text\n${handoff}\n\`\`\`` };
}

export { STUDY_TTL_S };
