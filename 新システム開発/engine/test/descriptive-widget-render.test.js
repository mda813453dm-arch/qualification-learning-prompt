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
