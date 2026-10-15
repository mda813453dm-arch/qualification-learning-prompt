// プロンプトだけで使う方式（pages.js）：利用開始時に取り込み、エンジンが出題・採点・記録する
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { handle } from '../src/app.js';
import { CATALOG } from '../src/catalog.js';
import { readJob } from '../src/ingest.js';
import { T0, assetsB64, fakeResult, fakeWeb, pdf } from './helpers.js';

const TOKEN = 'test-token';
const BASE = 'https://engine.example';

function srcOf(slug) {
  const c = CATALOG[slug];
  const s = c.sources[0];
  return { qualificationId: c.qualificationId, adapter: s.adapter, year: s.year, section: s.section, questionUrl: s.questionUrl, answerUrl: s.answerUrl ?? s.questionUrl };
}

function makeEnv() {
  const files = {};
  for (const slug of Object.keys(CATALOG)) {
    const s = CATALOG[slug].sources[0];
    files[s.questionUrl] = pdf(`${slug}-q-v1`);
    if (s.answerUrl) files[s.answerUrl] = pdf(`${slug}-a-v1`);
  }
  const web = fakeWeb(files);
  const counts = { parse: 0 };
  const env = { STORE: new MemoryStore(), API_TOKEN: TOKEN, fetchPdf: web.fetchPdf, now: T0, PARSER_URL: 'https://parser.example' };
  // 掲載ページを開けないときは台帳の確認済みURLを使う（発見処理は下のテストと discover.test.js で確かめる）
  env.fetchText = async () => {
    throw new Error('offline');
  };
  env.clock = () => env.now;
  env.parserFetch = async (url, init) => {
    counts.parse += 1;
    const b = JSON.parse(init.body);
    const bytes = (x) => Uint8Array.from(atob(x.base64), (c) => c.charCodeAt(0));
    const slug = b.adapter;
    const src = srcOf(slug);
    // 測量士補：問1〜6（分野 s1,s1,s2,s1,s2,s3）。宅建：問1〜50（分野 t1〜t7 を順に）
    const answers = slug === 'takken' ? Array.from({ length: 50 }, (_, i) => (i % 4) + 1) : [3, 1, 4, 2, 5, 1];
    const fieldIds = slug === 'takken' ? Array.from({ length: 50 }, (_, i) => `t${(i % 7) + 1}`) : ['s1', 's1', 's2', 's1', 's2', 's3'];
    const q = bytes(b.question);
    const r = await fakeResult({ src, qBytes: q, aBytes: b.answer ? bytes(b.answer) : q, answers, fieldIds, figureOn: slug === 'takken' ? [] : [2] });
    return new Response(JSON.stringify({ result: r.result, assets: assetsB64(r.assets) }));
  };
  return { env, web, counts };
}

async function get(env, path) {
  const res = await handle(new Request(path.startsWith('http') ? path : `${BASE}${path}`), env);
  assert.equal(res.status, 200);
  return res.text();
}

/** 「・ラベル：URL」の行からURLを取り出す。 */
function link(text, label) {
  const line = text.split('\n').find((l) => l.startsWith(`・${label}：`) || l.startsWith(`・${label}［`));
  assert.ok(line, `リンク「${label}」が無い:\n${text}`);
  return line.slice(line.lastIndexOf('：http') + 1);
}

const has = (text, label) => text.split('\n').some((l) => l.startsWith(`・${label}：`));

/** 資格選び → 概要 → （免除）→ 学習の段階 → 学習計画 → 開始の承認 → 初期診断を受けるか。 */
async function onboard(env, slug, { exempt, level = '4 過去問演習中', diagnose = false } = {}) {
  const start = await get(env, '/p');
  let t = await get(env, link(start, CATALOG[slug].name));
  assert.match(t, /■試験概要\n（ここに試験の概要を表示）/);
  if (exempt !== undefined) {
    assert.match(t, /免除制度を利用しますか？\n1\. 免除を利用する\n2\. 免除を利用しない\n番号で答えてください。/);
    t = await get(env, link(t, exempt ? '1 免除を利用する' : '2 免除を利用しない'));
  }
  assert.match(t, /今の学習の段階\n1：未着手\n2：基礎学習中\n3：応用学習中\n4：過去問演習中\n番号で答えてください。/);
  t = await get(env, link(t, level));
  assert.match(t, /【学習計画】/);
  assert.match(t, /試験日：（ここに試験日を表示）/);
  assert.match(t, /1\. この計画で開始する\n2\. 学習計画を見直す/);
  t = await get(env, link(t, '1 この計画で開始する'));
  assert.match(t, /この学習計画で学習を開始しますか？\n1\. 学習を開始する\n2\. 今は学習しない\n番号で答えてください。/);
  t = await get(env, link(t, '1 学習を開始する'));
  assert.match(t, /初期診断で苦手分野を確かめますか？/);
  const lid = /\/p\/([a-z2-9]{10})\//.exec(link(t, '1 初期診断を受ける'))[1];
  if (!diagnose) t = await get(env, link(t, '2 診断せずに始める'));
  return { page: t, lid };
}

const rec = (env, lid) => env.STORE.get(`lrn/${lid}`, 'json');

/** 分野の始め方（U07）を「実践問題から・以後も」、解説の確認（U14）を「省略・以後も」にして、最初の実践問題まで進む。 */
async function toPractice(env, slug, opts) {
  const o = await onboard(env, slug, opts);
  let t = o.page;
  assert.match(t, /■この分野はどう進めますか？\n1：解説あり（解説→確認問題→実践問題）\n2：確認問題から（解説なし）\n3：実践問題から（解説も確認問題もなし）/);
  t = await get(env, link(t, '3 以後も'));
  return { ...o, page: t };
}

function answerPick(q, n) {
  return link(q, `${n}と答えた`);
}

test('学習の流れ：概要→段階→計画→開始の承認→初期診断の確認。開始の承認前は出題しない', async () => {
  const { env } = makeEnv();
  const start = await get(env, '/p');
  let t = await get(env, link(start, CATALOG.surveyor.name));
  assert.doesNotMatch(t, /番号で答えてください。勘/);
  t = await get(env, link(t, '1 未着手'));
  assert.match(t, /分野の優先順位/);
  assert.doesNotMatch(t, /問1の本文/);
  t = await get(env, link(t, '1 この計画で開始する'));
  const notNow = await get(env, link(t, '2 今は学習しない'));
  assert.match(notNow, /学習は開始していません/);
  assert.doesNotMatch(notNow, /📘/);
});

test('学習計画は取り込んだ過去問の分野別出題数で分野の順番を決め、最初の分野と理由を示す', async () => {
  const { env } = makeEnv();
  const o = await onboard(env, 'surveyor');
  const plan = await get(env, `/p/${o.lid}/plan`);
  assert.match(plan, /根拠：公式の過去問6問（取り込み済みの2026年度）の分野別出題数の多い順/);
  assert.match(plan, /1\. 測量に関する法規（出題3問）\n　2\. 多角測量（出題2問）\n　3\. GNSS測量（出題1問）/);
  assert.match(plan, /最初に学ぶ分野：測量に関する法規（過去問で最も多く出題されている分野です）/);
  assert.match(plan, /同じ分野から3問ずつ、複数の年度にまたがって出題/);
});

test('初期診断：各分野2問を出し、公式の問題が足りない分野はAI作成問題で補い、結果から苦手分野の順に計画を作り直す', async () => {
  const { env } = makeEnv();
  const o = await onboard(env, 'surveyor', { diagnose: true });
  let t = await get(env, link(o.page, '1 初期診断を受ける'));
  assert.match(t, /📘 学習開始\n開始時刻：\d\d:\d\d（日本時間）\n開始内容：初期診断/);
  assert.match(t, /⚠️【重要：学習終了時は必ず『終わる』と入力してください】/);
  assert.match(t, /■初期診断 1\/16｜2026年度 問1/);
  // 測量に関する法規（s1）は2問とも不正解、多角測量（s2）は2問とも正解、GNSS測量（s3）は公式1問を正解し、残りはAI作成問題
  const correct = { 1: 3, 2: 1, 3: 4, 4: 2, 5: 5, 6: 1 };
  let guard = 0;
  while (!/【初期診断の結果（暫定評価）】/.test(t) && guard++ < 40) {
    const m = /■初期診断 \d+\/\d+｜2026年度 問(\d+)/.exec(t);
    if (m) {
      const n = Number(m[1]);
      const field = { 1: 's1', 2: 's1', 3: 's2', 4: 's1', 5: 's2', 6: 's3' }[n];
      t = await get(env, answerPick(t, field === 's1' ? (correct[n] % 5) + 1 : correct[n]));
      assert.match(t, /■採点\n(正解|不正解)です。\n正答：\d\n解答PDF：/);
    } else {
      assert.match(t, /AI作成の確認問題/);
      t = await get(env, link(t, '確認問題に正解した'));
    }
  }
  assert.match(t, /・測量に関する法規：回答2問／誤答2問／正答率0%/);
  assert.match(t, /・多角測量：回答2問／誤答0問／正答率100%/);
  assert.match(t, /学習の順番（誤答率の高い順）：\n　1\. 測量に関する法規/);
  assert.match(t, /・GNSS測量：回答2問／誤答0問/);
  assert.match(t, /　2\. 多角測量\n　3\. GNSS測量/, '同率（誤答0）は出題数の多い順（多角測量2問・GNSS測量1問）');
  assert.match(t, /1\. この診断結果で計画を作る\n2\. 追加診断\n3\. 分野順を自分で指定\n4\. 計画見直しへ戻る/);
  const r = await rec(env, o.lid);
  assert.equal(r.result.diag.answers.length, 16);
  assert.equal(r.result.diag.answers.filter((a) => a.source === 'ai').length, 11, '公式の問題がない分野はAI作成で補った');
  t = await get(env, link(t, '1 この診断結果で計画を作る'));
  assert.match(t, /初期診断の結果を学習計画に反映しました/);
  assert.match(t, /根拠：初期診断の結果/);
  assert.match(t, /最初に学ぶ分野：測量に関する法規（初期診断で誤答率が最も高い分野です）/);
  t = await get(env, link(t, '1 この計画で開始する'));
  assert.match(t, /📍測量に関する法規\n■この分野はどう進めますか？/);
  assert.doesNotMatch(t, /📘/, '同じセッションで開始表示を重ねない');
});

test('全問不正解・全問正解・同率・分母の違いの判定', async () => {
  const { diagnosisOrder } = await import('../src/study.js');
  const ids = ['a', 'b', 'c', 'd'];
  const W = (f) => ({ fieldId: f, result: 'wrong' });
  const C = (f) => ({ fieldId: f, result: 'confident_correct' });
  const allWrong = diagnosisOrder(ids, ids.flatMap((f) => [W(f), W(f), W(f)]), { a: 1, b: 5, c: 5, d: 2 });
  assert.equal(allWrong.allWrong, true);
  assert.deepEqual(allWrong.order, ['b', 'c', 'd', 'a'], '同率は出題数、次に公式の分野順');
  const allRight = diagnosisOrder(ids, ids.flatMap((f) => [C(f), C(f)]), {});
  assert.equal(allRight.allRight, true);
  assert.deepEqual(allRight.order, ids);
  const denom = diagnosisOrder(ids, [W('a'), C('a'), W('b'), C('b'), C('b'), C('b')], {});
  assert.deepEqual(denom.order.slice(0, 2), ['a', 'b'], '同じ誤答数でも誤答率（1/2 と 1/4）で比べる');
  assert.deepEqual(denom.undiagnosed, ['c', 'd']);
});

test('採点後は固定4行のあと「解説の確認」を番号で聞き、どちらを選んでも次の問題まで続けて出す', async () => {
  const { env } = makeEnv();
  const o = await toPractice(env, 'surveyor');
  let q = o.page;
  assert.match(q, /📘 学習開始\n開始時刻：\d\d:\d\d（日本時間）\n開始内容：公式過去問/);
  assert.match(q, /📍測量に関する法規\n■2026年度 問1/);
  assert.match(q, /問題PDF：https:\/\/www\.gsi\.go\.jp\/common\/000278974\.pdf/);
  assert.doesNotMatch(q, /正答：/);
  let r = await get(env, answerPick(q, 3));
  assert.match(r, /■採点\n正解です。\n正答：3\n解答PDF：https:\/\/www\.gsi\.go\.jp\/common\/000278975\.pdf\n\n■解説の確認\n1：解説を見る\n2：解説を省略して学習を続ける\n番号で答えてください。/);
  const withExp = await get(env, link(r, '1 解説を見る'));
  assert.match(withExp, /（ここに前の問題の解説を表示）[\s\S]*■2026年度 問2/);
  assert.match(withExp, /前の問題（2026年度 問1、正答3、利用者の答え3）の解説/);
  r = await get(env, answerPick(withExp, 1));
  q = await get(env, link(r, '2 以後も'));
  assert.match(q, /■2026年度 問4/, '同じ分野（s1）の3問目');
  r = await get(env, answerPick(q, 2));
  assert.doesNotMatch(r, /■解説の確認/, '「以後も」で毎回は聞かない');
  assert.match(r, /■採点\n正解です。[\s\S]*📍多角測量\n■2026年度 問3/, '3問セットが終わると次の分野へ');
});

test('同じ分野で3問続けて間違えると、次の実践問題を出さずに確認問題へ移り、正解で同じ分野へ戻る', async () => {
  const { env } = makeEnv();
  const o = await toPractice(env, 'surveyor');
  let t = o.page;
  t = await get(env, answerPick(t, 1)); // 問1 不正解
  t = await get(env, link(t, '2 以後も'));
  t = await get(env, answerPick(t, 2)); // 問2 不正解
  t = await get(env, answerPick(t, 1)); // 問4 不正解
  assert.match(t, /同じ分野（測量に関する法規）で3問連続不正解のため、確認問題で理解を補強します。/);
  assert.match(t, /■確認問題\n（ここにAIの解説と確認問題を表示）/);
  assert.doesNotMatch(t, /■2026年度 問/);
  let r = await rec(env, o.lid);
  assert.equal(r.result.wrongStreaks.s1, 3);
  // 確認問題を2回間違えてから正解
  t = await get(env, link(t, '確認問題に不正解だった'));
  assert.match(t, /前の確認問題で間違えた論点/);
  t = await get(env, link(t, '確認問題に正解した'));
  assert.match(t, /確認問題に正解しました。「測量に関する法規」の実践問題へ進みます。/);
  r = await rec(env, o.lid);
  assert.equal(r.result.wrongStreaks.s1, 0);
  assert.match(t, /すべて解き終えました|■2026年度 問/);
});

test('確認問題で3回続けて間違えると続け方を聞き、追加の1問も間違えたら分野を保留して次へ進む', async () => {
  const { env } = makeEnv();
  const o = await onboard(env, 'surveyor');
  let t = await get(env, link(o.page, '2 確認問題から'));
  assert.match(t, /■確認問題/);
  for (let i = 0; i < 3; i += 1) t = await get(env, link(t, '確認問題に不正解だった'));
  assert.match(t, /■確認問題の続け方\n1：短い解説を読み、別の確認問題へ進む\n2：この分野を一旦保留し、多角測量へ進む\n番号で答えてください。/);
  t = await get(env, link(t, '1 短い解説を読み、別の確認問題へ進む'));
  assert.match(t, /前提から短く説明してから/);
  t = await get(env, link(t, '確認問題に不正解だった'));
  assert.match(t, /「測量に関する法規」の分野を一旦保留し、次へ進みます。[\s\S]*📍多角測量/);
});

test('解説ありを選ぶと、解説→確認問題→実践問題の順に進む', async () => {
  const { env } = makeEnv();
  const o = await onboard(env, 'surveyor', { level: '1 未着手' });
  assert.match(o.page, /1：解説あり（解説→確認問題→実践問題）（おすすめ）/);
  let t = await get(env, link(o.page, '1 解説あり'));
  assert.match(t, /開始内容：解説/);
  assert.match(t, /まず「測量に関する法規」の分野の要点を解説してください/);
  t = await get(env, link(t, '確認問題に正解した'));
  assert.match(t, /■2026年度 問1/);
});

test('同じ回答のURLを2回開いても二重に数えない。古い問題のURLでは採点しない', async () => {
  const { env } = makeEnv();
  const o = await toPractice(env, 'surveyor');
  const ans = answerPick(o.page, 2);
  const first = await get(env, ans);
  const again = await get(env, ans);
  assert.match(again, /不正解です。/);
  const r = await rec(env, o.lid);
  assert.equal(Object.keys(r.engine.history).length, 1);
  assert.equal(r.result.wrongStreaks.s1, 1);
  await get(env, link(first, '2 解説を省略して学習を続ける'));
  const stale = await get(env, answerPick(o.page, 1));
  assert.match(stale, /もう受け付けていません/);
});

test('引継ぎIDで開くと記録を日本語で示し、承認するまで再開しない。終了すると学習ログと次回の文を出す', async () => {
  const { env } = makeEnv();
  const o = await toPractice(env, 'surveyor');
  let t = await get(env, answerPick(o.page, 1));
  env.now += 12 * 60 * 1000;
  t = await get(env, link(t, '学習を終える'));
  assert.match(t, /【今回の学習ログ】\n・学習時間：12分（開始 10:00／終了 10:12）\n・解いた問題：1問（正解0問）\n・学習した分野：測量に関する法規\n・誤答・弱点：測量に関する法規（誤答1問）/);
  assert.match(t, /・累計学習時間：12分/);
  const back = await get(env, `/p/${o.lid}`);
  assert.match(back, /【学習記録】/);
  assert.match(back, /成績：1問解答、うち正解0問/);
  assert.match(back, /弱点：2026年度 問1/);
  assert.match(back, /この内容から学習を再開しますか？\n1\. 学習を再開する\n2\. 今は学習しない/);
  assert.doesNotMatch(back, /問2の本文/);
  const resumed = await get(env, link(back, '1 再開する'));
  assert.match(resumed, /学習を再開します。/);
  assert.match(resumed, /■解説の確認/, '前回の回答待ちの画面から続ける');
  const paused = await get(env, link(back, '2 今は学習しない'));
  assert.match(paused, /今日はここまで/);
  assert.match(paused, new RegExp(`資格試験の勉強の続きをしたいです。[\\s\\S]*/p/${o.lid}\\n`));
});

test('学習計画の見直し：方法・復習・最優先の分野を変えると、計画を表示し直して開始を聞く', async () => {
  const { env } = makeEnv();
  const start = await get(env, '/p');
  let t = await get(env, link(start, CATALOG.surveyor.name));
  t = await get(env, link(t, '2 基礎学習中'));
  t = await get(env, link(t, '2 学習計画を見直す'));
  assert.match(t, /学習計画のどの部分を見直しますか？\n1\. 学習分野・優先順位\n2\. 学習方法・配分\n3\. 復習頻度・タイミング\n4\. その他\n5\. 戻る\n番号で答えてください。/);
  let m = await get(env, link(t, '2 学習方法・配分'));
  m = await get(env, link(m, '3 実践問題重視'));
  assert.match(m, /学習方法を「実践問題重視」にしました。/);
  assert.match(m, /進め方：実践問題重視/);
  let v = await get(env, link(m, '2 学習計画を見直す'));
  v = await get(env, link(v, '3 復習頻度・タイミング'));
  v = await get(env, link(v, '5 自分で間隔指定'));
  assert.match(v, /この画面で設定できるのは復習予定の記録です。指定時刻に自動通知・自動出題する機能は、現在のチャットでは利用できません。/);
  v = await get(env, link(v, '3 翌日・7日後・30日後'));
  assert.match(v, /復習：翌日・7日後・30日後/);
  let f = await get(env, link(v, '2 学習計画を見直す'));
  f = await get(env, link(f, '1 学習分野・優先順位'));
  f = await get(env, link(f, '3 優先する分野を自分で選ぶ'));
  f = await get(env, link(f, '6 写真測量'));
  assert.match(f, /「写真測量」を最優先にしました。[\s\S]*1\. 写真測量/);
  f = await get(env, link(f, '1 この計画で開始する'));
  f = await get(env, link(f, '1 学習を開始する'));
  f = await get(env, link(f, '2 診断せずに始める'));
  assert.match(f, /📍多角測量|📍測量に関する法規|📍GNSS測量/, '写真測量には公式の問題がないため、問題のある分野から出す');
  assert.match(f, /■2026年度 問/, '実践問題重視なので分野の始め方を聞かない');
  const r = await rec(env, f.match(/\/p\/([a-z2-9]{10})\//)[1]);
  assert.equal(r.result.reviewPattern, 'c3');
});

test('学習結果は訂正できるが、古い画面のリンクでは訂正しない', async () => {
  const { env } = makeEnv();
  const o = await toPractice(env, 'surveyor');
  let r = await get(env, answerPick(o.page, 1)); // 問1 不正解
  let q = await get(env, link(r, '2 以後も'));
  r = await get(env, answerPick(q, 1)); // 問2 正解
  const menu = await get(env, link(r, '学習メニュー'));
  const f = await get(env, link(menu, '3 記録を確認・訂正する'));
  const removeWeak = link(f, '弱点・復習から外す：2026年度 問1');
  const after = await get(env, removeWeak);
  assert.match(after, /2026年度 問1を弱点・復習から外しました/);
  let x = await rec(env, o.lid);
  assert.equal(Object.keys(x.engine.review).length, 0);
  assert.equal(Object.keys(x.engine.history).length, 2, '回答の履歴は残る');
  const ex = await get(env, link(after, '成績から除外する：2026年度 問2（2026-10-15）'));
  assert.match(ex, /問2の回答を成績から除外しました/);
  x = await rec(env, o.lid);
  assert.equal(Object.keys(x.engine.history).length, 1);
  assert.equal(x.fixed.qualificationId, 'q063', '固定情報は変わらない');
  const stale = await get(env, link(f, '学習の段階を「未着手」にする'));
  assert.match(stale, /この訂正はできませんでした/);
  x = await rec(env, o.lid);
  assert.equal(x.result.level, 4);
});

test('宅建で免除を利用すると、問46〜50は出題しない', async () => {
  const { env } = makeEnv();
  const o = await toPractice(env, 'takken', { exempt: true });
  let t = o.page;
  const seen = [];
  for (let i = 0; i < 60; i += 1) {
    if (/すべて解き終えました/.test(t)) break;
    const m = /■2025年度 問(\d+)/.exec(t);
    assert.ok(m, t);
    seen.push(Number(m[1]));
    t = await get(env, answerPick(t, (Number(m[1]) - 1) % 4 + 1));
    if (has(t, '2 以後も')) t = await get(env, link(t, '2 以後も'));
  }
  assert.equal(seen.length, 45);
  assert.ok(seen.every((n) => n <= 45));
  assert.equal(new Set(seen).size, 45);
});

test('過去問は学習者ごとに取り込み、期限なしで持つ（ほかの学習者とは共有しない）', async () => {
  const { env, counts } = makeEnv();
  const a = await toPractice(env, 'surveyor');
  assert.equal(counts.parse, 1, '資格を選んだ時点で取り込んでいる');
  const b = await onboard(env, 'surveyor');
  assert.equal(counts.parse, 2, '2人目は自分の分を取り込む');
  env.now += 30 * 24 * 60 * 60 * 1000; // 30日後
  const r = await get(env, answerPick(a.page, 3));
  const q2 = await get(env, link(r, '2 以後も'));
  assert.equal(counts.parse, 2, '30日たっても取り込み直さない');
  const fig = /図：(\S+)/.exec(q2)[1];
  assert.match(fig, new RegExp(`/v1/figure/own/${a.lid}/`));
  const img = await handle(new Request(fig), env);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.notEqual(a.lid, b.lid);
});

test('システムで過去問を取り込めないときは、AI作成問題と過去問PDFの添付に切り替え、やり直すこともできる', async () => {
  const { env } = makeEnv();
  const ok = env.parserFetch;
  env.parserFetch = async () => new Response('down', { status: 500 });
  const o = await onboard(env, 'surveyor', { level: '4 過去問演習中' });
  const q = o.page;
  assert.match(q, /AI作成問題（公式の過去問ではありません）/);
  assert.match(q, /PDFを取得し、このチャットに添付/);
  assert.match(q, /公式の過去問掲載ページ：https:\/\/www\.gsi\.go\.jp\/LAW\/SHIKEN\/past\.html/);
  env.parserFetch = ok;
  const again = await get(env, link(q, 'もう一度、公式の過去問を取りに行く'));
  assert.match(again, /■この分野はどう進めますか？/);
  assert.match(await get(env, link(again, '3 実践問題から')), /2026年度 問1/);
});

test('台帳にない資格・形の違う引継ぎIDは資格選びに戻す', async () => {
  const { env } = makeEnv();
  const t = await get(env, '/p/ABC/go/surveyor');
  assert.match(t, /学びたい資格の名前を入力してください/);
  const u = await get(env, '/p/abcdefghjk/go/unknown');
  assert.match(u, /学びたい資格の名前を入力してください/);
});

test('一覧にない資格は、AI作成問題と過去問PDFの添付で学習する', async () => {
  const { env } = makeEnv();
  const t = await get(env, link(await get(env, '/p'), '上にない資格'));
  assert.match(t, /AI作成問題（公式の過去問ではありません）/);
  assert.match(t, /学習記録はシステムに残りません/);
  assert.match(t, /公式以外のサイトは示さないでください/);
  assert.match(t, /資格名を入力し直す/);
});

test('資格を選ぶと公式の掲載ページから過去問PDFを探し、問題が2つに分かれた年度はそれぞれ取り込み元にする', async () => {
  const { env } = makeEnv();
  const opened = [];
  env.fetchText = async (u) => {
    opened.push(u);
    return `<td>令和8年5月17日</td><a href="/common/1.pdf">解答用紙</a><a href="/common/a8q.pdf">問題</a><a href="/common/a8a.pdf">解答一覧</a>
<td>令和7年5月18日</td><a href="/common/2.pdf">解答用紙</a><a href="/common/a7q1.pdf">問題1</a><a href="/common/a7q2.pdf">問題2</a><a href="/common/a7a.pdf">解答一覧</a>`;
  };
  const start = await get(env, '/p');
  const t = await get(env, link(start, CATALOG.surveyor.name));
  const lid = /\/p\/([a-z2-9]{10})\//.exec(t)[1];
  assert.deepEqual(opened, ['https://www.gsi.go.jp/LAW/SHIKEN/past.html']);
  const job = await readJob(env.STORE, `q063~${lid}`);
  assert.deepEqual(job.sources.map((s) => [s.year, s.questionUrl.split('/').pop(), s.answerUrl.split('/').pop()]), [
    [2026, 'a8q.pdf', 'a8a.pdf'],
    [2025, 'a7q1.pdf', 'a7a.pdf'],
    [2025, 'a7q2.pdf', 'a7a.pdf'],
  ]);
});

test('資格名は自由入力にし、一覧は見せずに呼び方つきのURLだけを渡す', async () => {
  const { env } = makeEnv();
  const t = await get(env, '/p');
  const shown = t.split('【表示】')[1].split('【次に開くURL】')[0];
  assert.match(shown, /学びたい資格の名前を入力してください/);
  assert.doesNotMatch(shown, /1\. 宅地建物取引士/);
  assert.match(t, /選択肢の一覧は見せないでください/);
  assert.match(t, /宅地建物取引士（宅建）［呼び方：宅建、宅建士/);
  assert.match(t, /上にない資格：/);
});

test('robots.txt でページの取得を許可する（AIアプリが次のページを開けるように）', async () => {
  const { env } = makeEnv();
  const r = await handle(new Request('https://engine.example/robots.txt'), env);
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /Allow: \/p/);
  assert.match(body, /Disallow: \/\n/);
});
