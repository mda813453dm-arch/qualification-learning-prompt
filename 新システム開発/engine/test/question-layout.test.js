import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { splitInlineQuestionStatements } from '../src/question-layout.js';
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
  assert.match(html, /var lines=splitInlineQuestionStatements\(t\)/);
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

test('新URIと旧版の不変性：v195で全出題経路を整形し、v194・v193は維持', () => {
  assert.equal(WIDGET_URI, 'ui://qlp/question-v195.html');
  assert.equal(WIDGET_VERSION, '2026-11-16.195');
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
