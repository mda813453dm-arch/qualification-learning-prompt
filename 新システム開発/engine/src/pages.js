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
 * 学習記録（総合仕様書 13・14章）：lrn/<引継ぎID> に期限なしで保存する。
 * - fixed：システムが持つ固定情報（資格・版）。利用者からは変えられない。公式の正答は出題時に engine.current に控え、利用者からは変えられない。
 * - result：学習結果（段階・免除・連続誤答・除外した回答）。利用者が訂正できる。
 * - engine：エンジンの状態（回答の履歴・復習予定・出題中の問）。履歴と復習予定は、利用者の訂正で外せる。
 * 問題本文・会話・個人情報は保存しない。
 */
import { availablePackets, grade, jstToday, newState, pickNext, pin, present, SET_SIZE } from './engine.js';
import { startJob } from './ingest.js';
import { discover } from './discover.js';
import { CATALOG, LEVELS } from './catalog.js';

export const SYSTEM_ID = 'qlp';
export const SCHEMA_VERSION = 1;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const LID = /^[a-z2-9]{10}$/;
const PAGE_BUDGET_MS = 8000;
const WRONG_STREAK = 3;
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
  '・「表示」の内容は、言い換えたり省いたりせずに利用者へ見せてください。',
  '・利用者の答えに合うURLを「次に開くURL」から選び、すぐ開いてください。URLを自分で作ったり書き換えたりしないでください。',
  '・問題・選択肢・正答・採点は、このエンジンが返したものだけを使ってください。',
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

function page({ show = [], ai = [], links = [] }) {
  const out = [...HEAD, ...ai.map((x) => `・${x}`), '', '【表示】', ...show];
  if (links.length) {
    out.push('', '【次に開くURL】');
    for (const [label, url] of links) out.push(`・${label}：${url}`);
  }
  return new Response(`${out.join('\n')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
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

const url = (base, rec, ...rest) => [`${base}/p/${rec.fixed.lid}`, ...rest].join('/');
const resumeLine = (base, rec) => `引継ぎID：${rec.fixed.lid}（学習を終えるときに、次回貼る文を表示します）`;

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
    ai: ['利用者に、学びたい資格を選んでもらってください。一覧にない資格のときは「上にない資格」のURLを開いてください。'],
    show: [...lead, '資格学習を始めます。学びたい資格を選んでください。', ...Object.values(CATALOG).map((c, i) => `${i + 1}. ${c.name}`)],
    links: [...Object.entries(CATALOG).map(([slug, c]) => [c.name, `${base}/p/${lid}/go/${slug}`]), ['上にない資格', `${base}/p/${lid}/other`]],
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

function planText(rec) {
  const c = CATALOG[rec.fixed.slug];
  const start = LEVELS[rec.result.level]?.start ?? 'practice';
  const lines = [
    `【学習計画】${c.name}`,
    start === 'explain' ? '1. まず解説で、出題分野ごとの基本を確かめます。' : '1. 公式の過去問を、新しい年度から順に解きます。',
    `2. 公式の過去問を、同じ分野から${SET_SIZE}問ずつ続けて解き、エンジンが採点します。苦手な分野ほど多く出題します。`,
    '3. 間違えた問題は、1日後・3日後・7日後・14日後・30日後に復習として出題します。',
    `4. 同じ分野で${WRONG_STREAK}問続けて間違えたら、基本を確かめる確認問題に切り替えるかをお聞きします。`,
  ];
  if (rec.result.exempt && c.exemption) lines.push(`※ ${c.exemption.label}を利用するため、該当する問題は出題しません。`);
  return lines;
}

function menu(base, rec, now, lead = []) {
  const t = bump(rec);
  const s = stats(rec, now);
  return page({
    ai: ['利用者に、学習の方法を番号で選んでもらってください。学習記録を直したいと言われたら「記録を確認・訂正する」を開いてください。'],
    show: [
      ...lead,
      `これまで：${s.answered}問解答、うち正解${s.correct}問。今日の復習：${s.due}問。`,
      '学習の方法を選んでください。',
      '1. 解説',
      '2. 確認問題',
      '3. 実践問題（公式の過去問）',
      '',
      resumeLine(base, rec),
    ],
    links: [
      ['1 解説', url(base, rec, 'm', 'explain', t)],
      ['2 確認問題', url(base, rec, 'm', 'check', t)],
      ['3 実践問題', url(base, rec, 'q', t)],
      ['記録を確認・訂正する', url(base, rec, 'fix', t)],
      ['学習を終える', url(base, rec, 'end', t)],
    ],
  });
}

/** 引継ぎIDで開いたとき：内容を日本語で示し、再開の承認を求める（読み込んだだけでは再開しない）。 */
function resumePage(base, rec, now) {
  const t = bump(rec);
  const c = CATALOG[rec.fixed.slug];
  const s = stats(rec, now);
  const weak = weakList(rec).slice(0, 5).map((x) => label(x.h));
  return page({
    ai: ['利用者に、再開するかを番号で選んでもらってください。'],
    show: [
      '【学習記録】',
      `・資格：${c.name}`,
      `・学習の段階：${LEVELS[rec.result.level]?.label ?? '未設定'}`,
      `・免除：${c.exemption ? (rec.result.exempt ? `利用する（${c.exemption.label}）` : '利用しない') : '制度なし'}`,
      `・成績：${s.answered}問解答、うち正解${s.correct}問`,
      `・復習対象：${s.reviews}問（今日が復習日：${s.due}問）`,
      `・弱点：${weak.length ? weak.join('、') : 'なし'}`,
      `・次回：${s.due ? '復習から' : '公式の過去問の続きから'}`,
      '',
      '1. 学習を再開する',
      '2. 今は学習しない',
      '3. 記録を訂正する',
    ],
    links: [['1 再開する', url(base, rec, 'resume', t)], ['2 今は学習しない', url(base, rec, 'pause', t)], ['3 訂正する', url(base, rec, 'fix', t)]],
  });
}

/** 学習結果の訂正（固定情報と公式の正答は変えられない）。 */
function fixPage(base, rec, lead = []) {
  const t = bump(rec);
  const c = CATALOG[rec.fixed.slug];
  const links = [];
  const show = [...lead, '直したい内容を選んでください。資格と公式の正答は変更できません。'];
  for (const [k, v] of Object.entries(LEVELS)) {
    if (Number(k) !== rec.result.level) links.push([`学習の段階を「${v.label}」にする`, url(base, rec, 'fx', t, 'lv', k)]);
  }
  if (c.exemption) links.push([rec.result.exempt ? '免除を利用しないに変える' : '免除を利用するに変える', url(base, rec, 'fx', t, 'ex', rec.result.exempt ? 0 : 1)]);
  const weak = weakList(rec).slice(0, FIX_LIST);
  weak.forEach((x, i) => links.push([`弱点・復習から外す：${label(x.h)}`, url(base, rec, 'fx', t, 'rv', i)]));
  const answered = recentAnswers(rec);
  answered.forEach((x, i) => links.push([`成績から除外する：${label(x.h)}（${x.h.answeredAt}）`, url(base, rec, 'fx', t, 'hx', i)]));
  links.push(['学習方法に戻る', url(base, rec, 'menu', t)]);
  show.push('（利用者の言葉に合う項目のURLを開いてください。合う項目がなければ、できない訂正であることを伝えてください。）');
  return page({ ai: ['利用者が直したい内容を聞き、「次に開くURL」から合うものを開いてください。'], show, links });
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

async function questionPage(env, base, rec, now, advance) {
  const c = CATALOG[rec.fixed.slug];
  const job = await advance(env, jobId(rec), now, PAGE_BUDGET_MS);
  const skip = new Set(rec.result.exempt && c.exemption ? c.exemption.numbers : []);
  const items = (await availablePackets(env.STORE, job, now)).filter((x) => !skip.has(x.packet.questionNumber));
  const pick = pickNext(rec.engine, items, { today: jstToday(now), job });
  const t = bump(rec);
  if (pick.status === 'waiting') {
    return page({
      ai: ['取り込みが終わるまで、利用者が望めば解説をしてください。そのあと「もう一度」のURLを開いてください。'],
      show: ['公式の過去問を取り込んでいます。少し待ってから、もう一度開きます。', ...(job?.notice ? [job.notice] : [])],
      links: [['もう一度', url(base, rec, 'q', t)], ['学習方法に戻る', url(base, rec, 'menu', t)]],
    });
  }
  if (pick.status === 'finished' && job?.state === 'failed' && !Object.keys(rec.engine.history ?? {}).length) {
    return page({
      ai: fallbackAi(c.pastExamPage),
      show: [
        '公式の過去問をシステムで取り込めませんでした。AIが作成した問題で練習を続けます。',
        '公式の過去問を使いたいときは、次の公式掲載ページから問題と正答のPDFを取得し、このチャットに添付してください。それを使って出題します。',
        `公式の過去問掲載ページ：${c.pastExamPage}`,
        ...(job?.notice ? [job.notice] : []),
      ],
      links: [['もう一度、公式の過去問を取りに行く', url(base, rec, 'retry', t)], ['学習方法に戻る', url(base, rec, 'menu', t)]],
    });
  }
  if (pick.status === 'finished') {
    return page({
      show: [job?.state === 'failed' ? '公式の過去問を取り込めませんでした。時間をおいて、もう一度お試しください。' : '取り込んだ公式の過去問を、すべて解き終えました。復習の日になると、復習の問題が出ます。'],
      links: [['学習方法に戻る', url(base, rec, 'menu', t)]],
    });
  }
  if (!pick.repeated) rec.qn += 1;
  rec.engine = pin(rec.engine, pick.item, pick.kind, now);
  const q = present(pick.item, pick.kind, `${base}/v1/figure`);
  const pdfPages = q.questionPdfPages.length ? `（${q.questionPdfPages.join('・')}ページ）` : '';
  const links = q.choices.map((_, i) => [`${i + 1}と答えた`, url(base, rec, 'a', rec.qn, i + 1)]);
  links.push(...q.choices.map((_, i) => [`${i + 1}と答え「勘」と言った`, url(base, rec, 'a', rec.qn, i + 1, 'g')]));
  links.push(['学習方法に戻る', url(base, rec, 'menu', t)]);
  return page({
    ai: [
      '図は ![図](URL) の形で画像として表示してください。',
      '利用者が番号以外を聞いたときは、採点せずに質問に答え、同じ問題に戻ってください。正答はほのめかさないでください。',
    ],
    show: [
      `${q.year}年度 問${q.questionNumber}${q.kind === 'review' ? '（復習）' : ''}`,
      '',
      q.stem,
      ...q.figures.map((f) => `図：${f.url}`),
      '',
      ...q.choices.map((ch, i) => `${i + 1}. ${ch}`),
      '',
      `原本（公式PDF）${pdfPages}：${q.questionPdfUrl}`,
      ...q.notices,
      '',
      '番号で答えてください。勘で選んだときは「勘」と添えてください。',
    ],
    links,
  });
}

function answerPage(base, rec, qn, value, guess, now) {
  const t = bump(rec);
  const back = [['次の問題', url(base, rec, 'q', t)], ['学習方法に戻る', url(base, rec, 'menu', t)]];
  if (qn !== rec.qn || !rec.engine.current) return page({ show: ['この問題の回答はもう受け付けていません。次の問題へ進みます。'], links: back });
  const r = grade(rec.engine, { questionId: rec.engine.current.questionId, value, confidence: guess ? 'guess' : 'sure' }, { today: jstToday(now), now });
  if (!r.ok) return page({ show: ['答えの番号が選択肢にありません。もう一度番号で答えてください。'], links: back.slice(1) });
  const g = r.grade;
  const fieldId = rec.engine.current.fieldId ?? 'unknown';
  const streaks = (rec.result.wrongStreaks ??= {});
  if (!g.alreadyGraded) {
    rec.engine = r.state;
    streaks[fieldId] = g.correct ? 0 : (streaks[fieldId] ?? 0) + 1;
  }
  const show = [
    g.correct ? (g.result === 'guess_correct' ? '正解です（勘で正解）。' : '正解です。') : '不正解です。',
    `あなたの答え：${g.selected}　正答：${g.correctAnswer}`,
  ];
  if (g.answerPdfUrl) show.push(`公式の正答：${g.answerPdfUrl}`);
  const links = [...back];
  if (!g.correct && (streaks[fieldId] ?? 0) >= WRONG_STREAK) {
    const fieldName = CATALOG[rec.fixed.slug].fields?.[fieldId];
    show.push('', `${fieldName ? `「${fieldName}」の分野で` : '同じ分野で'}${streaks[fieldId]}問続けて間違えました。基本を確かめる確認問題に切り替えますか？`);
    links.unshift(['確認問題に切り替える', url(base, rec, 'm', 'check', t)]);
  }
  return page({
    ai: ['表示のあと、この問題を解説してください。解説はあなたが書くものなので「AIによる解説（公式の解説ではありません）」と書いてください。結論 → 身近な例 → 試験のポイント → 短い覚え方 の順で、やさしく書いてください。'],
    show,
    links,
  });
}

function modePage(base, rec, mode) {
  const t = bump(rec);
  const c = CATALOG[rec.fixed.slug];
  const ai = mode === 'explain'
    ? [`${c.name}の、利用者が学びたい分野（決まっていなければ、直前に間違えた問題の分野、それもなければ公式の出題分野の最初）を解説してください。根拠は公式資料・法令などの一次資料にしてください。結論 → 身近な例 → 試験のポイント → 短い覚え方 の順で書いてください。終わったら、続けるか学習方法に戻るかを聞いてください。`]
    : [`${c.name}の基本を確かめる短い確認問題を1問作って出してください。必ず「AIが作った確認問題（公式の過去問ではありません）」と書いてください。利用者が答えたら、あなたが採点と解説をしてください。この確認問題はエンジンの成績には入りません。終わったら、続けるか学習方法に戻るかを聞いてください。`];
  return page({
    ai,
    show: [mode === 'explain' ? '解説を始めます。' : '確認問題を始めます。'],
    links: [['学習方法に戻る', url(base, rec, 'menu', t)], ['実践問題へ', url(base, rec, 'q', t)]],
  });
}

function levelPage(base, rec, lead = [], ai = []) {
  return page({
    ai,
    show: [...lead, ...(lead.length ? [''] : []), 'いまの学習状況を選んでください。', ...Object.entries(LEVELS).map(([k, v]) => `${k}. ${v.label}`)],
    links: Object.entries(LEVELS).map(([k, v]) => [`${k} ${v.label}`, url(base, rec, 'lv', k)]),
  });
}

function exemptionPage(base, rec, lead = [], ai = []) {
  const c = CATALOG[rec.fixed.slug];
  return page({
    ai,
    show: [...lead, ...(lead.length ? [''] : []), `公式の免除制度があります：${c.exemption.label}。利用しますか？`, '1. 利用する', '2. 利用しない'],
    links: [['1 利用する', url(base, rec, 'ex', 1)], ['2 利用しない', url(base, rec, 'ex', 0)]],
  });
}

function planPage(base, rec) {
  return page({
    show: [...planText(rec), '', 'この学習計画で始めますか？', '1. 始める', '2. 学習状況を選び直す'],
    links: [['1 始める', url(base, rec, 'ok')], ['2 選び直す', url(base, rec, 'relevel')]],
  });
}

/** 導入の途中で別のURLが開かれたときは、導入の続きに戻す。 */
function onboarding(base, rec) {
  if (rec.result.step === 'exemption') return exemptionPage(base, rec);
  if (rec.result.step === 'level') return levelPage(base, rec);
  return planPage(base, rec);
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
      '利用者に、学びたい資格の名前を聞いてください。',
      ...fallbackAi(null),
      'この資格の学習記録はシステムに残りません。そのことを利用者に伝えてください。',
    ],
    show: ['この資格は、まだシステムで公式の過去問を取り込めません。AIが作成した問題で学習します。', '公式の過去問を使いたいときは、公式の掲載ページをご案内します。そこから問題と正答のPDFを取得して、このチャットに添付してください。', '学びたい資格の名前を教えてください。'],
    links: [['資格の一覧に戻る', `${base}/p/${lid}`]],
  });
}

async function route(env, base, parts, now, advance, kick) {
  if (parts.length === 1) return { res: chooseQualification(base, newLearnerId()) };
  const lid = parts[1];
  if (!LID.test(lid)) return { res: chooseQualification(base, newLearnerId()) };
  let rec = await load(env, lid);
  const [, , action, a1, a2, a3] = parts;

  if (action === 'go' && parts.length === 4 && CATALOG[a1]) {
    if (rec && rec.fixed.slug === a1) return { rec, res: rec.result.step === 'ready' ? resumePage(base, rec, now) : onboarding(base, rec) };
    if (rec) return { res: chooseQualification(base, newLearnerId(), [`この引継ぎIDは${CATALOG[rec.fixed.slug].name}の記録です。別の資格は新しい引継ぎIDで始めます。`]) };
    rec = newRecord(lid, a1, now);
    const c = CATALOG[a1];
    await startIngest(env, rec, now, kick);
    const lead = [`${c.name}の学習を始めます。`, '（ここに試験の概要を表示）', '', resumeLine(base, rec)];
    const ai = [`「（ここに試験の概要を表示）」の部分には、公式サイト（${c.officialSite}）で確認できた試験の概要（対象・出題分野・形式・時間・合格基準）を書いてください。確認できなかった項目は「未確認」と書いてください。`];
    return { rec, res: c.exemption ? exemptionPage(base, rec, lead, ai) : levelPage(base, rec, lead, ai) };
  }

  if (action === 'other' && !rec) return { res: otherQualification(base, lid) };
  if (!rec) return { res: chooseQualification(base, lid) };
  const step = rec.result.step;

  if (action === undefined) return { rec, res: step === 'ready' ? resumePage(base, rec, now) : onboarding(base, rec) };
  if (action === 'ex' && step === 'exemption' && (a1 === '0' || a1 === '1')) {
    rec.result.exempt = a1 === '1';
    rec.result.step = 'level';
    return { rec, res: levelPage(base, rec) };
  }
  if (action === 'lv' && step === 'level' && LEVELS[a1]) {
    rec.result.level = Number(a1);
    rec.result.step = 'plan';
    return { rec, res: planPage(base, rec) };
  }
  if (action === 'relevel' && step === 'plan') {
    rec.result.step = 'level';
    return { rec, res: levelPage(base, rec) };
  }
  if (action === 'ok' && step === 'plan') {
    rec.result.step = 'ready';
    return { rec, res: menu(base, rec, now, ['学習計画を承認しました。']) };
  }
  if (step !== 'ready') return { rec, res: onboarding(base, rec) };

  if (action === 'resume') return { rec, res: menu(base, rec, now, ['学習を再開します。']) };
  if (action === 'pause' || action === 'end') {
    return { rec, res: page({ ai: ['「----」で囲まれた文は、利用者がコピーしやすいように、そのままの形で表示してください。'], show: ['お疲れさまでした。今日はここまでにします。', '', ...personalPrompt(base, rec)] }) };
  }
  if (action === 'fix' && parts.length === 4) return { rec, res: fixPage(base, rec) };
  if (action === 'fx') {
    // 古い画面のリンク（番号が今と違う）では訂正しない
    const done = Number(a1) === rec.tick ? applyFix(rec, a2, a3) : null;
    return { rec, res: fixPage(base, rec, [done ?? 'この訂正はできませんでした。もう一度選んでください。']) };
  }
  if (action === 'm' && (a1 === 'explain' || a1 === 'check')) return { rec, res: modePage(base, rec, a1) };
  if (action === 'retry') {
    if (Number(a1) === rec.tick) await startIngest(env, rec, now, kick);
    return { rec, res: await questionPage(env, base, rec, now, advance) };
  }
  if (action === 'q') return { rec, res: await questionPage(env, base, rec, now, advance) };
  if (action === 'a' && parts.length >= 5) return { rec, res: answerPage(base, rec, Number(a1), a2, a3 === 'g', now) };
  return { rec, res: menu(base, rec, now) };
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
