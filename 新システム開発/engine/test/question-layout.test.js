import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { splitInlineQuestionStatements } from '../src/question-layout.js';
import { splitInlineQuestionStatementsV198, compactOcrSpacesV198 } from '../src/question-layout-v198.js';
import { widgetHtml as old197Html } from '../src/widget-v197.js';
import { WIDGET_URI, WIDGET_VERSION, widgetHtml } from '../src/widget-current.js';
import { widgetHtml as old193Html } from '../src/widget-v193.js';
import { widgetHtml as old194Html } from '../src/widget-v194.js';

const surveyor = '次の a ～ e の文から誤っているものを選べ。 a. 「測量」とは土地の測量をいう。 b. 「測量作業機関」とは測量する者をいう。 c. 「測量標」とは標識をいう。 d. 承諾が必要である。 e. 公共測量は規定に従う。';

test('2025年度測量士補の例：問題文とa-eがそれぞれ独立した段落になる', () => {
  const formatted = splitInlineQuestionStatements(surveyor);
  const lines = formatted.split('\n');
  assert.equal(lines.length, 6);
  assert.match(lines[0], /選べ。/);
  assert.deepEqual(lines.slice(1).map(s => s.trim().slice(0, 2)), ['a.', 'b.', 'c.', 'd.', 'e.']);
  assert.equal(formatted.replace(/\n/g, ''), surveyor, '元の文字は追加改行以外変更しない');
});

test('全資格共通：ア〜オ・（1）〜（5）・丸数字を分離し、既存改行を保持', () => {
  const fixtures = [
    ['次のア〜オを選べ。 ア．甲。 イ．乙。 ウ．丙。 エ．丁。 オ．戊。', 6],
    ['次の中から選べ。 （1）甲。 （2）乙。 （3）丙。 （4）丁。 （5）戊。', 6],
    ['次の中から選べ。 ①甲。 ②乙。 ③丙。 ④丁。 ⑤戊。', 6],
    ['次の中から選べ。 (a)甲。 (b)乙。 (c)丙。 (d)丁。 (e)戊。', 6],
    ['見出し\na. 甲\nb. 乙\nc. 丙', 4],
  ];
  for (const [text, count] of fixtures) {
    const formatted = splitInlineQuestionStatements(text);
    assert.equal(formatted.split('\n').length, count, text);
    assert.equal(formatted.replace(/\n/g, ''), text.replace(/\n/g, ''));
  }
  assert.ok(Object.keys(CATALOG).length > 5, '全資格は同じ問題文レンダラーを通る');
  const html = widgetHtml();
  assert.match(html, /function stemHtml\(t\)/);
  assert.match(html, /var lines=splitInlineQuestionStatements(?:V198)?\(t\)/);
  assert.match(html, /if \(q\.stem\) h \+= '<div class="stem">' \+ stemHtml\(q\.stem\)/);
  assert.match(html, /function diagQuestion\(q, head\)/);
  assert.match(html, /'<div class="stem">' \+ stemHtml\(q\.stem\)/);
  assert.match(html, /stemHtml\(d\.question\)/, 'AI登録の通常確認問題も段落を復元する');
  assert.match(html, /stemHtml\(d\.question \|\| ''\)/, 'AI登録の補強問題も段落を復元する');
});

test('原文優先：小数・少数のラベル・元のMarkdown表・HTML特殊文字は書き換えない', () => {
  for (const text of [
    '1.25と2.50を比較する。a.甲 b.乙 の2項目のみ。',
    '| 項目 | 値 |\n|---|---|\n| a. 甲 b. 乙 c. 丙 | 3 |',
    '条件：<img src=x onerror=alert(1)> の表示も元の文字列で扱う。',
    'a.甲とb.乙だけでは3件に満たない。',
  ]) assert.equal(splitInlineQuestionStatements(text), text);
});

test('新URIと旧版の不変性：v198でv195の全出題経路の整形を維持し、v194・v193は維持', () => {
  assert.equal(WIDGET_URI, 'ui://qlp/question-v205.html');
  assert.equal(WIDGET_VERSION, '2026-11-21.205');
  const current = widgetHtml(), old = old193Html(), old194 = old194Html();
  assert.match(current, /inline-statement-paragraphs-v194/);
  assert.match(current, /all-question-modes-v195/);
  assert.doesNotMatch(old194, /all-question-modes-v195/);
  assert.match(old194, /inline-statement-paragraphs-v194/);
  assert.match(current, /\.choices \.opt span\{white-space:pre-wrap/);
  assert.match(current, /qlp-v192-natural-height/);
  assert.doesNotMatch(current, /qlp-v191-scroll-diag/);
  assert.doesNotMatch(old, /inline-statement-paragraphs-v194/);
  assert.match(old, /qlp-v192-natural-height/);
});

// v198：2024年度測量士補 問1（iPhone の ChatGPT で a〜e が1段落に詰まっていた問）
const surveyor2024q1 = '次の a ~ e の文は , 測量法 ( 昭和 24 年法律第 188 号 ) について述べたものである。明らかに間違っているものだけの組合せはどれか。次の 1 ~ 5 の中から選べ。a. 公共測量とは , 基本測量以外の測量をいう。b . 基本測量とは , すべての測量の基礎となる測量をいう。c. 測量計画機関が自ら計画を実施する場合には , 測量作業機関となることができる。d . 基本測量の測量成果を使用する者は , 承認を得なければならない。e. 測量計画機関は , 作業規程を定める。';
const strip = (t) => t.normalize('NFKC').replace(/[\s]/g, '');
test('v198：読み取りで「b . 」「d . 」と空白が入っても a〜e を1項目ずつ段落にし、字は変えない', () => {
  assert.equal(splitInlineQuestionStatements(surveyor2024q1).split('\n').length, 1, 'v197 までは1段落のまま（不具合の再現）');
  const out = splitInlineQuestionStatementsV198(surveyor2024q1).split('\n');
  assert.equal(out.length, 6);
  assert.deepEqual(out.slice(1).map((l) => l.slice(0, 2)), ['a.', 'b.', 'c.', 'd.', 'e.']);
  assert.match(out[0], /文は，測量法（昭和24年法律第188号）について/, '読み取りの空白を詰め、日本語の間の , ( ) を全角に戻す');
  assert.equal(strip(out.join('')), strip(surveyor2024q1), '空白・改行と全角半角の違い以外の字は変えない');
  assert.equal(compactOcrSpacesV198('OSS (Open Source Software) である'), 'OSS (Open Source Software)である', '英語どうしの空白は残す');
  assert.equal(compactOcrSpacesV198('北緯44° 00′ 00″.0000 東経'), '北緯44° 00′ 00″.0000東経', '度分秒（° ′ ″）の間の空白は原本どおり残す');
  assert.equal(compactOcrSpacesV198('① → ② → ③ の順'), '① → ② → ③の順', '丸数字・矢印の間は詰めない');
  for (const text of ['1.25と2.50を比較する。a.甲 b.乙 の2項目のみ。', '| 項目 | 値 |\n|---|---|\n| a. 甲 b. 乙 c. 丙 | 3 |', 'a.甲とb.乙だけでは3件に満たない。']) {
    assert.equal(splitInlineQuestionStatementsV198(text).split('\n').length, text.split('\n').length, text);
  }
});
test('v198：「過去問の追加・登録状況」は見出しと分野の間ではなく解答の操作の下。v197 の HTML は変えない', () => {
  const html = widgetHtml();
  const i = html.indexOf("if (q.fieldName) h += '<div class=\"field\">'");
  const head = html.lastIndexOf("'問' + q.questionNumber) + '</h2>';", i);
  assert.ok(head > 0 && i > head);
  assert.doesNotMatch(html.slice(head, i), /sourceManagerBar\(\)/);
  const ctl = html.indexOf('<div id="answerProgress"');
  assert.match(html.slice(ctl, ctl + 300), /if \(!data\.restored\) h \+= sourceManagerBar\(\);/);
  assert.match(html, /esc\(compactOcrSpacesV198\(c\)\)/);
  const v197 = old197Html();
  assert.match(v197, /2026-11-17\.197/);
  assert.doesNotMatch(v197, /splitInlineQuestionStatementsV198/);
});

test('v199：本文の ``` で囲んだ擬似言語は等幅・空白をそのまま保つ枠で出し、v198 の HTML は変えない', async () => {
  const html = widgetHtml();
  assert.match(html, /qlp-question-layout-v199/);
  assert.match(html, /\.qlp-code\{[^}]*white-space:pre;overflow-x:auto/);
  assert.doesNotMatch(html.match(/\.qlp-code\{[^}]*\}/)[0], /[;{](?:max-)?height:/, '高さを固定しない');
  const { widgetHtml: v198 } = await import('../src/widget-v198.js');
  assert.doesNotMatch(v198(), /qlp-code/);
  assert.match(v198(), /2026-11-17\.198/);
});
