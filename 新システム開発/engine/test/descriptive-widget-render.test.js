import test from 'node:test';
import assert from 'node:assert/strict';
import { widgetHtml } from '../src/widget.js';

// Browser executable を取得できないローカル環境でも、実際に配信される
// ウィジェットのJavaScriptを抽出し、HTMLエスケープと表示順序を検査する。
const html = widgetHtml();
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
assert.doesNotThrow(() => new Function(script), '配信HTMLのJavaScript構文');

const helpers = script.slice(script.indexOf('  function esc(s)'), script.indexOf('  function safeUrl(u)'));
const { esc, explanationHtml } = new Function('descriptiveBlockHtml',
  helpers + '\nreturn {esc,explanationHtml};')(
    ({kind,rows}) => kind === 'table'
      ? '<table><tbody>' + rows.map(r => '<tr>' + r.map(c=>'<td>'+c+'</td>').join('') + '</tr>').join('') + '</tbody></table>'
      : ''
  );

test('解説Markdownを安全にHTML化し、関数電卓の式を失わない',()=>{
  const markdown = [
    '## 面積の求め方',
    '**関数電卓**で各点を保存します。',
    'S=Abs(Imag(A*Conjg(B)+B*Conjg(C)+C*Conjg(A)))/2',
    '|点|変数|',
    '|---|---|',
    '|A|A|',
    '<script>alert("unsafe")</script>',
  ].join('\n');
  const out=explanationHtml(markdown);
  assert.match(out,/<h2>面積の求め方<\/h2>/);
  assert.match(out,/<strong>関数電卓<\/strong>/);
  assert.match(out,/A\*Conjg\(B\)/);
  assert.match(out,/<table>/);
  assert.doesNotMatch(out,/<script>/);
  assert.match(out,/&lt;script&gt;/);
  assert.equal(esc('<button>'), '&lt;button&gt;');
});

test('AI解説と操作パネルは同じ画面で隣接し、古い問題データは再掲しない',()=>{
  const start=script.indexOf('  function showDescriptiveActions(d)');
  const end=script.indexOf('  function showDescriptiveQuestion(d)',start);
  assert.ok(start>=0 && end>start);
  const app={innerHTML:''}, state={question:'old',answered:true};
  const show=new Function('app','state','esc','explanationHtml','descriptiveMenuButtons',
    'endBar','publishDescriptive','scrollUp','bindEnd','bindDescriptiveNavigation',
    script.slice(start,end)+'\nreturn showDescriptiveActions;')(
    app,state,esc,explanationHtml,()=>'<button id="nextDescriptive">次の記述式へ</button>',
    ()=>'<button id="endStudy">学習終了</button>',()=>true,()=>{},()=>{},()=>{}
  );
  show({status:'descriptiveActions',
    question:{year:2025,section:'午前の部',number:11,questionId:'land_surveyor:2025:午前の部:11'},
    explanationMarkdown:'## 第11問\n\nS=Abs(Imag(A*Conjg(B)))/2'});
  const exp=app.innerHTML.indexOf('class="descriptive-explanation"');
  const nav=app.innerHTML.indexOf('class="descriptive-actions"');
  assert.ok(exp>=0 && nav>exp,'解説の後にボタンがある');
  assert.equal((app.innerHTML.match(/id="nextDescriptive"/g)||[]).length,1);
  assert.ok(!app.innerHTML.includes('descriptive-source'));
  assert.equal(state.answered,false);
});

test('解説待機は採点せず本文・番号選択肢をチャットへ逃がさず、保存済みの同一問を照合する',()=>{
  assert.ok(script.includes('async function waitForPublishedDescriptive(q)'), '登録完了まで同一画面が読取照会を続ける');
  assert.ok(script.includes("response.explanationMarkdown && response.question?.questionId === q.questionId"),
    '空本文や別問の取得結果では操作パネルを開かない');
  const start=script.indexOf('  function showDescriptiveQuestion(d)');
  const end=script.indexOf('  // 正答はツールの結果にも',start);
  const source=script.slice(start,end);
  assert.ok(source.includes('showDescriptivePending(q)'), '記述式の解説を学習枠へ収容する');
  assert.doesNotMatch(source,/チャットに表示します|番号選択肢を利用してください/);
  assert.doesNotMatch(source,/fallbackDescriptiveActions/,'旧ボタン単独経路を廃止');
});

test('過去問一覧では2015〜2021年度と旧年度の記述式を択一と分けて表示する',()=>{
  const start=script.indexOf('  function libraryHtml(lib){');
  const end=script.indexOf('  function ovHtml(){',start);
  assert.ok(start>=0 && end>start);
  const show=new Function('esc',script.slice(start,end)+'\nreturn libraryHtml;')(esc);
  const lib={ supportedYears:[2025,2015], stored:[
    {year:2015,section:'午前の部',questions:10},
    {year:2015,section:'午後の部',questions:20},
  ],missing:[], sectionsByYear:{2015:['午前の部','午後の部'],2025:['午前の部','午後の部']},
  descriptive:{years:[2025,2015,2007],byYear:{
    2025:{'午前の部':1,'午後の部':2},
    2015:{'午前の部':1,'午後の部':2},
    2007:{'午前の部':1,'午後の部':2},
  },totalQuestions:9,gradingMode:'none',scannedYears:[2007]}};
  const rendered=show(lib);
  assert.match(rendered,/2015年度/);
  assert.match(rendered,/択一 10問/);
  assert.match(rendered,/記述 1問（採点なし）/);
  assert.match(rendered,/記述 2問（採点なし）/);
  assert.match(rendered,/2007年度/,'旧年度の記述式専用分も一覧に現れる');
  assert.match(rendered,/2025年度/);
  assert.match(rendered,/学習開始後/,'記述式の出題導線を説明');
  assert.doesNotMatch(rendered,/2007年度[\s\S]*択一 10問/,'旧年度に択一の採点件数を作らない');
});

test('iPhone用の記述式年度選択に2007〜2025年が揃い、旧年度も採点なしで開ける',()=>{
  const start=script.indexOf('  function showDescriptiveMenu(year){');
  const end=script.indexOf('  var descriptiveScreen = null;',start);
  assert.ok(start>=0 && end>start);
  const app={innerHTML:'',querySelectorAll:()=>[]};
  const open=new Function('app','endBar','bindEnd','scrollUp',
    script.slice(start,end)+'\nreturn showDescriptiveMenu;')(
      app,()=>'<button id="endStudy">終了</button>',()=>{},()=>{});
  open(2007);
  assert.equal((app.innerHTML.match(/<option value="20\d\d"/g)||[]).length,19);
  assert.match(app.innerHTML,/<option value="2007" selected>2007年度<\/option>/);
  assert.match(app.innerHTML,/<option value="2025">2025年度<\/option>/);
  assert.match(app.innerHTML,/記述式は自動採点しません/);
  assert.match(html,/id="sourceManageLandDescriptive"/);
});
