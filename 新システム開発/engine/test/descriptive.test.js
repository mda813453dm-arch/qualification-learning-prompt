import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptiveSpec, requestedDescriptive, descriptiveView, validateDescriptiveExplanation } from '../src/descriptive.js';
import { CATALOG } from '../src/catalog.js';
import { renderDescriptive } from '../src/parser-client.js';
import { forModel } from '../src/mcp.js';

const pins = CATALOG.land_surveyor.officialPdfPins;

test('記述式は2022〜2025年度の午前11・午後21/22だけ受け、公式SHAを保持する', () => {
  for (const year of [2022,2023,2024,2025]) {
    for (const [section,number] of [['午前の部',11], ['午後の部',21], ['午後の部',22]]) {
      const spec = descriptiveSpec(year,section,number,pins);
      assert.equal(spec?.sha, pins[year][section]);
      assert.match(spec?.url, /^https:\/\/www\.moj\.go\.jp\/content\/\d+\.pdf$/);
      assert.equal(spec.questionId, `land_surveyor:${year}:${section}:${number}`);
    }
  }
  assert.equal(descriptiveSpec(2025,'午前の部',21,pins), null);
  assert.equal(descriptiveSpec(2025,'午後の部',11,pins), null);
  assert.equal(descriptiveSpec(2026,'午後の部',21,pins), null);
  assert.equal(descriptiveSpec(2025,'午前の部',10,pins), null);
});

test('第11問と問11、令和7年、午前午後の組合せを誤認しない', () => {
  assert.deepEqual(requestedDescriptive('2025年度 午前の部 第11問を出題'), { year:2025,section:'午前の部',number:11 });
  assert.deepEqual(requestedDescriptive('令和7年度 午後の部 問21を表示'), { year:2025,section:'午後の部',number:21 });
  assert.deepEqual(requestedDescriptive('2024年度 午後の部 第22問'), { year:2024,section:'午後の部',number:22 });
  assert.equal(requestedDescriptive('2025年度 午前の部 第21問'), null);
  assert.equal(requestedDescriptive('2025年度 午後の部 第11問'), null);
  assert.equal(requestedDescriptive('2025年度 問10'), null);
});

test('記述式の画面・解答表示には正答番号・正誤・自動採点が存在しない', () => {
  const spec = descriptiveSpec(2025,'午後の部',21,pins);
  const saved = { ...spec, text:'公式の問題条件と登記情報',
    sourceUrl:spec.url, pages:[{ page:24,url:'https://example.test/p24.png' }] };
  for (const revealed of [false,true]) {
    const result = descriptiveView(saved,'study-session',revealed);
    assert.equal(result.question.gradingMode,'none');
    assert.equal(result.question.kind,'descriptive');
    assert.equal(result.question.correctAnswer,undefined);
    assert.equal(result.grade,undefined);
    assert.equal(result.question.choices,undefined);
    assert.equal(result.status,revealed?'descriptiveReveal':'descriptiveQuestion');
    if (revealed) {
      assert.equal(result.question.text,undefined);
      assert.equal(result.question.pages,undefined);
      assert.equal(result.question.layout,undefined);
    }
  }
});

test('記述式のAI解説では原本を再掲せず三角関数・複素数を指示する', () => {
  const spec = descriptiveSpec(2025,'午前の部',11,pins);
  const full = descriptiveView({ ...spec, text:'原本本文・観測成果の表',
    pages:[{page:14,url:'https://example.test/original.png'}] }, 'session', true);
  const context = forModel(full);
  assert.equal(context.gradingMode, 'none');
  assert.equal(context.question, undefined);
  assert.match(context.howToProceed, /三角関数と複素数/);
  assert.match(context.howToProceed, /再掲せず/);
  assert.doesNotMatch(JSON.stringify(context), /原本本文・観測成果の表/);
});

test('記述式パーサーが返す本文・出典SHA・画像枚数を検証し、偽パケットは拒否する', async () => {
  const fake = async () => new Response(JSON.stringify({
    status:'ready',kind:'descriptive',year:2025,section:'午前の部',number:11,
    questionSha256:'wrong',pageNumbers:[14],pages:{'p14.png':'aGVsbG8='},
    text:'偽問題',gradingMode:'none',
  }), { status:200,headers:{'content-type':'application/json'} });
  await assert.rejects(
    renderDescriptive({ endpoint:'https://parser.example', fetch:fake,
      bytes:new Uint8Array([37,80,68,70,45]),sha256:'0'.repeat(64),
      year:2025,section:'午前の部',number:11 }),
    /ASSETS_INVALID|DESCRIPTIVE_PARSER_RESULT_UNVERIFIED/);
});


test('土地の解説は複素数の公式だけでは受け付けず、通常解法と各小問の解説を確認する', () => {
  const current = { number:11, text:'土地の地積と面積を求めよ。' };
  const calculatorOnly = '## 関数電卓による計算\n' + 'S=Abs(Imag(A*Conjg(B)+B*Conjg(C)))/2\n'.repeat(35);
  assert.equal(validateDescriptiveExplanation(calculatorOnly,current).code,'DESCRIPTIVE_SUBQUESTIONS_MISSING');
  const short = '## 問1：通常解法\n根拠：座標法で計算。\n## 問2：関数電卓\nConjgとImagを使う。';
  assert.equal(validateDescriptiveExplanation(short,current).code,'DESCRIPTIVE_EXPLANATION_TOO_SHORT');
  const normal = '原本の表を確認し、座標法・三角関数の通常解法を行う。根拠を確認し、検算と丸め方を説明する。'.repeat(12);
  const full = '## 問1：土地の整理\n' + normal + '\n## 問2：地積\n' +
    '通常解法は座標法で行う。\nS=Abs(Imag(A*Conjg(B)+B*Conjg(G)+G*Conjg(E)+E*Conjg(A)))/2\n' +
    normal;
  assert.equal(validateDescriptiveExplanation(full,current).ok,true);
  assert.equal(validateDescriptiveExplanation(full.replace(/Conjg/g,'Complex'),current).code,'DESCRIPTIVE_AREA_CALCULATOR_MISSING');
  assert.equal(validateDescriptiveExplanation('## 問1\n' + normal + '\n## 問2\n' + normal,
    {number:21,text:'地積面積の計算をしない問題'}).code,'DESCRIPTIVE_AREA_CALCULATOR_MISSING');
  assert.equal(validateDescriptiveExplanation('建物の用途と登記申請の要件を確認した参考解説です。'.repeat(8),
    {number:22,text:'建物の登記'}).ok,true);
});

test('完成した記述式の解説を復元すると操作ボタンと同じ画面へ戻す', () => {
  const spec=descriptiveSpec(2025,'午前の部',11,pins);
  const saved={...spec, explanationMarkdown:'## 問1\n通常解法\n## 問2\n座標法',
    text:'原本記述式の問題文',shownAt:123,pages:[{page:1,url:'https://example.test/p1.png'}]};
  const restored=descriptiveView(saved,'study-session',true);
  assert.equal(restored.status,'descriptiveActions');
  assert.equal(restored.explanationMarkdown,saved.explanationMarkdown);
  assert.equal(restored.question.questionId,spec.questionId);
  assert.equal(restored.question.text,undefined);
  assert.equal(restored.question.pages,undefined);
  assert.equal(descriptiveView(saved,'study-session',false).status,'descriptiveQuestion');
  assert.equal(descriptiveView(saved,'study-session',false).explanationMarkdown,undefined);
});
