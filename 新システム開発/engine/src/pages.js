/**
 * プロンプトだけで使う方式（2026年10月15日 方針変更）。
 *
 * 利用者は短いプロンプトを貼るだけ。GPT の作成やコネクタの登録はしない。
 * AIアプリが標準で持つ「Webページを開く」機能でこのページを開き、書かれた内容を表示し、
 * 利用者の答えに合うリンクを開く。進め方・出題・採点・記録はすべてこのプログラムが決める。
 *
 * - AIアプリは「会話に出てきたURL」しか開けないことがある（Claude の仕様）。そこで、次に開けるURLを毎回ページに全部書く。
 * - AIアプリは同じURLの結果を使い回すことがある。そこで、状態が変わる操作のURLには通し番号を入れて毎回別のURLにする。
 * - トークンや鍵に見えるURLは開けないことがある。引継ぎIDは短い英数字にする。
 *
 * 学習の進め方（ChatGPT開発版の学習進行・計画立案仕様、2026-10-15 反映）：
 * 資格名 → 試験概要 → 免除（公式に制度がある資格だけ）→ 学習の段階 → 個人別の学習計画 → 開始の承認
 * → 初期診断（受けるかを聞く）→ 苦手分野の判定 → 計画の調整と再承認 → 学習（解説／確認問題／実践問題・復習）。
 * 順番・判定は study.js、出題・採点は engine.js が決める。AIは表示と解説だけを担う。
 *
 * 学習記録（総合仕様書 13・14章）：lrn/<引継ぎID> に期限なしで保存する。
 * - fixed：システムが持つ固定情報（資格・版）。利用者からは変えられない。公式の正答は出題時に engine.current に控え、利用者からは変えられない。
 * - result：学習結果と設定（段階・免除・計画の設定・診断・連続誤答・学習時間）。利用者が訂正できる。
 * - engine：エンジンの状態（回答の履歴・復習予定・出題中の問）。履歴と復習予定は、利用者の訂正で外せる。
 * 問題本文・会話・個人情報は保存しない。
 */
import { availablePackets, grade, jstToday, newState, pin, present } from './engine.js';
import { startJob } from './ingest.js';
import { discover } from './discover.js';
import { CATALOG, LEVELS } from './catalog.js';
import { FIXED_UI_CHOICES } from './fixed-ui.js';
import {
  CHECK_STREAK, CUSTOM_REVIEW, DIAG_PER_FIELD, REVIEW_AT_START, REVIEW_EVERY, REVIEW_PATTERNS, SET_SIZE, WRONG_STREAK,
  chooseField, diagnosisOrder, dueReview, fieldCounts, fieldStats, fieldsWithQuestions, pickInField, planOrder, reviewTurn, yearsOf,
} from './study.js';

export const SYSTEM_ID = 'qlp';
export const SCHEMA_VERSION = 1;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const LID = /^[a-z2-9]{10}$/;
const PAGE_BUDGET_MS = 0;
const FIX_LIST = 10;

const lrnKey = (lid) => `lrn/${lid}`;
/** 学習者ごとの取り込みジョブの名前。 */
const jobId = (rec) => `${rec.fixed.qualificationId}~${rec.fixed.lid}`;

export function newLearnerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const HEAD = [
  '【AIへの指示】これは資格学習エンジンの画面です。',
  '・「表示」の内容は、言い換えたり省いたりせずに利用者へ見せてください。番号付きの選択肢は、番号・文言・順番をそのまま表示してください。',
  '・「（ここに…を表示）」と書かれた部分だけは、AIへの指示に従って書いた内容に置き換えて表示してください。',
  '・利用者の答えに合うURLを「次に開くURL」から選び、すぐ開いてください。URLを自分で作ったり書き換えたりしないでください。',
  '・問題・選択肢・正答・採点は、このエンジンが返したものだけを使ってください（AI作成の確認問題を除く）。',
  '・利用者が「終わる」「終了」「今日はここまで」などと言ったら、「学習を終える」のURLを開いてください。',
];

const END_NOTICE = [
  '⚠️【重要：学習終了時は必ず『終わる』と入力してください】',
  '『終わる』等の終了入力がない場合、学習終了時刻を確定できず、正確な学習時間を計測できません。また、終了時の引継ぎデータを確定・出力できないため、次回の正確な再開ができない場合があります。',
  '学習を終えるときは、チャットを閉じる前に必ず『終わる』と入力してください。',
];

/**
 * システムで公式の過去問を用意できないとき（取得失敗・未対応の資格）に、AIが代わりに行うこと（利用者の指示 2026-10-15）。
 * 利用者が過去問を使いたいときは、公式の過去問掲載ページのリンクを示して、PDFの取得と添付を促す。
 */
function fallbackAi(pastExamPage) {
  return [
    'システムでは公式の過去問を用意できませんでした。ここからはAIが作成した問題で練習を続けてください。',
    'AIが作成した問題には、毎回「AI作成問題（公式の過去問ではありません）」と書き、正答・採点もAIの判断であることを明記してください。',
    pastExamPage
      ? `利用者が公式の過去問を使いたいときは、公式の過去問掲載ページ（${pastExamPage}）のリンクを示し、そこから問題と正答のPDFを取得して、このチャットに添付するよう促してください。`
      : '利用者が公式の過去問を使いたいときは、試験実施団体の公式サイトで過去問の掲載ページを探し、見つかればそのリンクを示して、問題と正答のPDFを取得してこのチャットに添付するよう促してください。公式の掲載ページが見つからないときは、そのことを伝えてください。公式以外のサイトは示さないでください。',
    'PDFが添付されたら、その問題を書き換えずに表示し、同じPDFの正答で採点してください。正答が確認できない問題は採点しないでください。AIが読み取るため、読み違いがありうることを伝えてください。',
  ];
}

/** 画面の部品 {ai, show, links} をつなげる（同じラベルのリンクは先のものを残す）。 */
function compose(...parts) {
  const out = { ai: [], show: [], links: [] };
  for (const p of parts) {
    if (!p) continue;
    out.ai.push(...(p.ai ?? []));
    if (p.show?.length) {
      if (out.show.length && out.show[out.show.length - 1] !== '') out.show.push('');
      out.show.push(...p.show);
    }
    for (const l of p.links ?? []) if (!out.links.some(([label]) => label === l[0])) out.links.push(l);
  }
  return out;
}

function page({ show = [], ai = [], links = [] }) {
  const out = [...HEAD, ...ai.map((x) => `・${x}`), '', '【表示】', ...show];
  if (links.length) {
    out.push('', '【次に開くURL】');
    for (const [label, url] of links) out.push(`・${label}：${url}`);
  }
  return new Response(`${out.join('\n')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

/** 固定UI（新システム開発/src/fixed-ui-choices.js）をそのまま表示する。 */
function fixedUi(id) {
  const s = FIXED_UI_CHOICES[id];
  return [s.prompt, ...s.choices.map((c, i) => `${i + 1}. ${c}`), s.answerInstruction];
}

const load = (env, lid) => env.STORE.get(lrnKey(lid), 'json');

async function save(env, rec, now) {
  rec.result.updatedAt = now;
  await env.STORE.put(lrnKey(rec.fixed.lid), JSON.stringify(rec));
}

/** 画面を出すたびに番号を進める（同じURLの使い回しを防ぎ、古い画面のリンクを見分ける）。 */
function bump(rec) {
  rec.tick = (rec.tick ?? 0) + 1;
  return rec.tick;
}

function newRecord(lid, slug, now) {
  const c = CATALOG[slug];
  return {
    fixed: { systemId: SYSTEM_ID, schemaVersion: SCHEMA_VERSION, lid, slug, qualificationId: c.qualificationId, createdAt: now },
    result: { step: c.exemption ? 'exemption' : 'level', exempt: c.exemption ? null : false, level: null, wrongStreaks: {}, excluded: [], updatedAt: now },
    engine: newState({ qualificationId: c.qualificationId, now }),
    tick: 0,
    qn: 0,
  };
}

/** 学習結果と設定の既定値（前の版で作った記録にも足りない項目を補う）。 */
function R(rec) {
  const r = rec.result;
  r.wrongStreaks ??= {};
  r.excluded ??= [];
  r.fieldModes ??= {};
  r.fieldDone ??= {};
  r.fieldSets ??= {};
  r.held ??= [];
  r.chains ??= {};
  r.checkLog ??= [];
  r.method ??= 'balance';
  r.defaultMode ??= null;
  r.reviewPattern ??= 'ai';
  r.explainPref ??= null;
  r.priority ??= null;
  r.userTop ??= null;
  r.totalMinutes ??= 0;
  r.diag ??= null;
  r.pending ??= null;
  r.remediate ??= null;
  return r;
}

const url = (base, rec, ...rest) => [`${base}/p/${rec.fixed.lid}`, ...rest].join('/');
const resumeLine = (base, rec) => `引継ぎID：${rec.fixed.lid}（学習を終えるときに、次回貼る文を表示します）`;
const fieldIds = (rec) => Object.keys(CATALOG[rec.fixed.slug].fields ?? {});
const fieldName = (rec, f) => CATALOG[rec.fixed.slug].fields?.[f] ?? '分類なし';
const hhmm = (now) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
const intervalsOf = (r) => (REVIEW_PATTERNS[r.reviewPattern] ?? REVIEW_PATTERNS.ai).days;
const learnLinks = (ctx) => [['学習メニュー', url(ctx.base, ctx.rec, 'menu', ctx.t)], ['学習を終える', url(ctx.base, ctx.rec, 'end', ctx.t)]];

/** 次回まるごと貼るだけで続きから始められる、その人専用の文。 */
function personalPrompt(base, rec) {
  return [
    '次回は、下の文をまるごとAIのチャットに貼ってください。続きから始められます。',
    '----',
    '資格試験の勉強の続きをしたいです。',
    '次のURLのページを開き、そこに書かれている指示に従って進めてください。ページを開けなかったときは、そのことを私に伝えてください。',
    `${base}/p/${rec.fixed.lid}`,
    '----',
  ];
}

function chooseQualification(base, lid, lead = []) {
  return page({
    ai: [
      '利用者に、学びたい資格の名前を自由に入力してもらってください（選択肢の一覧は見せないでください）。',
      '入力された資格名が「次に開くURL」のどれかの資格（［呼び方］を含む）と同じ資格なら、そのURLを開いてください。略称や表記の違いは同じ資格として扱ってください。',
      'どれにも当たらないときは「上にない資格」のURLを開いてください。',
    ],
    show: [...lead, '資格学習を始めます。学びたい資格の名前を入力してください。'],
    links: [
      ...Object.entries(CATALOG).map(([slug, c]) => [`${c.name}［呼び方：${(c.aliases ?? []).join('、')}］`, `${base}/p/${lid}/go/${slug}`]),
      ['上にない資格', `${base}/p/${lid}/other`],
    ],
  });
}

function stats(rec, now) {
  const h = Object.values(rec.engine.history);
  const today = jstToday(now);
  return {
    answered: h.length,
    correct: h.filter((x) => x.result !== 'wrong').length,
    due: Object.values(rec.engine.review).filter((r) => r.dueDate && r.dueDate <= today).length,
    reviews: Object.keys(rec.engine.review).length,
  };
}

const label = (h) => `${h.source.year}年度 問${h.source.number}`;

function weakList(rec) {
  return Object.entries(rec.engine.review)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([qid, r]) => ({ qid, r, h: rec.engine.history[qid] }))
    .filter((x) => x.h);
}

/** 取り込み済みの公式過去問（免除で出さない問を除く）。1回の画面で1度だけ読む。 */
async function loadItems(ctx) {
  if (ctx.loaded) return ctx.loaded;
  const { env, rec, now, advance, kick } = ctx;
  const c = CATALOG[rec.fixed.slug];
  // 画面の表示では分解を待たない（1件に数分かかり、AIアプリのページ取得が時間切れになるため）。
  // 取り込みは裏で進め、ここでは進み具合を読むだけにする
  const job = await advance(env, jobId(rec), now, PAGE_BUDGET_MS);
  if (job?.state === 'running' && kick) await kick(jobId(rec));
  const skip = new Set(rec.result.exempt && c.exemption ? c.exemption.numbers : []);
  const items = (await availablePackets(env.STORE, job, now)).filter((x) => !skip.has(x.packet.questionNumber));
  ctx.loaded = { job, items };
  return ctx.loaded;
}

function startSession(r, labelText) {
  r.session = { active: true, label: labelText, startedAt: null, startShown: false, answered: 0, correct: 0, newCount: 0, reviewCount: 0, sinceReview: 0, reviewed: [], fields: {} };
  r.held = [];
}

/** 学習時間へ入る最初の学習内容の直前に「📘 学習開始」と終了の注意を出し、開始時刻を記録する。 */
function withStart(ctx, kind, parts) {
  const s = R(ctx.rec).session;
  if (!s?.active || s.startShown) return parts;
  s.startShown = true;
  s.startedAt = ctx.now;
  return compose({ show: [`📘 ${s.label}`, `開始時刻：${hhmm(ctx.now)}（日本時間）`, `開始内容：${kind}`, '', ...END_NOTICE] }, parts);
}

function setPending(ctx, p) {
  ctx.rec.result.pending = { ...p, token: ctx.t };
  return ctx.rec.result.pending;
}

// ---------------------------------------------------------------- 学習計画

const METHODS = {
  explain: '解説重視（各分野で 解説→確認問題→実践問題）',
  check: '確認問題重視（各分野で 確認問題→実践問題）',
  practice: '実践問題重視（各分野で公式の過去問から）',
  balance: '分野ごとに「解説あり／確認問題から／実践問題から」を選べます',
  ask: '分野ごとに、その都度進め方を選びます',
};
const METHOD_KEYS = ['explain', 'check', 'practice', 'balance', 'ask'];
const MODE_OF = { explain: 1, check: 2, practice: 3 };
const MODES = { 1: '解説あり（解説→確認問題→実践問題）', 2: '確認問題から（解説なし）', 3: '実践問題から（解説も確認問題もなし）' };

function planLines(rec, items) {
  const r = R(rec);
  const c = CATALOG[rec.fixed.slug];
  const ids = fieldIds(rec);
  const counts = fieldCounts(items, ids);
  const { order, basis, frequency } = planOrder(r, ids, counts);
  const years = yearsOf(items);
  const range = years.length > 1 ? `${years[years.length - 1]}〜${years[0]}年度` : `${years[0]}年度`;
  const d = r.diag?.status === 'done' ? diagnosisOrder(ids, r.diag.answers, counts) : null;
  const basisText = basis === 'diagnosis'
    ? '初期診断の結果。誤答率の高い順で、同じ率なら出題数の多い順、次に公式の分野順'
    : basis === 'verified_frequency'
      ? `公式の過去問${frequency.total}問（取り込み済みの${range}）の分野別出題数の多い順`
      : '公式の試験概要の分野順（過去問の取り込みが進むと、出題数の多い順に並べ直します）';
  const tag = (f) => {
    const parts = [];
    if (counts[f]) parts.push(`出題${counts[f]}問`);
    const row = d?.rows.find((x) => x.fieldId === f);
    if (row?.n) parts.push(`診断 誤答${row.w}/${row.n}問`);
    return parts.length ? `（${parts.join('・')}）` : '';
  };
  const first = order[0];
  const reason = r.userTop === first
    ? 'ご指定の分野です'
    : basis === 'diagnosis'
      ? d?.allRight ? '診断で誤答がなかったため、出題数の多い分野から始めます' : '初期診断で誤答率が最も高い分野です'
      : basis === 'verified_frequency' ? '過去問で最も多く出題されている分野です' : '公式の分野順の最初の分野です';
  const levelMode = LEVELS[r.level]?.mode;
  const method = r.method === 'balance' && levelMode ? `${METHODS.balance}（学習の段階「${LEVELS[r.level].label}」のおすすめ：${MODES[levelMode]}）` : METHODS[r.method];
  const diagLine = r.diag?.status === 'done'
    ? r.priority === 'frequency' ? '・初期診断：実施済み。今は頻出分野を優先する設定です。' : `・初期診断：実施済み（${r.diag.answers.length}問）。結果を分野の優先順位に反映しています（暫定評価）。`
    : `・初期診断：学習を開始したあと、各分野${DIAG_PER_FIELD}問（全${ids.length * DIAG_PER_FIELD}問）の診断で苦手分野を確かめられます（おすすめ）。`;
  const s = stats(rec, Date.now());
  return [
    `【学習計画】${c.name}`,
    '・試験日：（ここに試験日を表示）',
    `・学習の段階：${LEVELS[r.level]?.label ?? '未設定'}`,
    `・免除：${c.exemption ? (r.exempt ? `利用する（${c.exemption.label}。該当する問題は出題しません）` : '利用しない') : '制度なし'}`,
    `・分野の優先順位（根拠：${basisText}${r.userTop ? '。最優先の分野はご指定どおり' : ''}）`,
    ...order.map((f, i) => `　${i + 1}. ${fieldName(rec, f)}${tag(f)}`),
    `・最初に学ぶ分野：${fieldName(rec, first)}（${reason}）`,
    `・進め方：${method}`,
    `・公式の過去問：同じ分野から${SET_SIZE}問ずつ、複数の年度にまたがって出題し、エンジンが公式の正答で採点します。苦手な分野・頻出の分野ほど多く出題します。`,
    diagLine,
    `・確認問題：同じ分野で${WRONG_STREAK}問続けて間違えたら、確認問題で基本を補強してから戻ります。`,
    `・復習：${(REVIEW_PATTERNS[r.reviewPattern] ?? REVIEW_PATTERNS.ai).label}。期限が来た問題を、学習の最初に最大${REVIEW_AT_START}問、その後は新しい問題${REVIEW_EVERY}問ごとに1問出します（アプリを閉じている間の自動通知はありません）。`,
    ...(s.answered || r.totalMinutes ? [`・これまで：${s.answered}問解答、うち正解${s.correct}問。累計学習時間：${r.totalMinutes}分`] : []),
  ];
}

const PLAN_AI = (rec) => `「（ここに試験日を表示）」の部分には、公式サイト（${CATALOG[rec.fixed.slug].officialSite}）で確認できた次の試験日を書いてください。確認できなければ「未確認」と書いてください。`;

/** 学習計画の表示（PLAN_PREVIEW）。計画の作成・見直しのあとは必ずこれを出す。 */
async function planPreview(ctx, lead = []) {
  const { items } = await loadItems(ctx);
  const { rec, base, t } = ctx;
  return compose({
    ai: [PLAN_AI(rec)],
    show: [...lead, ...(lead.length ? [''] : []), ...planLines(rec, items), '', 'この学習計画で開始しますか？', '1. この計画で開始する', '2. 学習計画を見直す', '番号で答えてください。'],
    links: [['1 この計画で開始する', url(base, rec, 'pv', t, 1)], ['2 学習計画を見直す', url(base, rec, 'pv', t, 2)]],
  }, R(rec).session?.active ? { links: learnLinks(ctx) } : null);
}

function confirmParts(ctx) {
  const { rec, base, t } = ctx;
  return {
    show: fixedUi('PLAN_START_CONFIRM'),
    links: [['1 学習を開始する', url(base, rec, 'st', t, 1)], ['2 今は学習しない', url(base, rec, 'st', t, 2)]],
  };
}

function editMenuParts(ctx, lead = []) {
  const { rec, base, t } = ctx;
  const labels = FIXED_UI_CHOICES.PLAN_EDIT_MENU.choices;
  return { show: [...lead, ...fixedUi('PLAN_EDIT_MENU')], links: labels.map((l, i) => [`${i + 1} ${l}`, url(base, rec, 'em', t, i + 1)]) };
}

function fieldsMenuParts(ctx) {
  const { rec, base, t } = ctx;
  const ch = ['頻出分野を優先する（おすすめ）', '診断問題で苦手分野を調べる', '優先する分野を自分で選ぶ', '戻る'];
  return {
    show: ['学習分野・優先順位を選んでください。', ...ch.map((c, i) => `${i + 1}. ${c}`), '番号で答えてください。'],
    links: ch.map((c, i) => [`${i + 1} ${c}`, url(base, rec, 'ef', t, i + 1)]),
  };
}

function fieldPickParts(ctx) {
  const { rec, base, t } = ctx;
  const ids = fieldIds(rec);
  return {
    show: ['最優先で学ぶ分野を選んでください。ほかの分野は今の順番のままです。', ...ids.map((f, i) => `${i + 1}. ${fieldName(rec, f)}`), '番号で答えてください。'],
    links: ids.map((f, i) => [`${i + 1} ${fieldName(rec, f)}`, url(base, rec, 'fp', t, f)]),
  };
}

function methodParts(ctx) {
  const { rec, base, t } = ctx;
  const labels = FIXED_UI_CHOICES.PLAN_EDIT_METHOD.choices;
  return { show: fixedUi('PLAN_EDIT_METHOD'), links: labels.map((l, i) => [`${i + 1} ${l}`, url(base, rec, 'mt', t, i + 1)]) };
}

function reviewParts(ctx) {
  const { rec, base, t } = ctx;
  const labels = FIXED_UI_CHOICES.PLAN_EDIT_REVIEW.choices;
  return { show: fixedUi('PLAN_EDIT_REVIEW'), links: labels.map((l, i) => [`${i + 1} ${l}`, url(base, rec, 'rp', t, i + 1)]) };
}

/** 「自分で間隔指定」：入力の前に、できることを示す（復習タイミング入力の能力表示・受付ゲート）。 */
function reviewCustomParts(ctx) {
  const { rec, base, t } = ctx;
  return {
    ai: ['このAIアプリの画面からは、自由に入力した間隔をエンジンへ送れません。利用者が別の間隔を希望したときは、下の一覧のいちばん近いものを勧め、選んでもらってください。'],
    show: [
      'この画面で設定できるのは復習予定の記録です。指定時刻に自動通知・自動出題する機能は、現在のチャットでは利用できません。',
      '復習の間隔を選んでください。',
      ...CUSTOM_REVIEW.map((k, i) => `${i + 1}. ${REVIEW_PATTERNS[k].label}`),
      `${CUSTOM_REVIEW.length + 1}. 戻る`,
      '番号で答えてください。',
    ],
    links: [...CUSTOM_REVIEW.map((k, i) => [`${i + 1} ${REVIEW_PATTERNS[k].label}`, url(base, rec, 'rc', t, k)]), [`${CUSTOM_REVIEW.length + 1} 戻る`, url(base, rec, 'em', t, 3)]],
  };
}

function otherEditParts(ctx) {
  const { rec, base, t } = ctx;
  return {
    ai: ['利用者のご要望を聞いてください。学習分野・学習方法・復習に当てはまるときは、そのURLを開いてください。それ以外は、エンジンで設定できる内容ではないことを伝え、「学習計画に戻る」を開いてください。'],
    show: ['ご要望を入力してください。'],
    links: [['学習分野・優先順位', url(base, rec, 'em', t, 1)], ['学習方法・配分', url(base, rec, 'em', t, 2)], ['復習頻度・タイミング', url(base, rec, 'em', t, 3)], ['学習計画に戻る', url(base, rec, 'plan', t)]],
  };
}

// ---------------------------------------------------------------- 初期診断

function offerParts(ctx) {
  const { rec, base, t } = ctx;
  const n = fieldIds(rec).length * DIAG_PER_FIELD;
  const beginner = R(rec).level === 1;
  return {
    show: [
      '初期診断で苦手分野を確かめますか？',
      `各分野から${DIAG_PER_FIELD}問ずつ（全${n}問）公式の過去問を出し、分野別の正答率から学習の順番を決めます。公式の問題が足りない分野だけ、AI作成の問題で補います。問題数が少ないため、結果は「暫定評価」です。`,
      `1. 初期診断を受ける${beginner ? '' : '（おすすめ）'}`,
      `2. 診断せずに始める${beginner ? '（学習の段階が「未着手」のため、おすすめ）' : ''}`,
      '番号で答えてください。',
    ],
    links: [['1 初期診断を受ける', url(base, rec, 'dg', t, 1)], ['2 診断せずに始める', url(base, rec, 'dg', t, 2)], ...learnLinks(ctx)],
  };
}

function startDiagnosis(rec, extra = false) {
  const r = R(rec);
  const ids = fieldIds(rec);
  const prev = r.diag?.answers ?? [];
  const queue = [...(extra ? r.diag?.queue ?? [] : prev.map((a) => a.fieldId)), ...ids.flatMap((f) => Array(extra ? 1 : DIAG_PER_FIELD).fill(f))];
  r.diag = { status: 'running', queue, idx: prev.length, answers: prev };
  r.priority = null;
}

async function diagParts(ctx) {
  const { rec } = ctx;
  const d = R(rec).diag;
  // 結果画面の同率の順番も出題数で決めるため、先に取り込み済みの過去問を読む
  const { job, items } = await loadItems(ctx);
  if (d.idx >= d.queue.length) {
    d.status = 'result';
    return diagResultParts(ctx);
  }
  const f = d.queue[d.idx];
  const cur = rec.engine.current;
  if (cur && !cur.grade && cur.kind === 'diag') {
    const same = items.find((x) => x.packet.questionId === cur.questionId);
    if (same) return questionParts(ctx, same, 'diag', true);
  }
  const item = pickInField(rec.engine, items, f);
  if (item) return questionParts(ctx, item, 'diag');
  if (job?.state === 'running') return waitingParts(ctx, job);
  return checkParts(ctx, setPending(ctx, { type: 'check', purpose: 'diag', fieldId: f }));
}

function diagResultParts(ctx) {
  const { rec, base, t } = ctx;
  const r = R(rec);
  const ids = fieldIds(rec);
  const counts = fieldCounts(ctx.loaded?.items ?? [], ids);
  const d = diagnosisOrder(ids, r.diag.answers, counts);
  const name = (f) => fieldName(rec, f);
  const lines = ['【初期診断の結果（暫定評価）】'];
  for (const row of d.rows) {
    lines.push(row.n ? `・${name(row.fieldId)}：回答${row.n}問／誤答${row.w}問／正答率${Math.round(((row.n - row.w) / row.n) * 100)}%` : `・${name(row.fieldId)}：未診断（回答がないため順位を付けていません）`);
  }
  lines.push('');
  if (d.allWrong) lines.push('全問不正解のため、回答した全分野を「要強化（暫定）」とします。分野の間に優劣をつける根拠はないため、出題数・公式の分野順で学習の順番を決めました。');
  else if (d.allRight) lines.push('今回の診断では誤答はありませんでした（弱点がないとは断定しません）。出題数・公式の分野順で学習の順番を決めました。');
  for (const tie of d.ties) if (!d.allWrong && !d.allRight) lines.push(`診断上同程度（誤答率が同じ）：${tie.map(name).join('・')}。学習の順番は出題数、次に公式の分野順で決めました。`);
  lines.push('学習の順番（誤答率の高い順）：', ...d.order.map((f, i) => `　${i + 1}. ${name(f)}`));
  lines.push('', '1. この診断結果で計画を作る', '2. 追加診断', '3. 分野順を自分で指定', '4. 計画見直しへ戻る', '番号で答えてください。');
  const ch = ['この診断結果で計画を作る', '追加診断', '分野順を自分で指定', '計画見直しへ戻る'];
  return { show: lines, links: [...ch.map((c, i) => [`${i + 1} ${c}`, url(base, rec, 'dr', t, i + 1)]), ...learnLinks(ctx)] };
}

// ---------------------------------------------------------------- 学習（出題・確認問題・採点）

function questionParts(ctx, item, kind, repeated = false) {
  const { rec, base, now } = ctx;
  const r = R(rec);
  if (!repeated) rec.qn += 1;
  rec.engine = pin(rec.engine, item, kind, now);
  const f = item.packet.fieldId;
  if (kind === 'new' && !repeated && rec.engine.set?.count === 1) r.fieldSets[f] = (r.fieldSets[f] ?? 0) + 1;
  const q = present(item, kind, `${base}/v1/figure`);
  const pdfPages = q.questionPdfPages.length ? `（${q.questionPdfPages.join('・')}ページ）` : '';
  const d = r.diag;
  const head = kind === 'diag'
    ? `■初期診断 ${d.idx + 1}/${d.queue.length}｜${q.year}年度 問${q.questionNumber}`
    : `■${q.year}年度 問${q.questionNumber}${kind === 'review' ? '（復習）' : ''}`;
  const links = q.choices.map((_, i) => [`${i + 1}と答えた`, url(base, rec, 'a', rec.qn, i + 1)]);
  links.push(...q.choices.map((_, i) => [`${i + 1}と答え「勘」と言った`, url(base, rec, 'a', rec.qn, i + 1, 'g')]));
  return withStart(ctx, kind === 'diag' ? '初期診断' : kind === 'review' ? '復習' : '公式過去問', {
    ai: [
      '図は ![図](URL) の形で画像として表示してください。',
      '利用者が番号以外を聞いたときは、採点せずに質問に答え、同じ問題に戻ってください。正答はほのめかさないでください。',
    ],
    show: [
      `📍${fieldName(rec, f)}`,
      head,
      '',
      q.stem,
      ...q.figures.map((fig) => `図：${fig.url}`),
      '',
      ...q.choices.map((ch, i) => `${i + 1}. ${ch}`),
      '',
      `問題PDF：${q.questionPdfUrl}${pdfPages}`,
      ...q.notices,
      '',
      '番号で答えてください。勘で選んだときは「勘」と添えてください。',
    ],
    links: [...links, ...learnLinks(ctx)],
  });
}

/** AIが作る確認問題（解説あり・確認問題から・連続不正解の補強・初期診断の代わり）。採点はAI、結果だけエンジンに記録する。 */
function checkParts(ctx, p) {
  const { rec, base } = ctx;
  const r = R(rec);
  const name = fieldName(rec, p.fieldId);
  const chain = r.chains[p.fieldId] ?? { wrong: 0 };
  const ai = [];
  if (p.purpose === 'diag') ai.push(`「${name}」の分野の基本を確かめる4択問題を1問作ってください（初期診断用。公式の過去問が足りない分野の代わりです）。`);
  else if (p.withExplain && !chain.wrong) ai.push(`まず「${name}」の分野の要点を解説してください。冒頭に「AIによる解説（公式の解説ではありません）」と書き、結論 → 身近な例 → 試験のポイント → 短い覚え方 の順で、根拠は法令・公式資料などの一次資料にしてください。続けて、解説した内容の確認問題を1問出してください。`);
  else if (p.purpose === 'reinforce' && !chain.wrong) ai.push(`直前に間違えた「${name}」の問題の論点について、まず2〜4行の短い補足をしてから、その論点の確認問題を1問出してください。`);
  else if (chain.wrong) ai.push(`前の確認問題で間違えた論点について、${chain.wrong >= 2 || p.explainFirst ? '前提から短く説明してから、' : ''}別の確認問題を1問出してください（分野：${name}）。`);
  else ai.push(`「${name}」の分野の基本を確かめる確認問題を1問出してください。`);
  ai.push(
    '確認問題は易しい4択または○×で1つの論点だけを問い、「AI作成（公式の過去問ではありません）」と書いてください。選択肢には「1. 」から番号を付け、最後に「番号で答えてください。」と書いて、利用者の答えを待ってください。回答前に正答やヒントを見せないでください。',
    '利用者が答えたら「■採点」「正解です。／不正解です。」「正答：番号」「根拠：確認した一次資料」「各選択肢の短い説明」の形で採点し、同じ返答の中ですぐに、正解なら「確認問題に正解した」、不正解なら「確認問題に不正解だった」のURLを開いてください。',
  );
  const d = r.diag;
  const head = p.purpose === 'diag' ? `■初期診断 ${d.idx + 1}/${d.queue.length}（AI作成の確認問題）` : p.withExplain && !chain.wrong ? '■解説 → 確認問題' : '■確認問題';
  return withStart(ctx, p.purpose === 'diag' ? '初期診断' : p.withExplain ? '解説' : '確認問題', {
    ai,
    show: [`📍${name}`, head, '（ここにAIの解説と確認問題を表示）'],
    links: [['確認問題に正解した', url(base, rec, 'ck', p.token, 1)], ['確認問題に不正解だった', url(base, rec, 'ck', p.token, 0)], ...learnLinks(ctx)],
  });
}

/** 分野の始め方（マスタープロンプト U07 項目開始A）。 */
function modeParts(ctx, p) {
  const { rec, base } = ctx;
  const rec1 = LEVELS[R(rec).level]?.mode;
  const links = [];
  for (const m of [1, 2, 3]) links.push([`${m} ${MODES[m].split('（')[0]}`, url(base, rec, 'fm', p.token, m, 0)]);
  if (R(rec).method !== 'ask') for (const m of [1, 2, 3]) links.push([`${m} 以後も`, url(base, rec, 'fm', p.token, m, 1)]);
  return {
    show: [
      `📍${fieldName(rec, p.fieldId)}`,
      '■この分野はどう進めますか？',
      ...[1, 2, 3].map((m) => `${m}：${MODES[m]}${m === rec1 ? '（おすすめ）' : ''}`),
      R(rec).method === 'ask' ? '番号で答えてください。' : '番号で答えてください。以後も同じにするときは「2 以後も」のように伝えてください。',
    ],
    links: [...links, ...learnLinks(ctx)],
  };
}

/** 実践採点後の解説要否（マスタープロンプト U14）。 */
function u14Parts(ctx, token) {
  const { rec, base } = ctx;
  return {
    show: ['■解説の確認', '1：解説を見る', '2：解説を省略して学習を続ける', '番号で答えてください。以後も同じにするときは「1 以後も」のように伝えてください。'],
    links: [
      ['1 解説を見る', url(base, rec, 'x', token, 1)],
      ['2 解説を省略して学習を続ける', url(base, rec, 'x', token, 2)],
      ['1 以後も', url(base, rec, 'x', token, 1, 'k')],
      ['2 以後も', url(base, rec, 'x', token, 2, 'k')],
      ...learnLinks(ctx),
    ],
  };
}

function explainLead(last) {
  return {
    ai: [`「（ここに前の問題の解説を表示）」には、前の問題（${last.label}、正答${last.correctAnswer}、利用者の答え${last.selected}）の解説を書いてください。冒頭に「AIによる解説（公式の解説ではありません）」と書き、選択肢ごとに「1：正しい／誤り」「根拠：法令・公式資料など」「理由（誤りなら正しい内容）」を改行して示してください。根拠を確認できない選択肢は「説明保留」としてください。`],
    show: ['（ここに前の問題の解説を表示）'],
  };
}

/** 確認問題で続けて間違えたときの続け方（マスタープロンプト U26）。 */
async function u26Parts(ctx, p) {
  const { rec, base } = ctx;
  const dest = await nextFieldName(ctx, p.fieldId);
  return {
    show: ['■確認問題の続け方', '1：短い解説を読み、別の確認問題へ進む', dest ? `2：この分野を一旦保留し、${dest}へ進む` : '2：学習を終了する', '番号で答えてください。'],
    links: [['1 短い解説を読み、別の確認問題へ進む', url(base, rec, 'u2', p.token, 1)], [dest ? '2 この分野を一旦保留して次へ進む' : '2 学習を終了する', url(base, rec, 'u2', p.token, 2)], ...learnLinks(ctx)],
  };
}

async function nextFieldName(ctx, except) {
  const { rec } = ctx;
  const r = R(rec);
  const { items } = await loadItems(ctx);
  const ids = fieldIds(rec);
  const { order } = planOrder(r, ids, fieldCounts(items, ids));
  const cands = fieldsWithQuestions(rec.engine, items, ids).filter((f) => f !== except && !r.held.includes(f));
  const f = chooseField({ order, stats: fieldStats(rec.engine.history), sets: r.fieldSets, candidates: cands });
  return f ? fieldName(rec, f) : null;
}

function waitingParts(ctx, job) {
  return {
    ai: ['取り込みが終わるまで、利用者が望めば解説をしてください。そのあと「もう一度」のURLを開いてください。'],
    show: ['公式の過去問を取り込んでいます。少し待ってから、もう一度開きます。', ...(job?.notice ? [job.notice] : [])],
    links: [['もう一度', url(ctx.base, ctx.rec, 'n', ctx.t)], ...learnLinks(ctx)],
  };
}

function noQuestionParts(ctx, job) {
  const { rec, base, t } = ctx;
  const c = CATALOG[rec.fixed.slug];
  if (job?.state === 'running') return waitingParts(ctx, job);
  if (job?.state === 'failed' && !Object.keys(rec.engine.history ?? {}).length) {
    return {
      ai: fallbackAi(c.pastExamPage),
      show: [
        '公式の過去問をシステムで取り込めませんでした。AIが作成した問題で練習を続けます。',
        '公式の過去問を使いたいときは、次の公式掲載ページから問題と正答のPDFを取得し、このチャットに添付してください。それを使って出題します。',
        `公式の過去問掲載ページ：${c.pastExamPage}`,
        ...(job?.notice ? [job.notice] : []),
      ],
      links: [['もう一度、公式の過去問を取りに行く', url(base, rec, 'retry', t)], ...learnLinks(ctx)],
    };
  }
  return {
    show: [job?.state === 'failed' ? '公式の過去問を取り込めませんでした。時間をおいて、もう一度お試しください。' : '取り込んだ公式の過去問を、すべて解き終えました。復習の日になると、復習の問題が出ます。'],
    links: learnLinks(ctx),
  };
}

/**
 * 次に出すものを決める（マスタープロンプト B15 の判定順に合わせる）。
 * 初期診断 → 回答待ちの画面 → 連続不正解の補強 → 出題中の問 → 期限の来た復習 → 同じ分野の3問セットの続き → 次の分野。
 */
async function nextContent(ctx, lead = []) {
  const { rec } = ctx;
  const r = R(rec);
  if (!r.session?.active) startSession(r, '学習開始');
  const L = (parts) => compose({ show: lead }, parts);
  if (r.diag?.status === 'running') return L(await diagParts(ctx));
  if (r.diag?.status === 'result') {
    await loadItems(ctx);
    return L(diagResultParts(ctx));
  }
  if (!r.diag || r.diag.status === 'offered') {
    r.diag = { status: 'offered', queue: [], idx: 0, answers: r.diag?.answers ?? [] };
    return L(offerParts(ctx));
  }
  const p = r.pending;
  if (p?.type === 'explain') return L(u14Parts(ctx, p.token));
  if (p?.type === 'check') return L(checkParts(ctx, p));
  if (p?.type === 'mode') return L(modeParts(ctx, p));
  if (p?.type === 'u26') return L(await u26Parts(ctx, p));
  if (r.remediate) {
    const f = r.remediate;
    r.remediate = null;
    r.chains[f] = { type: 'reinforce', wrong: 0, extra: false };
    const pend = setPending(ctx, { type: 'check', purpose: 'reinforce', fieldId: f });
    return L(compose({ show: [`同じ分野（${fieldName(rec, f)}）で${WRONG_STREAK}問連続不正解のため、確認問題で理解を補強します。`] }, checkParts(ctx, pend)));
  }
  const { job, items } = await loadItems(ctx);
  const cur = rec.engine.current;
  if (cur && !cur.grade) {
    const same = items.find((x) => x.packet.questionId === cur.questionId);
    if (same) return L(questionParts(ctx, same, cur.kind === 'diag' ? 'new' : cur.kind, true));
  }
  if (reviewTurn(r.session)) {
    const it = dueReview(rec.engine, items, jstToday(ctx.now), r.session.reviewed);
    if (it) return L(questionParts(ctx, it, 'review'));
  }
  const ids = fieldIds(rec);
  const { order } = planOrder(r, ids, fieldCounts(items, ids));
  const avail = fieldsWithQuestions(rec.engine, items, ids);
  let cands = avail.filter((f) => !r.held.includes(f));
  if (!cands.length && avail.length) {
    r.held = [];
    cands = avail;
  }
  const set = rec.engine.set;
  const f = set && set.count < SET_SIZE && cands.includes(set.fieldId)
    ? set.fieldId
    : chooseField({ order, stats: fieldStats(rec.engine.history), sets: r.fieldSets, candidates: cands });
  if (!f) return L(noQuestionParts(ctx, job));
  const inSet = set && set.fieldId === f && set.count < SET_SIZE;
  if (!inSet) {
    const mode = r.fieldModes[f] ?? r.defaultMode;
    if (!mode) return L(modeParts(ctx, setPending(ctx, { type: 'mode', fieldId: f })));
    const fd = (r.fieldDone[f] ??= {});
    if ((mode === 1 && !fd.explained) || (mode === 2 && !fd.checked)) {
      r.chains[f] = { type: 'normal', wrong: 0, extra: false };
      return L(checkParts(ctx, setPending(ctx, { type: 'check', purpose: 'normal', fieldId: f, withExplain: mode === 1 })));
    }
  }
  return L(questionParts(ctx, pickInField(rec.engine, items, f), 'new'));
}

function u12(g, cur) {
  return ['■採点', g.correct ? (g.result === 'guess_correct' ? '正解です（勘で正解）。' : '正解です。') : '不正解です。', `正答：${g.correctAnswer}`, `解答PDF：${g.answerPdfUrl ?? cur.source.questionPdfUrl}`];
}

async function answerParts(ctx, qn, value, guess) {
  const { rec, now } = ctx;
  const r = R(rec);
  const cur = rec.engine.current;
  if (qn !== rec.qn || !cur) return nextContent(ctx, ['この問題の回答はもう受け付けていません。']);
  const res = grade(rec.engine, { questionId: cur.questionId, value, confidence: guess ? 'guess' : 'sure' }, { today: jstToday(now), now, intervals: intervalsOf(r) });
  if (!res.ok) return nextContent(ctx, ['答えの番号が選択肢にありません。もう一度番号で答えてください。']);
  const g = res.grade;
  if (g.alreadyGraded) return compose({ show: u12(g, cur) }, await nextContent(ctx));
  rec.engine = res.state;
  const f = cur.fieldId ?? 'unknown';
  if (!r.session?.active) startSession(r, '学習開始');
  const s = r.session;
  s.answered += 1;
  if (g.correct) s.correct += 1;
  const sf = (s.fields[f] ??= { n: 0, w: 0 });
  sf.n += 1;
  if (!g.correct) sf.w += 1;
  const shown = u12(g, cur);
  if (cur.kind === 'diag') {
    const d = r.diag;
    d.answers.push({ fieldId: f, qid: cur.questionId, result: g.result, source: 'official' });
    d.idx += 1;
    return compose({ ai: ['「（ここに短い解説を表示）」には、この問題の要点を2〜3行で書いてください（冒頭に「AIによる解説」）。'], show: [...shown, '', '（ここに短い解説を表示）'] }, await nextContent(ctx));
  }
  if (cur.kind === 'review') {
    s.reviewCount += 1;
    s.sinceReview = 0;
    s.reviewed.push(cur.questionId);
  } else {
    s.newCount += 1;
    s.sinceReview += 1;
  }
  r.wrongStreaks[f] = g.correct ? 0 : (r.wrongStreaks[f] ?? 0) + 1;
  if (!g.correct && r.wrongStreaks[f] >= WRONG_STREAK) r.remediate = f;
  r.lastQ = { label: `${cur.source.year}年度 問${cur.source.number}`, correctAnswer: g.correctAnswer, selected: g.selected };
  if (r.explainPref == null) {
    const p = setPending(ctx, { type: 'explain' });
    return compose({ show: shown }, u14Parts(ctx, p.token));
  }
  if (r.explainPref === 1) return compose({ show: shown }, explainLead(r.lastQ), await nextContent(ctx));
  return compose({ show: shown }, await nextContent(ctx));
}

/** AIが採点した確認問題の結果を記録して、次へ進む。 */
async function checkResult(ctx, token, ok) {
  const { rec, now } = ctx;
  const r = R(rec);
  const p = r.pending;
  if (!p || p.type !== 'check' || p.token !== token) return nextContent(ctx, ['この確認問題の結果は、もう受け付けていません。']);
  const f = p.fieldId;
  r.pending = null;
  r.checkLog = [...r.checkLog, { fieldId: f, ok, purpose: p.purpose, date: jstToday(now) }].slice(-200);
  if (p.purpose === 'diag') {
    r.diag.answers.push({ fieldId: f, qid: null, result: ok ? 'confident_correct' : 'wrong', source: 'ai' });
    r.diag.idx += 1;
    return nextContent(ctx);
  }
  const name = fieldName(rec, f);
  const chain = r.chains[f] ?? { type: p.purpose, wrong: 0, extra: false };
  if (ok) {
    delete r.chains[f];
    const fd = (r.fieldDone[f] ??= {});
    fd.checked = true;
    fd.explained = true;
    if (p.purpose === 'reinforce') r.wrongStreaks[f] = 0;
    // 同じ分野の実践問題へ戻る（新しい3問セット）
    rec.engine = { ...rec.engine, set: { fieldId: f, count: 0 } };
    return nextContent(ctx, [`確認問題に正解しました。「${name}」の実践問題へ進みます。`]);
  }
  chain.wrong += 1;
  r.chains[f] = chain;
  if (chain.wrong >= CHECK_STREAK) {
    if (chain.extra) {
      delete r.chains[f];
      r.held.push(f);
      return nextContent(ctx, [`「${name}」の分野を一旦保留し、次へ進みます。`]);
    }
    return u26Parts(ctx, setPending(ctx, { type: 'u26', fieldId: f }));
  }
  return checkParts(ctx, setPending(ctx, { type: 'check', purpose: p.purpose, fieldId: f }));
}

// ---------------------------------------------------------------- メニュー・再開・終了・訂正

function menuParts(ctx, lead = []) {
  const { rec, base, t, now } = ctx;
  const s = stats(rec, now);
  return {
    ai: ['利用者に番号で選んでもらってください。学習記録を直したいと言われたら「3 記録を確認・訂正する」を開いてください。'],
    show: [
      ...lead,
      '■学習メニュー',
      `これまで：${s.answered}問解答、うち正解${s.correct}問。今日の復習：${s.due}問。`,
      '1. 学習を続ける',
      '2. 学習計画を確認・見直す',
      '3. 記録を確認・訂正する',
      '4. 学習を終える',
      '番号で答えてください。',
      '',
      resumeLine(base, rec),
    ],
    links: [['1 学習を続ける', url(base, rec, 'n', t)], ['2 学習計画を確認・見直す', url(base, rec, 'plan', t)], ['3 記録を確認・訂正する', url(base, rec, 'fix', t)], ['4 学習を終える', url(base, rec, 'end', t)]],
  };
}

/** 引継ぎIDで開いたとき：内容を日本語で示し、再開の承認を求める（読み込んだだけでは再開しない）。 */
function resumeParts(ctx) {
  const { rec, base, t, now } = ctx;
  const r = R(rec);
  const c = CATALOG[rec.fixed.slug];
  const s = stats(rec, now);
  const weak = weakList(rec).slice(0, 5).map((x) => label(x.h));
  return {
    ai: ['利用者に、再開するかを番号で選んでもらってください。'],
    show: [
      '【学習記録】',
      `・資格：${c.name}`,
      `・学習の段階：${LEVELS[r.level]?.label ?? '未設定'}`,
      `・免除：${c.exemption ? (r.exempt ? `利用する（${c.exemption.label}）` : '利用しない') : '制度なし'}`,
      `・初期診断：${r.diag?.status === 'done' ? `実施済み（${r.diag.answers.length}問）` : '未実施'}`,
      `・成績：${s.answered}問解答、うち正解${s.correct}問`,
      `・復習対象：${s.reviews}問（今日が復習日：${s.due}問）`,
      `・弱点：${weak.length ? weak.join('、') : 'なし'}`,
      `・累計学習時間：${r.totalMinutes}分`,
      `・次回：${s.due ? '復習から' : '学習計画の続きから'}`,
      '',
      'この内容から学習を再開しますか？',
      '1. 学習を再開する',
      '2. 今は学習しない',
      '3. 記録を訂正する',
      '番号で答えてください。',
    ],
    links: [['1 再開する', url(base, rec, 'resume', t)], ['2 今は学習しない', url(base, rec, 'pause', t)], ['3 訂正する', url(base, rec, 'fix', t)]],
  };
}

async function endParts(ctx) {
  const { rec, now, base } = ctx;
  const r = R(rec);
  const s = r.session;
  const show = ['お疲れさまでした。学習を終了します。'];
  if (s?.active) {
    const mins = s.startedAt ? Math.max(0, Math.round((now - s.startedAt) / 60000)) : null;
    if (mins !== null) r.totalMinutes += mins;
    s.active = false;
    s.endedAt = now;
    const today = jstToday(now);
    const st = stats(rec, now);
    const nextDue = Object.values(rec.engine.review).map((x) => x.dueDate).filter((x) => x && x > today).sort()[0];
    const studied = Object.keys(s.fields).filter((f) => f !== 'unknown').map((f) => fieldName(rec, f));
    const weak = Object.entries(s.fields).filter(([f, v]) => v.w > 0 && f !== 'unknown').map(([f, v]) => `${fieldName(rec, f)}（誤答${v.w}問）`);
    const next = await nextFieldName(ctx, null);
    show.push(
      '',
      '【今回の学習ログ】',
      `・学習時間：${mins === null ? '未確定（学習内容を始める前に終了しました）' : `${mins}分（開始 ${hhmm(s.startedAt)}／終了 ${hhmm(now)}）`}`,
      `・解いた問題：${s.answered}問（正解${s.correct}問）`,
      `・学習した分野：${studied.length ? studied.join('、') : 'なし'}`,
      `・誤答・弱点：${weak.length ? weak.join('、') : 'なし'}`,
      `・復習対象：${st.reviews}問（今日が復習日：${st.due}問${nextDue ? `／次の復習日：${nextDue}` : ''}）`,
      `・次回優先：${st.due ? '期限の来た復習、その後 ' : ''}${next ?? '学習計画の続き'}`,
      `・累計学習時間：${r.totalMinutes}分`,
    );
  }
  return { ai: ['「----」で囲まれた文は、利用者がコピーしやすいように、そのままの形で表示してください。'], show: [...show, '', ...personalPrompt(base, rec)] };
}

/** 学習結果の訂正（固定情報と公式の正答は変えられない）。 */
function fixParts(ctx, lead = []) {
  const { rec, base, t } = ctx;
  const r = R(rec);
  const c = CATALOG[rec.fixed.slug];
  const links = [];
  const show = [...lead, '直したい内容を選んでください。資格と公式の正答は変更できません。'];
  for (const [k, v] of Object.entries(LEVELS)) {
    if (Number(k) !== r.level) links.push([`学習の段階を「${v.label}」にする`, url(base, rec, 'fx', t, 'lv', k)]);
  }
  if (c.exemption) links.push([r.exempt ? '免除を利用しないに変える' : '免除を利用するに変える', url(base, rec, 'fx', t, 'ex', r.exempt ? 0 : 1)]);
  const weak = weakList(rec).slice(0, FIX_LIST);
  weak.forEach((x, i) => links.push([`弱点・復習から外す：${label(x.h)}`, url(base, rec, 'fx', t, 'rv', i)]));
  const answered = recentAnswers(rec);
  answered.forEach((x, i) => links.push([`成績から除外する：${label(x.h)}（${x.h.answeredAt}）`, url(base, rec, 'fx', t, 'hx', i)]));
  links.push(['学習メニューに戻る', url(base, rec, 'menu', t)]);
  show.push('（利用者の言葉に合う項目のURLを開いてください。合う項目がなければ、できない訂正であることを伝えてください。）');
  return { ai: ['利用者が直したい内容を聞き、「次に開くURL」から合うものを開いてください。'], show, links };
}

function recentAnswers(rec) {
  return Object.entries(rec.engine.history)
    .map(([qid, h]) => ({ qid, h }))
    .sort((a, b) => b.h.answeredAt.localeCompare(a.h.answeredAt) || a.qid.localeCompare(b.qid))
    .slice(0, FIX_LIST);
}

function applyFix(rec, op, arg) {
  const c = CATALOG[rec.fixed.slug];
  if (op === 'lv' && LEVELS[arg]) {
    rec.result.level = Number(arg);
    return `学習の段階を「${LEVELS[arg].label}」に直しました。`;
  }
  if (op === 'ex' && c.exemption && (arg === '0' || arg === '1')) {
    rec.result.exempt = arg === '1';
    return rec.result.exempt ? '免除を利用するに直しました。' : '免除を利用しないに直しました。';
  }
  if (op === 'rv') {
    const x = weakList(rec).slice(0, FIX_LIST)[Number(arg)];
    if (!x) return null;
    const review = { ...rec.engine.review };
    delete review[x.qid];
    rec.engine = { ...rec.engine, review };
    return `${label(x.h)}を弱点・復習から外しました。`;
  }
  if (op === 'hx') {
    const x = recentAnswers(rec)[Number(arg)];
    if (!x) return null;
    const history = { ...rec.engine.history };
    const review = { ...rec.engine.review };
    delete history[x.qid];
    delete review[x.qid];
    rec.engine = { ...rec.engine, history, review };
    rec.result.excluded = [...rec.result.excluded, { qid: x.qid, answeredAt: x.h.answeredAt }].slice(-200);
    return `${label(x.h)}の回答を成績から除外しました。`;
  }
  return null;
}

// ---------------------------------------------------------------- 導入（試験概要・免除・学習の段階）

function levelParts(ctx, lead = [], ai = []) {
  const { rec, base } = ctx;
  return {
    ai,
    show: [...lead, ...(lead.length ? [''] : []), '■学習準備の確認', '今の学習の段階', ...Object.entries(LEVELS).map(([k, v]) => `${k}：${v.label}`), '番号で答えてください。'],
    links: Object.entries(LEVELS).map(([k, v]) => [`${k} ${v.label}`, url(base, rec, 'lv', k)]),
  };
}

function exemptionParts(ctx, lead = [], ai = []) {
  const { rec, base } = ctx;
  const c = CATALOG[rec.fixed.slug];
  return {
    ai,
    show: [...lead, ...(lead.length ? [''] : []), '■学習準備の確認', `免除制度：${c.exemption.label}`, ...fixedUi('EXEMPTION_USE_CONFIRM')],
    links: [['1 免除を利用する', url(base, rec, 'ex', 1)], ['2 免除を利用しない', url(base, rec, 'ex', 0)]],
  };
}

/** 導入の途中で別のURLが開かれたときは、導入の続きに戻す。 */
async function onboarding(ctx) {
  const step = ctx.rec.result.step;
  if (step === 'exemption') return exemptionParts(ctx);
  if (step === 'level') return levelParts(ctx);
  if (step === 'confirm') return confirmParts(ctx);
  return planPreview(ctx);
}

/**
 * 取り込む公式PDFを、公式の過去問掲載ページから探す（掲載されている分を最大で直近10年度）。
 * 掲載ページを開けないときは、台帳に控えた確認済みのURLを使う。
 * 問題が2つのPDFに分かれている年度は、それぞれを取り込み元にする（正答PDFは共通）。
 */
async function findSources(env, slug) {
  let found = [];
  try {
    found = env.fetchText ? await discover(slug, env.fetchText) : [];
  } catch {
    found = [];
  }
  if (!found.length) return CATALOG[slug].sources;
  return found.flatMap((s) => {
    const { questionUrls, ...one } = s;
    return (questionUrls ?? [s.questionUrl]).map((questionUrl) => ({ ...one, questionUrl }));
  });
}

/** 過去問は学習者ごとに取り込み、期限なしで持つ（その人だけが使う）。取り込みに失敗していれば、やり直す。 */
async function startIngest(env, rec, now, kick) {
  const c = CATALOG[rec.fixed.slug];
  const sources = await findSources(env, rec.fixed.slug);
  await startJob(env.STORE, jobId(rec), sources.map((s) => ({ ...s, qualificationId: c.qualificationId, owner: rec.fixed.lid })), now, { persistent: true });
  await kick(jobId(rec));
}

function otherQualification(base, lid) {
  return page({
    ai: [
      '利用者がすでに入力した資格名を使ってください（まだ聞いていなければ聞いてください）。',
      ...fallbackAi(null),
      'この資格の学習記録はシステムに残りません。そのことを利用者に伝えてください。',
    ],
    show: ['この資格は、まだシステムで公式の過去問を取り込めません。AIが作成した問題で学習します。', '公式の過去問を使いたいときは、公式の掲載ページをご案内します。そこから問題と正答のPDFを取得して、このチャットに添付してください。'],
    links: [['資格名を入力し直す', `${base}/p/${lid}`]],
  });
}

// ---------------------------------------------------------------- URLの振り分け

const EDIT_ACTIONS = new Set(['plan', 'pv', 'st', 'em', 'ef', 'fp', 'mt', 'rp', 'rc', 'end', 'pause']);

async function route(env, base, parts, now, advance, kick) {
  if (parts.length === 1) return { res: chooseQualification(base, newLearnerId()) };
  const lid = parts[1];
  if (!LID.test(lid)) return { res: chooseQualification(base, newLearnerId()) };
  let rec = await load(env, lid);
  const [, , action, a1, a2, a3] = parts;

  if (action === 'go' && parts.length === 4 && CATALOG[a1]) {
    if (rec && rec.fixed.slug !== a1) return { res: chooseQualification(base, newLearnerId(), [`この引継ぎIDは${CATALOG[rec.fixed.slug].name}の記録です。別の資格は新しい引継ぎIDで始めます。`]) };
    const isNew = !rec;
    if (isNew) rec = newRecord(lid, a1, now);
    R(rec);
    const ctx = { env, base, rec, now, advance, kick, prev: rec.tick ?? 0 };
    ctx.t = bump(rec);
    if (!isNew) return { rec, res: page(rec.result.step === 'ready' ? resumeParts(ctx) : await onboarding(ctx)) };
    const c = CATALOG[a1];
    await startIngest(env, rec, now, kick);
    const lead = [`${c.name}の学習を始めます。`, '■試験概要', '（ここに試験の概要を表示）', '', resumeLine(base, rec)];
    const ai = [`「（ここに試験の概要を表示）」の部分には、公式サイト（${c.officialSite}）で確認できた試験の概要（対象・出題分野・形式・時間・合格基準・免除制度）を、初心者にも分かる言葉で書いてください。確認できなかった項目は「未確認」と書いてください。`];
    return { rec, res: page(c.exemption ? exemptionParts(ctx, lead, ai) : levelParts(ctx, lead, ai)) };
  }

  if (action === 'other' && !rec) return { res: otherQualification(base, lid) };
  if (!rec) return { res: chooseQualification(base, lid) };
  const r = R(rec);
  const ctx = { env, base, rec, now, advance, kick };
  const fresh = Number(a1) === (rec.tick ?? 0); // 今出ている画面のリンクか（古い画面のリンクでは設定を変えない）
  ctx.t = bump(rec);
  const step = r.step;
  const out = (parts2) => ({ rec, res: page(parts2) });

  if (action === undefined) return out(step === 'ready' ? resumeParts(ctx) : await onboarding(ctx));
  if (action === 'ex' && step === 'exemption' && (a1 === '0' || a1 === '1')) {
    r.exempt = a1 === '1';
    r.step = 'level';
    return out(levelParts(ctx));
  }
  if (action === 'lv' && step === 'level' && LEVELS[a1]) {
    r.level = Number(a1);
    r.step = 'plan';
    return out(await planPreview(ctx));
  }
  if (step !== 'ready' && !EDIT_ACTIONS.has(action)) return out(await onboarding(ctx));

  // 学習計画の表示・見直し（開始前も開始後も）
  if (action === 'plan') return out(await planPreview(ctx));
  if (action === 'pv') {
    if (!fresh) return out(await planPreview(ctx));
    if (a2 === '2') return out(editMenuParts(ctx));
    if (r.session?.active && step === 'ready') return out(await nextContent(ctx, ['学習計画を確定しました。']));
    r.step = step === 'ready' ? 'ready' : 'confirm';
    return out(step === 'ready' ? await nextContent(ctx) : confirmParts(ctx));
  }
  if (action === 'st') {
    if (!fresh || step === 'ready') return out(step === 'ready' ? await nextContent(ctx) : confirmParts(ctx));
    if (a2 === '2') {
      r.step = 'plan';
      return out({ ai: ['「----」で囲まれた文は、利用者がコピーしやすいように、そのままの形で表示してください。'], show: ['学習は開始していません。学習計画は保存しました。', '', ...personalPrompt(base, rec)] });
    }
    r.step = 'ready';
    startSession(r, '学習開始');
    return out(await nextContent(ctx));
  }
  if (action === 'em') {
    if (a1 === undefined) return out(editMenuParts(ctx));
    if (a2 === '1') return out(fieldsMenuParts(ctx));
    if (a2 === '2') return out(methodParts(ctx));
    if (a2 === '3') return out(reviewParts(ctx));
    if (a2 === '4') return out(otherEditParts(ctx));
    if (a2 === '5') return out(await planPreview(ctx));
    return out(editMenuParts(ctx));
  }
  if (action === 'ef') {
    if (!fresh) return out(fieldsMenuParts(ctx));
    if (a2 === '1') {
      r.priority = 'frequency';
      r.userTop = null;
      return out(await planPreview(ctx, ['頻出分野を優先する計画にしました。']));
    }
    if (a2 === '2') {
      if (step !== 'ready') {
        r.step = 'ready';
        startSession(r, '学習開始');
      }
      startDiagnosis(rec, r.diag?.answers?.length > 0);
      return out(await nextContent(ctx));
    }
    if (a2 === '3') return out(fieldPickParts(ctx));
    return out(editMenuParts(ctx));
  }
  if (action === 'fp') {
    if (!fresh || !fieldIds(rec).includes(a2)) return out(fieldPickParts(ctx));
    r.userTop = a2;
    return out(await planPreview(ctx, [`「${fieldName(rec, a2)}」を最優先にしました。`]));
  }
  if (action === 'mt') {
    const k = METHOD_KEYS[Number(a2) - 1];
    if (!fresh) return out(methodParts(ctx));
    if (!k) return out(editMenuParts(ctx));
    r.method = k;
    r.defaultMode = MODE_OF[k] ?? null;
    r.fieldModes = {};
    return out(await planPreview(ctx, [`学習方法を「${FIXED_UI_CHOICES.PLAN_EDIT_METHOD.choices[Number(a2) - 1]}」にしました。`]));
  }
  if (action === 'rp') {
    if (!fresh) return out(reviewParts(ctx));
    const k = ['focus', 'standard', 'slow', 'ai'][Number(a2) - 1];
    if (a2 === '5') return out(reviewCustomParts(ctx));
    if (!k) return out(editMenuParts(ctx));
    r.reviewPattern = k;
    return out(await planPreview(ctx, [`復習を「${REVIEW_PATTERNS[k].label}」にしました（すでに決まっている次の復習日はそのままです）。`]));
  }
  if (action === 'rc') {
    if (!fresh || !CUSTOM_REVIEW.includes(a2)) return out(reviewCustomParts(ctx));
    r.reviewPattern = a2;
    return out(await planPreview(ctx, [`復習を「${REVIEW_PATTERNS[a2].label}」にしました（予定の記録のみで、自動通知はありません）。`]));
  }

  // ここから学習中（開始の承認後）
  if (action === 'resume') {
    startSession(r, '学習再開');
    return out(await nextContent(ctx, ['学習を再開します。']));
  }
  if (action === 'pause') return out({ ai: ['「----」で囲まれた文は、利用者がコピーしやすいように、そのままの形で表示してください。'], show: ['今日はここまでにします。', '', ...personalPrompt(base, rec)] });
  if (action === 'end') return out(await endParts(ctx));
  if (action === 'menu') return out(menuParts(ctx));
  if (action === 'fix' && parts.length <= 4) return out(fixParts(ctx));
  if (action === 'fx') {
    const done = fresh ? applyFix(rec, a2, a3) : null;
    return out(fixParts(ctx, [done ?? 'この訂正はできませんでした。もう一度選んでください。']));
  }
  if (action === 'dg') {
    if (!fresh || r.diag?.status !== 'offered') return out(await nextContent(ctx));
    if (a2 === '1') startDiagnosis(rec);
    else r.diag.status = 'skipped';
    return out(await nextContent(ctx));
  }
  if (action === 'dr') {
    if (!fresh || r.diag?.status !== 'result') return out(await nextContent(ctx));
    if (a2 === '2') {
      startDiagnosis(rec, true);
      return out(await nextContent(ctx, ['追加診断を行います（各分野1問）。']));
    }
    r.diag.status = 'done';
    r.userTop = null;
    if (a2 === '3') return out(fieldPickParts(ctx));
    if (a2 === '4') return out(editMenuParts(ctx));
    return out(await planPreview(ctx, ['初期診断の結果を学習計画に反映しました。']));
  }
  if (action === 'fm') {
    const p = r.pending;
    if (!p || p.type !== 'mode' || p.token !== Number(a1) || !MODES[a2]) return out(await nextContent(ctx));
    r.fieldModes[p.fieldId] = Number(a2);
    if (a3 === '1' && r.method !== 'ask') r.defaultMode = Number(a2);
    r.pending = null;
    return out(await nextContent(ctx));
  }
  if (action === 'x') {
    const p = r.pending;
    if (!p || p.type !== 'explain' || p.token !== Number(a1)) return out(await nextContent(ctx));
    r.pending = null;
    const c = Number(a2) === 1 ? 1 : 2;
    if (a3 === 'k') r.explainPref = c;
    return out(c === 1 ? compose(explainLead(r.lastQ), await nextContent(ctx)) : await nextContent(ctx));
  }
  if (action === 'ck') return out(await checkResult(ctx, Number(a1), a2 === '1'));
  if (action === 'u2') {
    const p = r.pending;
    if (!p || p.type !== 'u26' || p.token !== Number(a1)) return out(await nextContent(ctx));
    r.pending = null;
    if (a2 === '1') {
      r.chains[p.fieldId] = { ...(r.chains[p.fieldId] ?? { type: 'normal', wrong: CHECK_STREAK }), extra: true };
      return out(checkParts(ctx, setPending(ctx, { type: 'check', purpose: r.chains[p.fieldId].type === 'reinforce' ? 'reinforce' : 'normal', fieldId: p.fieldId, explainFirst: true })));
    }
    const dest = await nextFieldName(ctx, p.fieldId);
    delete r.chains[p.fieldId];
    if (!dest) return out(await endParts(ctx));
    r.held.push(p.fieldId);
    return out(await nextContent(ctx, [`「${fieldName(rec, p.fieldId)}」の分野を一旦保留し、次へ進みます。`]));
  }
  if (action === 'retry') {
    if (fresh) await startIngest(env, rec, now, kick);
    return out(await nextContent(ctx));
  }
  if (action === 'a' && parts.length >= 5) return out(await answerParts(ctx, Number(a1), a2, a3 === 'g'));
  // n（学習を続ける）・q・m など前の版のURLも、次の学習へ進める
  return out(await nextContent(ctx));
}

/**
 * GET /p で始まるURLを処理する。advance は取り込みを時間の許す分だけ進める関数、kick は取り込みを裏で始める関数（app.js）。
 */
export async function pages(env, reqUrl, parts, now, advance, kick) {
  const base = env.PUBLIC_BASE_URL || reqUrl.origin;
  const { rec, res } = await route(env, base, parts, now, advance, kick);
  if (rec) await save(env, rec, now);
  return res;
}
