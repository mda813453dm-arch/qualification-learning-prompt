// 図表分離（全資格共通）の回帰テスト。
// 問題データは保存済みの共有分解結果から抜き出したもの（fixtures/figure-separation-packets.json）。
// 原本の行の位置は公式PDF（文字の層、または保存済みの OCR の控え）から取ったもの（fixtures/figure-separation-pages.json）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { present } from '../src/engine.js';
import { separateFigures, inlineFigureUrls, registryEntry, UNVERIFIED_NOTICE, AUTO_FIGURE_NOTICE } from '../src/figure-separation.js';
import { splitInlineQuestionStatements } from '../src/question-layout.js';
import { widgetHtml } from '../src/widget-current.js';
import { widgetHtml as v195Html } from '../src/widget-v195.js';

const PACKETS = JSON.parse(fs.readFileSync(new URL('./fixtures/figure-separation-packets.json', import.meta.url)));
const PAGES = JSON.parse(fs.readFileSync(new URL('./fixtures/figure-separation-pages.json', import.meta.url)));
const REGISTRY = JSON.parse(fs.readFileSync(new URL('../data/figure-separation.json', import.meta.url)));

const find = (q, shaHead, n, section) => structuredClone(PACKETS.find((p) => p.qualificationId === q &&
  p.questionPdfSha256.startsWith(shaHead) && p.questionNumber === n && (!section || p.section === section)));
const item = (packet, owner = '_shared') => ({ packet, keyParts: { owner, parserVersion: '0.8.2' } });
const fileOf = (url) => decodeURIComponent(url.split('/').pop());
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const fixFile = (fig) => fileOf(fig.url);
const addOf = (packet, file) => (registryEntry(packet)?.add ?? []).find((a) => a.file === file);
const NO_TEXT_IN_FIGURE = /選べ|どれか|ただし|次の|^\s*[1-5][.．]\s|\[No\.|〔No\./;

test('2025年度測量士補・問6：表6だけを本文と選択肢の間に出し、本文・選択肢と重ならない', () => {
  const p = find('q063', '561692b95a4f', 6);
  const shown = present(item(p), 'new');
  // 図は表6の1枚だけ。問題1問分の切り出し（問番号・本文・選択肢入り）は本文と選択肢の間に出さない
  assert.equal(shown.figures.length, 1);
  const fig = shown.figures[0];
  assert.equal(fig.role, 'figure');
  assert.match(fixFile(fig), /^q063-2025-561692b95a4f-q6-p7-s0\.png$/);
  assert.match(fig.url, /\/v1\/figure\/own\/_shared\/561692b95a4f[0-9a-f]{52}\/0\.8\.2\/q063-2025-561692b95a4f-q6-p7-s0\.png$/);
  assert.equal(shown.sourceImageUrls.length, 1, '問題全体の画像は照合用として畳んで残す');
  assert.match(fileOf(shown.sourceImageUrls[0]), /q6-p7\.png$/);
  assert.ok(!shown.figures.some((f) => fileOf(f.url) === 'q063-2025-561692b95a4f-q6-p7.png'));
  // 切り出し範囲が原本の表6の行だけを覆い、本文・北緯東経の行・選択肢の行と重ならない
  const add = addOf(p, fixFile(fig));
  assert.equal(add.page, 7);
  const page = PAGES['q063-2025-q6'];
  const inside = page.lines.filter((l) => overlaps(add.rect, l.rect));
  assert.equal(inside[0].text, '表6');
  assert.ok(inside.some((l) => /縮尺係数/.test(l.text)), '表の最後の行まで入る');
  for (const l of inside) assert.doesNotMatch(l.text, NO_TEXT_IN_FIGURE, `図の中に本文・選択肢の行がある：${l.text}`);
  for (const l of page.lines.filter((l) => /北緯44|選べ|^ア イ ウ$|^[1-5]\./.test(l.text))) {
    assert.ok(!overlaps(add.rect, l.rect), `本文・選択肢の行と重なる：${l.text}`);
  }
  // 本文は文字で、原本の段落（北緯・東経の行を含む）を保つ
  assert.equal(shown.stemMode, 'text');
  assert.match(shown.stem, /抜粋である。/);
  assert.match(shown.stem, /緯度及び経度は，次のとおりである。\n北緯44° 00′ 00″\.0000　東経140° 15′ 00″\.0000$/);
  assert.equal(shown.stem.split('\n').length, 3);
  // 選択肢は文字で5つ。順番（＝正答との対応）は原本どおり
  assert.equal(shown.choiceMode, 'text');
  assert.deepEqual(shown.choices.map((c) => c.replace(/\s/g, '')), [
    'ア：−イ：＋ウ：0.999901', 'ア：＋イ：−ウ：0.999901', 'ア：−イ：＋ウ：1.000001', 'ア：＋イ：−ウ：1.000001', 'ア：＋イ：＋ウ：1.000001']);
  assert.equal(Object.hasOwn(shown, 'correctAnswer'), false, '正答は出題前に出さない');
  assert.equal(p.correctAnswer, 1, '保存済みの正答は変えない');
  assert.equal(shown.figureSeparation.status, 'verified');
  assert.ok(!shown.notices.includes(UNVERIFIED_NOTICE));
  // 同じ試験の添付PDF（別のSHA）も同じ表示
  const b = present(item(find('q063', 'b39f46132558', 6)), 'new');
  assert.equal(b.figures.length, 1);
  assert.equal(b.stem, shown.stem);
  assert.deepEqual(b.choices, shown.choices);
});

test('問6：判定表から外す（修正を戻す）と、本文と選択肢の間に問題全体の画像が出ない＝表6が無いことを検出する', () => {
  const p = find('q063', '561692b95a4f', 6);
  p.questionPdfSha256 = p.questionPdfSha256.replace(/^5/, '0'); // 判定表に無い問として扱う
  const shown = present(item(p), 'new');
  assert.equal(shown.figures.some((f) => f.role === 'figure'), false, '推測で図を出さない');
  assert.equal(shown.figureSeparation.status, 'choice_image');
  assert.equal(shown.figures[0]?.role, 'choice_source', '選択肢を文字にできないので原本を選択肢として出す（答えられなくしない）');
});

test('本文＋図1枚＋選択肢（基本情報 2017 問74）：図だけの切り出しを出し、問題全体は照合用', () => {
  const p = find('fe', '31e5', 74);
  const shown = present(item(p), 'new');
  assert.equal(shown.figures.length, 1);
  assert.match(fixFile(shown.figures[0]), /-q74-p35-s0\.png$/);
  assert.equal(shown.sourceImageUrls.length, 1);
  assert.equal(shown.figureSeparation.status, 'verified');
  assert.deepEqual(shown.choices, p.choices);
});

test('本文だけの問（宅建 2016 問1）：問題全体の画像を本文の下に出さない', () => {
  const p = find('q041', '87923a287018', 1, 'main');
  const shown = present(item(p), 'new');
  assert.equal(shown.figures.length, 0);
  assert.equal(shown.figureSeparation.status, 'not_needed');
  assert.ok(!shown.notices.includes(UNVERIFIED_NOTICE));
  assert.equal(shown.sourceImageUrls.length, 1, '原本は照合用として見られる');
});

test('同じPDFでも区分ごとに違う分解結果（本文が原本画像）は区分ごとの判定を使う', () => {
  const p = find('q041', '87923a287018', 1, '年度共通');
  const shown = present(item(p), 'new');
  assert.equal(shown.figureSeparation.status, 'image_question');
  assert.equal(shown.figures.length, 1);
  assert.equal(shown.figures[0].role, 'question_image');
});

test('複数の表（測量士補 2024 問8）：表8-1・8-2（9ページ）、表8-3（10ページ）の順に出す', () => {
  const p = find('q063', '7da3c3792182', 8);
  const shown = present(item(p), 'new');
  assert.deepEqual(shown.figures.map(fixFile), ['q063-2024-7da3c3792182-q8-p9-s0.png', 'q063-2024-7da3c3792182-q8-p10-s1.png']);
  assert.ok(shown.figures.every((f) => f.role === 'figure'));
  assert.equal(shown.sourceImageUrls.length, 2);
});

test('本文と表が同じページ（測量士補 2022 問3）：表3だけで、本文・選択肢の行と重ならない', () => {
  const p = find('q063', '647c4ca1b291', 3);
  const shown = present(item(p), 'new');
  assert.equal(shown.figures.length, 1);
  const add = addOf(p, fixFile(shown.figures[0]));
  const page = PAGES['q063-2022-q3'];
  const inside = page.lines.filter((l) => overlaps(add.rect, l.rect));
  assert.equal(inside[0].text, '表3');
  assert.equal(inside.filter((l) => /45°22/.test(l.text)).length, 5, '測定値5つが全部入る');
  for (const l of inside) assert.doesNotMatch(l.text, NO_TEXT_IN_FIGURE);
  for (const l of page.lines.filter((l) => /となる|系統誤差|偶然誤差|^ア イ ウ エ$/.test(l.text.replace(/\s+/g, ' ')))) {
    assert.ok(!overlaps(add.rect, l.rect), `本文・選択肢と重なる：${l.text}`);
  }
});

test('複数ページにまたがる問（測量士補 2023 問21）：図21と表21、次のページの選択肢だけを出す', () => {
  const p = find('q063', '3513b442ace6', 21);
  const shown = present(item(p), 'new');
  assert.deepEqual(shown.figures.map((f) => [fixFile(f), f.role]), [
    ['q063-2023-3513b442ace6-q21-p20-s0.png', 'figure'], ['q063-2023-3513b442ace6-q21-p21-c1.png', 'choice_image']]);
  assert.equal(shown.sourceImageUrls.length, 2, '両ページの問題全体は照合用');
  assert.equal(shown.figureSeparation.status, 'verified');
});

test('OCRで改行が失われた問：段落の復元は追加の改行だけで、文字は変えない', () => {
  const p = find('q063', '3b797566e6fb', 19);
  const shown = present(item(p), 'new');
  assert.equal(shown.stem, p.stem, '判定表の上書きの無い問は保存済みの本文のまま');
  const formatted = splitInlineQuestionStatements(shown.stem);
  assert.equal(formatted.replace(/\n/g, ''), shown.stem.replace(/\n/g, ''));
  assert.equal(shown.figures.length, 0);
  assert.equal(shown.figureSeparation.status, 'not_needed');
});

test('図の中に文字がある問（測量士補 2025 問13）：図中の語は図として扱い、図を出す', () => {
  const p = find('q063', '561692b95a4f', 13);
  const shown = present(item(p), 'new');
  assert.equal(shown.figures.length, 1);
  assert.equal(fixFile(shown.figures[0]), 'q063-2025-561692b95a4f-q13-p14.png');
  assert.equal(shown.figureSeparation.status, 'verified');
});

test('記述式の問：図表分離は採点に触れず、正答も出さない', () => {
  const p = find('q063', '647c4ca1b291', 3);
  p.questionType = 'descriptive';
  p.choices = [];
  const shown = present(item(p), 'new');
  assert.equal(shown.figures.length, 1);
  assert.equal(Object.hasOwn(shown, 'correctAnswer'), false);
  assert.deepEqual(shown.choices, []);
});

test('判定表に無い問（学習者が添付した別のPDFなど）：座標で安全側に判定し、確認済みとはしない', () => {
  const p = find('q063', '647c4ca1b291', 3);
  p.questionPdfSha256 = 'f'.repeat(64);
  const out = separateFigures(p, (f) => `/x/${f}`);
  assert.equal(out.figures.length, 0, '問題の範囲を覆う切り出しは図にしない');
  assert.equal(out.sources.length, 1);
  assert.equal(out.status, 'unverified');
  assert.ok(out.notices.includes(UNVERIFIED_NOTICE), '「図表分離未検証」と表示して原本を見られるようにする');
  // 小さな図の切り出しは、未検証のまま図として出す（従来の正しい表示を壊さない）
  p.figures = [{ file: 'small.png', page: 5, rect: [100, 380, 200, 480], width: 300, height: 300 }];
  const small = separateFigures(p, (f) => `/x/${f}`);
  assert.equal(small.figures.length, 1);
  assert.equal(small.status, 'unverified');
});

test('旧版の画面からの再開：保存済みの図のURLから問題全体の画像を除き、v195 の画面は変えない', () => {
  const p = find('q063', '561692b95a4f', 6);
  const base = `/v1/figure/own/_shared/${p.questionPdfSha256}/0.8.2/`;
  const saved = { questionNumber: 6, section: 'main', questionPdfSha256: p.questionPdfSha256,
    figureUrls: [base + 'q063-2025-561692b95a4f-q6-p7.png', base + 'q063-2025-561692b95a4f-q6-p7-s0.png'] };
  assert.deepEqual(inlineFigureUrls(saved), [base + 'q063-2025-561692b95a4f-q6-p7-s0.png']);
  // 旧版の保存（SHA が無い）でも URL から判定する
  assert.deepEqual(inlineFigureUrls({ questionNumber: 6, figureUrls: saved.figureUrls }), [base + 'q063-2025-561692b95a4f-q6-p7-s0.png']);
  const old = v195Html();
  assert.doesNotMatch(old, /qlp-figure-separation/);
  const cur = widgetHtml();
  assert.match(cur, /<meta name="qlp-figure-separation" content="v196">/);
  assert.match(cur, /function questionSourceHtml\(q\)/);
  assert.match(cur, /qlp-v192-natural-height/, '高さ固定の枠内スクロールに戻さない');
});

test('判定表：全ての「確認済み」は図だけの画像を持ち、問題全体の画像を本文と選択肢の間に出さない', () => {
  let verified = 0;
  for (const [key, e] of Object.entries(REGISTRY.questions)) {
    const inline = Object.values(e.figures).filter((r) => r !== 'source').length + (e.add ?? []).length;
    if (e.status === 'verified') { verified++; assert.ok(inline > 0, key); }
    if (e.status === 'not_needed') assert.equal(inline, 0, key);
    for (const a of e.add ?? []) {
      assert.match(a.file, /-q\d+-p\d+-[sc]\d+\.png$/, key);
      assert.equal(a.owner, '_shared');
      assert.match(a.sha256, /^[0-9a-f]{64}$/);
    }
    if (e.overrides?.choices) assert.ok(e.overrides.verifiedBy, `本文・選択肢の上書きは目視確認の記録が要る ${key}`);
  }
  assert.ok(verified > 100);
});

test('ITパスポート（2016 春期）：図は図だけ、選択肢が原本画像の問は選択肢だけ、切り出しが不完全な問は確認済みにしない', () => {
  const sha = '776343b7960b460f6bf9cec41f939f81e9338dd0d77cffdc2389f838ec97d1dc';
  const urlOf = (file, owner, ver) => `https://qlp.test/v1/figure/${owner ? `own/${owner}/${sha}/${ver}/` : ''}${encodeURIComponent(file)}`;
  const packet = (n, choiceMode = 'ocr') => ({ qualificationId: 'q006', year: 2016, section: '春期', questionPdfSha256: sha, questionNumber: n,
    stemMode: 'ocr', choiceMode, stem: '次の表', figures: [{ file: `q006-2016-776343b7960b-q${n}-p${n === 12 ? 6 : n === 2 ? 2 : 28}.png`, width: 900, height: 600 }] });
  // 問12：表だけの画像を出し、問題全体の画像は照合用に畳む
  const q12 = separateFigures(packet(12), urlOf);
  assert.equal(q12.status, 'verified');
  assert.deepEqual(q12.figures.map((f) => [f.file, f.role]), [['q006-2016-776343b7960b-q12-p6-s0.png', 'figure']]);
  assert.deepEqual(q12.sources.map((s) => s.file), ['q006-2016-776343b7960b-q12-p6.png']);
  // 問2：選択肢が原本画像。選択肢の行だけの画像を出す（問題全体を選択肢として出さない）
  const q2 = separateFigures(packet(2, 'official_image'), urlOf);
  assert.equal(q2.status, 'verified');
  assert.deepEqual(q2.figures.map((f) => [f.file, f.role]), [['q006-2016-776343b7960b-q2-p2-c0.png', 'choice_image']]);
  // 問60：自動の候補は右端で切れていたため不採用。目視で範囲を決め直し、a〜c の3つの図と記号が全部入る画像だけを出す
  const e60 = REGISTRY.questions[`${sha}:60`];
  assert.equal(e60.status, 'verified');
  assert.equal(e60.check, 'visual');
  assert.deepEqual(e60.add.map((a) => a.role), ['figure']);
  assert.ok(e60.add[0].rect[2] >= 405 && e60.add[0].rect[3] >= 428, '図 c の右端と記号 a〜c まで入る');
  const q60 = separateFigures(packet(60), urlOf);
  assert.deepEqual(q60.figures.map((f) => f.role), ['figure']);
  assert.deepEqual(q60.sources.map((s) => s.file), ['q006-2016-776343b7960b-q60-p28.png']);
  // 問52・78・95：図の範囲が本文・選択肢と分けられなかった。確認済みにせず、図だけの画像も出さない
  for (const n of [52, 78, 95]) {
    const e = REGISTRY.questions[`${sha}:${n}`];
    assert.equal(e.status, 'unverified', `問${n}`);
    assert.equal((e.add ?? []).length, 0, `問${n}`);
  }
  // ITパスポートは15回分すべてに図だけ・選択肢だけの画像がある
  const q006Adds = Object.values(REGISTRY.questions).flatMap((e) => e.add ?? []).filter((a) => a.file.startsWith('q006-'));
  assert.ok(q006Adds.length >= 150);
  assert.equal(new Set(q006Adds.map((a) => a.file.split('-')[2])).size, 15);
});

test('目視で決めた問：理由が記録され、確認済みは図か選択肢だけの画像を持ち、図なしの問は画像を足さない', () => {
  let visual = 0;
  for (const [key, e] of Object.entries(REGISTRY.questions)) {
    if (e.check !== 'visual') continue;
    visual += 1;
    assert.ok(e.why, `理由がない ${key}`);
    if (e.status === 'verified') {
      const own = (e.add ?? []).filter((a) => a.role === 'figure' || a.role === 'choice_image');
      const kept = Object.values(e.figures ?? {}).filter((r) => r === 'figure');
      assert.ok(own.length + kept.length > 0, `確認済みなのに図・選択肢の画像がない ${key}`);
    }
    if (e.status === 'not_needed') assert.equal((e.add ?? []).length, 0, `図なしの問に画像 ${key}`);
    // 問題全体の画像は図として出さない（照合用に畳む）
    for (const r of Object.values(e.figures ?? {})) assert.notEqual(r, 'question_image', key);
  }
  assert.ok(visual >= 250);
});

test('未検証・選択肢が原本画像の問は、図として本文と選択肢の間に画像を出さない（欠けた図を確認済みのように見せない）', () => {
  for (const [key, e] of Object.entries(REGISTRY.questions)) {
    if (e.status !== 'unverified' && e.status !== 'choice_image') continue;
    assert.ok(!Object.values(e.figures ?? {}).includes('figure'), key);
    assert.ok(!(e.add ?? []).some((a) => a.role === 'figure'), key);
  }
  // 土地家屋調査士 2019 午前 問10：既存の画像は地図の一部が欠けていたため、原本の画像として畳む
  const ls = Object.entries(REGISTRY.questions).find(([k]) => k.startsWith('fc83edc0b7c2') && k.split(':')[1].split('@')[0] === '10')[1];
  assert.equal(ls.status, 'unverified');
  assert.deepEqual(Object.values(ls.figures), ['source']);
});

test('本文の読み取り誤りを原本どおりに戻した問は、目視の記録を持つ（ITパスポート 2016春 問60・2017 問72）', () => {
  const q60 = REGISTRY.questions['776343b7960b460f6bf9cec41f939f81e9338dd0d77cffdc2389f838ec97d1dc:60'];
  assert.match(q60.overrides.stem, /システム構成a～cについて/);
  assert.match(q60.overrides.stem, /─□─は装置を表し/);
  assert.ok(q60.overrides.verifiedBy);
  const q72 = Object.entries(REGISTRY.questions).find(([k]) => k.startsWith('3f501237dd35') && k.split(':')[1].split('@')[0] === '72')[1];
  assert.match(q72.overrides.stem, /01011010と01101011を加算/);
  assert.ok(q72.overrides.verifiedBy);
});

test('登録のない問（受講者の取り込み）で自動判定の図を出すときは、目視未確認の注意を出す', () => {
  const urlOf = (file) => `https://qlp.test/v1/figure/${encodeURIComponent(file)}`;
  const sep = separateFigures({ qualificationId: 'q999', year: 2026, section: 'main', questionPdfSha256: 'f'.repeat(64), questionNumber: 3,
    stemMode: 'text', choiceMode: 'text', stem: '次の図について',
    figures: [{ file: 'up-q3-p1.png', width: 600, height: 300, page: 1, rect: [80, 300, 500, 420] }],
    evidence: { questionPdfPages: [1], questionRect: [100, 700] } }, urlOf);
  assert.equal(sep.status, 'unverified');
  assert.deepEqual(sep.figures.map((f) => f.role), ['figure']);
  assert.ok(sep.notices.includes(AUTO_FIGURE_NOTICE));
});
