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

export function newState({ qualificationId, learnerId = null, plan = {}, now }) {
  if (!qualificationId) throw new Error('QUALIFICATION_REQUIRED');
  return {
    v: STATE_VERSION,
    qualificationId,
    learnerId, // 引継ぎID：学習者ごとの取り込み・保存に使う（無い古い記録は共有の取り込みを使う）
    createdAt: now,
    plan: { examDate: plan.examDate ?? null, fieldWeights: plan.fieldWeights ?? {} },
    history: {}, // questionId -> {result, selected, answeredAt, source}
    review: {}, // 論点ID（未分類なら問題ID） -> 復習の予定
    reviewPacing: { initialServed: 0, newAnswered: 0, sinceReview: 0 }, // 今回の学習の復習と実践の配分
    current: null, // 出題中の問（正答はここに控え、AIには渡さない）
    remediation: null, // 同一分野3連続誤答：AI作成確認問題に正解するまで新たな公式問題を禁止
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

/** 同じ分野から続けて出す問の数（仕様：同分野の過去問を連続で3問）。 */
export const SET_SIZE = 3;

/** 同じ分野で続けて間違えたら、確認問題へ移ることを勧める回数（仕様：3問連続不正解）。 */
export const WRONG_STREAK = 3;

/** 分野ごとの、取り込んだ過去問での出題数。 */
function fieldCountsOf(items) {
  const counts = {};
  const seen = new Set();
  for (const { packet: p } of items) {
    if (!p.fieldId || seen.has(p.questionId)) continue;
    seen.add(p.questionId);
    counts[p.fieldId] = (counts[p.fieldId] ?? 0) + 1;
  }
  return counts;
}

export const FIRST_YEARS = 3;

function recentYearsPending(job) {
  if (!job || job.state !== 'running' || !Array.isArray(job.sources)) return false;
  const recent = new Set([...new Set(job.sources.map((s) => s.year))].sort((a, b) => b - a).slice(0, FIRST_YEARS));
  return job.sources.some((s) => recent.has(s.year) && s.status === 'pending');
}

/**
 * 次の問を決める。出題中で未採点の問があれば、それをもう一度返す（別の問に差し替えない）。
 * 返り値 {status, question?, notice?}。status: question | waiting | finished
 */
export function pickNext(state, items, { today, now=null, job }) {
  if (state.remediation?.required) return { status: 'remediation', fieldId: state.remediation.fieldId };
  const withheld = new Set([...state.withheld.map((w) => w.questionId), ...(state.skipped ?? []).map((x) => x.questionId)]);
  const usable = items.filter((x) => !withheld.has(x.packet.questionId));
  const byId = new Map(usable.map((x) => [x.packet.questionId, x]));
  const byUnit = new Map();
  for(const x of usable){
    const key = typeof x.packet.reviewUnitId === 'string' && x.packet.reviewUnitId.trim()
      ? x.packet.reviewUnitId.trim() : x.packet.questionId;
    if(!byUnit.has(key))byUnit.set(key,[]);
    byUnit.get(key).push(x);
  }
  const oldPace = state.reviewPacing ?? { initialServed: 0, newAnswered: 0, sinceReview: 0 };
  // 再開操作が省略された互換経路でも、学習日が変わったら開始時の期限復習を優先する。
  const pace = oldPace.lastDate && today > oldPace.lastDate
    ? { initialServed: 0, newAnswered: 0, sinceReview: 0, lastDate: today } : oldPace;
  const initialReview = pace.newAnswered === 0 && pace.initialServed < 5;
  const due = selectDueReviews({ today, now, items: Object.values(state.review),
    sessionStart: initialReview, practiceSinceReview: pace.sinceReview });
  // 採点の応答に付けて先に控えた問（まだ利用者に見せていない）は、期限の来た復習があれば出し直す
  const unseenPrefetch = state.current?.prefetched && (due.items ?? []).some((r) => byUnit.has(r.unitId));
  if (state.current && !state.current.grade && !unseenPrefetch) {
    const same = items.find((x) => x.packet.questionId === state.current.questionId);
    if (same) return { status: 'question', item: same, kind: state.current.kind, repeated: true };
  }
  // 1) 期限の来た復習
  for (const r of due.items ?? []) {
    const variants = byUnit.get(r.unitId) ?? [];
    const alt = variants.find((x) => x.packet.questionId !== r.sourceQuestionId);
    const hit = alt ?? variants[0] ?? byId.get(r.unitId);
    if (hit) return { status: 'question', item: hit, kind: 'review' };
  }
  // 2) まだ解いていない問。仕様：同じ分野（fieldId）から3問続けて出す。
  //    続きの分野に未出題の問があればそこから、なければ新しい分野を選ぶ（分野の重みが大きい順、
  //    同じ重みならこれまでに解いた数が少ない分野、それも同じなら出題数の多い分野）。分野の中では年度の新しい順・問番号順（同じまとまりでは、まだ出していない年度を先に）。
  const fresh = usable.filter((x) => !state.history[x.packet.questionId] && x.packet.fieldId);
  // 同じ分野の3問を複数の年度から出せるよう、直近3年度の取り込みが済むまで新しい問は待つ（残りの年度は裏で続ける）
  if (fresh.length && recentYearsPending(job)) return { status: 'waiting' };
  if (fresh.length) {
    // 利用者が移りたいと言った分野は、その分野の問が残っている間はそこから出す（3問ずつのまとまりも続ける）
    if (state.focusField && (!state.set || state.set.fieldId !== state.focusField || state.set.count >= SET_SIZE)) {
      const inFocus = fresh.filter((x) => x.packet.fieldId === state.focusField);
      const next = inFocus.find((x) => !(state.set?.years ?? []).includes(x.packet.year)) ?? inFocus[0];
      if (next) return { status: 'question', item: next, kind: 'new' };
    }
    const set = state.set;
    if (set && set.count < SET_SIZE) {
      // 同じ分野の3問は、まだこのまとまりで出していない年度を先にする（1つの年度に偏らせない）
      const same = fresh.filter((x) => x.packet.fieldId === set.fieldId);
      const next = same.find((x) => !(set.years ?? []).includes(x.packet.year)) ?? same[0];
      if (next) return { status: 'question', item: next, kind: 'new' };
    }
    const solved = {};
    for (const h of Object.values(state.history)) if (h.fieldId) solved[h.fieldId] = (solved[h.fieldId] ?? 0) + 1;
    // 重み（学習計画の指定）→ これまでに解いた数が少ない分野 → 取り込んだ過去問での出題数が多い（頻出の）分野
    const counts = fieldCountsOf(usable);
    // 3問のまとまりを終えた分野は後に回し、学習計画の順に次の分野へ進む（全分野を一巡したら、また計画の順に戻る）
    const score = (x) => [-Math.floor((solved[x.packet.fieldId] ?? 0) / SET_SIZE), Number(state.plan.fieldWeights?.[x.packet.fieldId] ?? 0), -(solved[x.packet.fieldId] ?? 0), counts[x.packet.fieldId] ?? 0];
    const higher = (x, y) => { // x が y より先に出すべきなら true
      const a = score(x);
      const b = score(y);
      for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
      return false;
    };
    const best = fresh.reduce((a, b) => (higher(b, a) ? b : a));
    return { status: 'question', item: best, kind: 'new' };
  }
  if (job && job.state === 'running') return { status: 'waiting' };
  return { status: 'finished' };
}

/**
 * 出題の表示の全文：問題文 → 図（本文中のSVG）→ 選択肢。公式PDFの問題（renderPdfPages の display）と同じ形にそろえ、
 * AIはこれを一字一句そのまま出す。svgs は図ごとのSVGの文字（無い図は null。その図は画像のURLを示す）。
 */
/**
 * 本文に入れられない図：公式PDFから切り出した図を開くリンク。
 * ChatGPT は外部の画像（マークダウンの画像）をチャットに出さないので、タップで開くリンクにする（2026-10-17 実機）。
 */
export function figureImage(url, n = '') {
  return `▶ [図${n}を開く（公式PDFの図）](${url})`;
}

/** 本文に入れたSVGの図にも、公式PDFの図を開くリンクを添える（ChatGPT が図の白い背景を落とし、暗い画面で線が見えなくなることがある）。 */
export function figureSvg(svg, url, n = '') {
  return url ? `${svg}\n\n▶ 図${n}が見えにくいときは：[図${n}を開く（公式PDFの図）](${url})` : svg;
}

/**
 * ChatGPT（GPT）では、図の画像ファイルをアクションの応答に付け（openaiFileResponse）、ChatGPTが回答に添付として表示する。
 * その画像は回答の一番上に出るので、本文の図の位置には、そのことと、出ないときに開くリンクを書く（2026-10-17 利用者「チャット中に必ず図表を出して」）。
 */
export function figureAttached(url, n = '') {
  return `〔図${n}〕公式PDFから切り出した図${n}を、この回答に添付しています。もう一度見るときは「図をもう一度」と入力してください。\n▶ 図${n}が表示されないときは：[図${n}を開く（公式PDFの図）](${url})`;
}

export function questionDisplay(q, svgs, { attached = false } = {}) {
  // 本文に入れられない図は、リンクで開けるようにする（URLの直後に括弧を付けると、括弧までURLとして開かれてしまう）
  // 紙を画像にした年度（OCR）も、図は問題文と選択肢の間の図だけを切り出している（parser 0.6.2〜）
  const figs = q.figures.map((f, i) => {
    const n = q.figures.length > 1 ? i + 1 : '';
    if (attached) return figureAttached(f.url, n);
    return svgs[i] ? figureSvg(svgs[i], f.url, n) : figureImage(f.url, n);
  });
  const choices = q.choices.map((c, i) => `${i + 1}　${c}`).join('\n\n');
  return [q.stem, ...figs, choices].filter((v) => typeof v === 'string' && v.trim()).join('\n\n');
}

export const ANSWER_PROMPT = '番号で答えてください。勘で選んだときは「勘」と添えてください。飛ばすときは「スキップ」と入力してください。';

/** 出題の画面の全文：分野の変更 → 見出し → display → 問題PDF → 注意 → 答え方。AIはこれだけをそのまま出す。 */
export function questionScreen(q, display, { fieldName = null, fieldNotice = null } = {}) {
  const page = q.questionPdfPages?.[0];
  const link = q.questionPdfUrl ? `問題PDF：[公式の問題PDF${page ? `（${page}ページ）` : ''}](${q.questionPdfUrl}${page ? `#page=${page}` : ''})` : null;
  // 年に何回もある試験（FP：2024年5月・9月など）は、回の名前で見出しにする
  const when = /^\d{4}年\d{1,2}月/.test(q.section ?? '') ? q.section : `${q.year}年度`;
  const head = `■${when} 問${q.questionNumber}${q.kind === 'review' ? '（復習）' : q.kind === 'reinforce' ? '（補強）' : ''}`;
  return [
    fieldNotice ? `**${fieldNotice}**` : null,
    fieldName ? `📍${fieldName}\n${head}` : head,
    display,
    link,
    ...(q.notices ?? []),
    ANSWER_PROMPT,
  ].filter(Boolean).join('\n\n');
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
      url: `${figureBase}${item.keyParts.owner ? `/own/${encodeURIComponent(item.keyParts.owner)}` : ''}/${p.questionPdfSha256}/${encodeURIComponent(item.keyParts.parserVersion)}/${encodeURIComponent(f.file)}`,
      width: f.width,
      height: f.height,
      sha256: f.sha256,
      ...(f.svgFile ? { svgFile: f.svgFile } : {}),
    })),
    questionPdfUrl: p.questionPdfUrl,
    questionPdfPages: p.evidence?.questionPdfPages ?? [],
    notices,
  };
}

/** 出題した問を控える（正答・出典もここで固定する）。 */
/**
 * 利用者が出題する問や分野を指定したとき（「2025年度の問13」「問13」「令和7年 問13」「応用測量に移りたい」）。
 * 見つかれば {item, kind, fieldId?}（分野の指定なら fieldId を付ける）、無ければ null。
 * 問の年度を言わなければ、まだ答えていない年度の新しい方、それも無ければ最も新しい年度にする。
 * fields：分野の番号 → 分野名（資格台帳）。
 */
// 分野名でも番号でもない言葉（「方向角の問題」など）は、問題文と選択肢にその語を含む問題を探す（解いていない問題を先に）
const KEYWORD_STOP = /^(問題|過去問|出題|解説|次|別|新しい|他|もう|今|同じ|練習|復習|お願い|ください|して|したい|ほしい|欲しい)$/;
function findByKeyword(state, items, plain) {
  const words = [...new Set(plain.match(/[\u4e00-\u9fff]{2,}|[\u30a1-\u30fc]{2,}|[A-Za-z0-9]{2,}/g) ?? [])]
    .filter((w) => !KEYWORD_STOP.test(w))
    .map((w) => w.replace(/(の問題|問題|について|に関する|を出して|出して)$/, ''))
    .filter((w) => w.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const w of words) {
    const hits = items.filter((x) => !(state.skipped ?? []).some((k) => k.questionId === x.packet.questionId)
      && `${x.packet.stem ?? ''}${(x.packet.choices ?? []).join('')}`.normalize('NFKC').includes(w));
    if (!hits.length) continue;
    const item = hits.find((x) => !state.history[x.packet.questionId]) ?? hits[0];
    return { item, kind: state.history[item.packet.questionId] ? 'review' : 'new' };
  }
  return null;
}

export function findWanted(state, items, want, fields = {}) {
  const t = String(want ?? '').normalize('NFKC');
  const num = /問\s*(\d{1,3})/.exec(t)?.[1] ?? /^\s*(\d{1,3})\s*$/.exec(t)?.[1];
  if (!num) {
    const plain = t.replace(/\s/g, '');
    const fid = Object.keys(fields).find((k) => plain.includes(fields[k].replace(/\s/g, '')))
      ?? Object.keys(fields).find((k) => plain.length >= 2 && fields[k].includes(plain));
    if (!fid) return findByKeyword(state, items, plain);
    const inField = items.filter((x) => x.packet.fieldId === fid && !(state.skipped ?? []).some((k) => k.questionId === x.packet.questionId));
    if (!inField.length) return null;
    const item = inField.find((x) => !state.history[x.packet.questionId]) ?? inField[0];
    return { item, kind: state.history[item.packet.questionId] ? 'review' : 'new', fieldId: fid };
  }
  const reiwa = /令和\s*(\d{1,2})/.exec(t)?.[1];
  const year = reiwa ? 2018 + Number(reiwa) : Number(/(20\d{2})/.exec(t)?.[1] ?? 0) || null;
  const hits = items.filter((x) => x.packet.questionNumber === Number(num) && (!year || x.packet.year === year));
  if (!hits.length) return null;
  const item = hits.find((x) => !state.history[x.packet.questionId]) ?? hits[0];
  return { item, kind: state.history[item.packet.questionId] ? 'review' : 'new' };
}

/** 問題データの検証済み論点IDがある場合は同じ論点を1復習単位にまとめる。無ければ問題単位を維持し、分野全体を同じ論点と推測しない。 */
function reviewKeyOf(p){
  return typeof p.reviewUnitId === 'string' && p.reviewUnitId.trim()
    ? p.reviewUnitId.trim() : p.questionId;
}

export function pin(state, item, kind, now) {
  const p = item.packet;
  if (state.current && !state.current.grade && state.current.questionId === p.questionId) return state;
  // 新しい問は「同じ分野の3問」の何問目かを数える（復習の問は数えない）
  let set = state.set ?? null;
  if (kind === 'new') {
    set = set && set.fieldId === p.fieldId && set.count < SET_SIZE
      ? { fieldId: p.fieldId, count: set.count + 1, years: [...(set.years ?? []), p.year] }
      : { fieldId: p.fieldId, count: 1, years: [p.year] };
  }
  return {
    ...state,
    set,
    current: {
      questionId: p.questionId,
      reviewUnitId: reviewKeyOf(p),
      topicId: typeof p.topicId === 'string' ? p.topicId : (p.fieldId ?? 'unclassified'),
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
 * AIアプリが questionId を書き崩して送ったとき（「3」「2026年 問3」「q063-2026-3」など）に、出題中の問と同じかを見る。
 * 数字の並びが「（年度）…問番号」で出題中の問と合うときだけ同じとみなす（別の問の採点にはしない）。
 */
function sameQuestion(given, current) {
  if (typeof given !== 'string' || !given.trim()) return false;
  const [, year, , number] = current.split(':');
  const nums = given.normalize('NFKC').match(/\d+/g) ?? [];
  if (!nums.length || nums.at(-1) !== String(Number(number))) return false;
  const years = nums.slice(0, -1).filter((n) => n.length === 4 && !/^0/.test(n));
  return years.every((y) => y === year);
}

/**
 * 回答を採点する。confidence: 'sure'（自信あり・既定）| 'guess'（勘で当てた）
 * 返り値 {ok, state, grade} / {ok:false, reason}
 */
/** 学習開始時の最大5復習、その後は新しい問題2問ごとに1復習。採点確定時だけ進む。 */
function completedPace(state, kind, today) {
  const old = state.reviewPacing ?? { initialServed: 0, newAnswered: 0, sinceReview: 0 };
  const p = old.lastDate && today > old.lastDate
    ? { initialServed: 0, newAnswered: 0, sinceReview: 0 } : old;
  if (kind === 'review') return {
    initialServed: p.initialServed + (p.newAnswered === 0 ? 1 : 0),
    newAnswered: p.newAnswered, sinceReview: 0, lastDate: today,
  };
  if (kind === 'new') return {
    initialServed: p.initialServed, newAnswered: p.newAnswered + 1,
    sinceReview: p.sinceReview + 1, lastDate: today,
  };
  return { ...p, lastDate: today };
}

export function grade(state, { questionId, value, confidence = 'sure' }, { today, now, intervals, intervalsMinutes }) {
  const cur = state.current;
  if (!cur) return { ok: false, reason: 'NO_QUESTION_PRESENTED' };
  // 採点の応答で次の問を先に控えたあと、同じ回答がもう一度届いても（再送）、同じ結果を返す
  if (questionId !== cur.questionId && state.lastGrade?.questionId === questionId) return { ok: true, state, grade: { ...state.lastGrade, alreadyGraded: true } };
  if (questionId !== cur.questionId && !sameQuestion(questionId, cur.questionId)) return { ok: false, reason: 'QUESTION_BINDING_MISMATCH' };
  questionId = cur.questionId; // 書き崩した番号で届いても、記録は出題中の問の番号で残す
  if (cur.grade) return { ok: true, state, grade: { ...cur.grade, alreadyGraded: true } };
  // 「スキップ」：採点せず、成績にも数えず、次の問へ進む（今回の学習ではもう出さない）
  if (/^(skip|スキップ|ｽｷｯﾌﾟ)$/i.test(String(value ?? '').trim())) {
    const g = { questionId, skipped: true };
    return {
      ok: true,
      grade: g,
      state: {
        ...state,
        current: { ...cur, grade: g },
        lastGrade: g,
        reviewPacing: cur.kind === 'review' ? completedPace(state, cur.kind, today) : state.reviewPacing,
        skipped: [...(state.skipped ?? []).filter((x) => x.questionId !== questionId), { questionId, at: now ?? null, year: cur.source?.year ?? null, questionNumber: cur.source?.number ?? null }],
      },
    };
  }
  // 「分からない」：想起できなかった問（B15）。採点には数えず、正答を見せ、復習に登録する（同じ分野の連続誤答にも数えない）
  if (/^(分からない|わからない|分かりません|わかりません|dontknow)$/i.test(String(value ?? '').trim())) {
    const g = { questionId, dontKnow: true, result: 'recall_failure', correctAnswer: cur.correctAnswer, answerPdfUrl: cur.source.answerPdfUrl };
    const reviewId = cur.reviewUnitId || questionId;
    const upd = updateReviewItem(state.review[reviewId] ?? null, { unitId: reviewId, topicId: cur.topicId ?? cur.fieldId ?? 'unclassified', sourceQuestionId: questionId, qualificationId: state.qualificationId, result: 'recall_failure', source: 'wrong' }, { today, now, examDate: state.plan.examDate, intervals, intervalsMinutes });
    const review = { ...state.review };
    if (upd.status === 'updated') review[reviewId] = upd.item;
    const history = { ...state.history, [questionId]: { result: 'recall_failure', selected: null, answeredAt: today, gradedAt: now ?? null, source: cur.source, fieldId: cur.fieldId ?? null, kind: cur.kind } };
    return { ok: true, grade: g, state: { ...state, review, history, current: { ...cur, grade: g }, lastGrade: g, reviewPacing: completedPace(state, cur.kind, today) } };
  }
  const n = Number(String(value ?? '').trim());
  if (!Number.isInteger(n) || n < 1 || n > cur.choiceCount) return { ok: false, reason: 'ANSWER_INPUT_INVALID' };
  const correct = n === cur.correctAnswer;
  const result = !correct ? 'wrong' : confidence === 'guess' ? 'guess_correct' : 'confident_correct';
  const g = { questionId, selected: n, correctAnswer: cur.correctAnswer, correct, result, answerPdfUrl: cur.source.answerPdfUrl };
  const reviewId = cur.reviewUnitId || questionId;
  const upd = updateReviewItem(state.review[reviewId] ?? null, {
    unitId: reviewId,
    topicId: cur.topicId ?? cur.fieldId ?? 'unclassified',
    sourceQuestionId: questionId,
    qualificationId: state.qualificationId,
    result,
    source: correct ? 'self_report' : 'wrong',
  }, { today, now, examDate: state.plan.examDate, intervals, intervalsMinutes });
  const review = { ...state.review };
  if (upd.status === 'updated') review[reviewId] = upd.item;
  // 同じ分野で続けて間違えた数（正解で0に戻る）。3に届いたら確認問題を勧め、数え直す
  const fid = cur.fieldId ?? null;
  const prev = state.wrongStreak && state.wrongStreak.fieldId === fid ? state.wrongStreak.count : 0;
  const streak = result === 'wrong' ? prev + 1 : 0;
  // 3問連続不正解が成立した時点でだけAI確認問題へ強制遷移する。
  const checkSuggested = result === 'wrong' && !!fid && streak >= WRONG_STREAK;
  return {
    ok: true,
    grade: { ...g, wrongStreak: streak, checkSuggested },
    state: {
      ...state,
      wrongStreak: { fieldId: fid, count: checkSuggested ? WRONG_STREAK : streak },
      remediation: checkSuggested ? { required: true, fieldId: fid, triggerQuestionId: questionId } : (state.remediation ?? null),
      reinforce: null,
      // 3問連続で間違えたら、確認問題のあとも同じ分野に戻る（次の3問を同じ分野から出す）
      set: checkSuggested && fid ? { fieldId: fid, count: 0 } : state.set,
      current: { ...cur, grade: g },
      lastGrade: g,
      reviewPacing: completedPace(state, cur.kind, today),
      history: { ...state.history, [questionId]: { result, selected: n, answeredAt: today, gradedAt: now ?? null, source: cur.source, fieldId: cur.fieldId ?? null, kind: cur.kind } },
      review,
    },
  };
}

/** 日本時間の今日（YYYY-MM-DD）。 */
export function jstToday(now) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
