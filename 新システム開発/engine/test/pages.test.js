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
    const answers = slug === 'takken' ? Array.from({ length: 50 }, (_, i) => (i % 4) + 1) : [3, 1, 4];
    const q = bytes(b.question);
    const r = await fakeResult({ src, qBytes: q, aBytes: b.answer ? bytes(b.answer) : q, answers, figureOn: slug === 'takken' ? [] : [2] });
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
  const line = text.split('\n').find((l) => l.startsWith(`・${label}：`));
  assert.ok(line, `リンク「${label}」が無い:\n${text}`);
  return line.slice(line.lastIndexOf('：http') + 1);
}

async function onboard(env, slug, { exempt } = {}) {
  const start = await get(env, '/p');
  let t = await get(env, link(start, CATALOG[slug].name));
  assert.match(t, /（ここに試験の概要を表示）/);
  if (exempt !== undefined) t = await get(env, link(t, exempt ? '1 利用する' : '2 利用しない'));
  t = await get(env, link(t, '2 基礎は学んだ'));
  assert.match(t, /この学習計画で始めますか？/);
  t = await get(env, link(t, '1 始める'));
  assert.match(t, /学習計画を承認しました/);
  const lid = /\/p\/([a-z2-9]{10})\//.exec(link(t, '3 実践問題'))[1];
  return { menu: t, lid };
}

test('資格を選んだ時点で取り込みを始め、採点はエンジンが行う（正答は出題画面に出ない）', async () => {
  const { env, counts } = makeEnv();
  const { menu } = await onboard(env, 'surveyor');
  const parsed = counts.parse;
  assert.equal(parsed, 1, '資格を選んだ時点で取り込んでいる');
  const q = await get(env, link(menu, '3 実践問題'));
  assert.match(q, /2026年度 問1/);
  assert.match(q, /問1の本文/);
  assert.doesNotMatch(q, /正答：/);
  assert.match(q, /原本（公式PDF）/);
  const r = await get(env, link(q, '3と答えた'));
  assert.match(r, /正解です。/);
  assert.match(r, /正答：3/);
  assert.equal(counts.parse, parsed, '利用時に分解し直していない');

  // 図のある問2
  const q2 = await get(env, link(r, '次の問題'));
  assert.match(q2, /問2/);
  assert.match(q2, /図：https:\/\/engine\.example\/v1\/figure\//);
});

test('同じ回答のURLを2回開いても二重に数えない。古い問題のURLでは採点しない', async () => {
  const { env } = makeEnv();
  const { menu, lid } = await onboard(env, 'surveyor');
  const q = await get(env, link(menu, '3 実践問題'));
  const ans = link(q, '2と答えた');
  await get(env, ans);
  const again = await get(env, ans);
  assert.match(again, /不正解です。/);
  const rec = await env.STORE.get(`lrn/${lid}`, 'json');
  assert.equal(Object.keys(rec.engine.history).length, 1);
  assert.equal(rec.result.wrongStreak, 1);
  // 次の問題を出したあと、前の問題の回答URLを開く
  await get(env, link(again, '次の問題'));
  const stale = await get(env, link(q, '1と答えた'));
  assert.match(stale, /もう受け付けていません/);
});

test('3問続けて間違えると確認問題への切り替えを勧める', async () => {
  const { env } = makeEnv();
  const { menu } = await onboard(env, 'surveyor');
  let page = menu;
  let label = '3 実践問題';
  const wrong = { 1: '1と答えた', 2: '2と答えた', 3: '1と答えた' };
  for (let n = 1; n <= 3; n += 1) {
    const q = await get(env, link(page, label));
    page = await get(env, link(q, wrong[n]));
    label = '次の問題';
  }
  assert.match(page, /3問続けて間違えました/);
  link(page, '確認問題に切り替える');
});

test('引継ぎIDで開くと記録を日本語で示し、承認するまで再開しない', async () => {
  const { env } = makeEnv();
  const { menu, lid } = await onboard(env, 'surveyor');
  const q = await get(env, link(menu, '3 実践問題'));
  await get(env, link(q, '1と答えた'));
  const back = await get(env, `/p/${lid}`);
  assert.match(back, /【学習記録】/);
  assert.match(back, /成績：1問解答、うち正解0問/);
  assert.match(back, /弱点：2026年度 問1/);
  assert.doesNotMatch(back, /3 実践問題/);
  const resumed = await get(env, link(back, '1 再開する'));
  assert.match(resumed, /学習を再開します/);
  const paused = await get(env, link(back, '2 今は学習しない'));
  assert.match(paused, /今日はここまで/);
  assert.match(paused, new RegExp(`資格試験の勉強の続きをしたいです。[\\s\\S]*/p/${lid}\\n`));
});

test('学習結果は訂正できるが、古い画面のリンクでは訂正しない', async () => {
  const { env } = makeEnv();
  const { menu, lid } = await onboard(env, 'surveyor');
  let q = await get(env, link(menu, '3 実践問題'));
  let r = await get(env, link(q, '1と答えた')); // 問1 不正解
  q = await get(env, link(r, '次の問題'));
  r = await get(env, link(q, '1と答えた')); // 問2 正解
  const fix = await get(env, link(r, '学習方法に戻る'));
  const f = await get(env, link(fix, '記録を確認・訂正する'));
  const removeWeak = link(f, '弱点・復習から外す：2026年度 問1');
  const after = await get(env, removeWeak);
  assert.match(after, /2026年度 問1を弱点・復習から外しました/);
  let rec = await env.STORE.get(`lrn/${lid}`, 'json');
  assert.equal(Object.keys(rec.engine.review).length, 0);
  assert.equal(Object.keys(rec.engine.history).length, 2, '回答の履歴は残る');

  const ex = await get(env, link(after, '成績から除外する：2026年度 問2（2026-10-15）'));
  assert.match(ex, /問2の回答を成績から除外しました/);
  rec = await env.STORE.get(`lrn/${lid}`, 'json');
  assert.equal(Object.keys(rec.engine.history).length, 1);
  assert.equal(rec.result.excluded.length, 1);
  assert.equal(rec.fixed.qualificationId, 'q063', '固定情報は変わらない');

  // 前の画面（removeWeak を含む f）のリンクはもう使えない
  const stale = await get(env, link(f, '学習の段階を「これから始める」にする'));
  assert.match(stale, /この訂正はできませんでした/);
  rec = await env.STORE.get(`lrn/${lid}`, 'json');
  assert.equal(rec.result.level, 2);
});

test('宅建で免除を利用すると、問46〜50は出題しない', async () => {
  const { env } = makeEnv();
  const { menu, lid } = await onboard(env, 'takken', { exempt: true });
  const rec = await env.STORE.get(`lrn/${lid}`, 'json');
  assert.equal(rec.result.exempt, true);
  let page = menu;
  let label = '3 実践問題';
  const seen = [];
  for (let i = 0; i < 46; i += 1) {
    const q = await get(env, link(page, label));
    if (/すべて解き終えました/.test(q)) break;
    seen.push(Number(/2025年度 問(\d+)/.exec(q)[1]));
    page = await get(env, link(q, '1と答えた'));
    label = '次の問題';
  }
  assert.equal(seen.length, 45);
  assert.ok(seen.every((n) => n <= 45));
});

test('過去問は学習者ごとに取り込み、期限なしで持つ（ほかの学習者とは共有しない）', async () => {
  const { env, counts } = makeEnv();
  const a = await onboard(env, 'surveyor');
  assert.equal(counts.parse, 1);
  const b = await onboard(env, 'surveyor');
  assert.equal(counts.parse, 2, '2人目は自分の分を取り込む');

  env.now += 30 * 24 * 60 * 60 * 1000; // 30日後
  const q1 = await get(env, link(a.menu, '3 実践問題'));
  assert.match(q1, /問1の本文/);
  const r = await get(env, link(q1, '3と答えた'));
  const q2 = await get(env, link(r, '次の問題'));
  assert.equal(counts.parse, 2, '30日たっても取り込み直さない');
  const fig = /図：(\S+)/.exec(q2)[1];
  assert.match(fig, new RegExp(`/v1/figure/own/${a.lid}/`));
  const img = await handle(new Request(fig), env);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.notEqual(a.lid, b.lid);
});

test('台帳にない資格・形の違う引継ぎIDは資格選びに戻す', async () => {
  const { env } = makeEnv();
  const t = await get(env, '/p/ABC/go/surveyor');
  assert.match(t, /学びたい資格を選んでください/);
  const u = await get(env, '/p/abcdefghjk/go/unknown');
  assert.match(u, /学びたい資格を選んでください/);
});

test('システムで過去問を取り込めないときは、AI作成問題と過去問PDFの添付に切り替え、やり直すこともできる', async () => {
  const { env } = makeEnv();
  const ok = env.parserFetch;
  env.parserFetch = async () => new Response('down', { status: 500 });
  const { menu } = await onboard(env, 'surveyor');
  const q = await get(env, link(menu, '3 実践問題'));
  assert.match(q, /AI作成問題（公式の過去問ではありません）/);
  assert.match(q, /PDFを取得し、このチャットに添付/);
  assert.match(q, /公式の過去問掲載ページ：https:\/\/www\.gsi\.go\.jp\/LAW\/SHIKEN\/past\.html/);
  env.parserFetch = ok;
  const again = await get(env, link(q, 'もう一度、公式の過去問を取りに行く'));
  assert.match(again, /2026年度 問1/);
});

test('一覧にない資格は、AI作成問題と過去問PDFの添付で学習する', async () => {
  const { env } = makeEnv();
  const t = await get(env, link(await get(env, '/p'), '上にない資格'));
  assert.match(t, /AI作成問題（公式の過去問ではありません）/);
  assert.match(t, /学習記録はシステムに残りません/);
  assert.match(t, /公式以外のサイトは示さないでください/);
  assert.match(t, /資格の一覧に戻る/);
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
