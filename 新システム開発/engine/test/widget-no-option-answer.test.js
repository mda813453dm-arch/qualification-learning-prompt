import assert from 'node:assert/strict';
import { runInNewContext, Script } from 'node:vm';
import { test } from 'node:test';
import { widgetHtml } from '../src/widget-v205.js';
import { grade as programGrade } from '../src/engine.js';
import { widgetHtml as currentWidgetHtml } from '../src/widget-current.js';
const original = widgetHtml();
const patched = currentWidgetHtml();
const from = (text,start,end) => {
  const i=text.indexOf(start);
  const j=text.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i);
  return text.slice(i,j);
};
function verifyScript(html){
  const parts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(parts.length>0);
  for(const [,part] of parts) new Script(part);
}
verifyScript(original);
verifyScript(patched);
const all = {q:4,label:'正解肢なし（全員正解）',accepted:[1,2,3,4],right:1};
const multi = {q:9,label:'2または3',accepted:[2,3],right:2};
const single = {q:1,right:3};
const sid='11111111-1111-1111-1111-111111111111';
function fixture({q,label,accepted,right},value){
  const questionId='q018:2022:main:'+q;
  const current={questionId,correctAnswer:right,correctAnswerLabel:label,
    acceptedAnswers:accepted,allCorrect:q===4,choiceCount:4,kind:'new',
    source:{answerPdfUrl:'https://www.mankan.org/pdf/R04_answer.pdf',answerSourceType:'official_pdf'}};
  const question={questionId,year:2022,questionNumber:q,choices:['選択肢A','選択肢B','選択肢C','選択肢D']};
  const evaluated=programGrade({qualificationId:'q018',current,review:{},history:{},plan:{}},
    {questionId,value}, {today:'2026-11-24',now:Date.UTC(2026,10,24),intervals:[1,3,7]});
  assert.equal(evaluated.ok,true);
  const grade=evaluated.grade;
  assert.equal(grade.correct,value==='分からない'?undefined:q===4||(accepted||[right]).includes(value));
  assert.deepEqual(grade.acceptedAnswers,accepted);
  assert.equal(evaluated.state.history[questionId].result,grade.result);
  return {question,grade};
}
function widgetFixture(html,{question,grade}){
  const restore=from(html,"    if (data.status === 'restoredGrade') {","    if (data.status === 'restoreIdle') {");
  const fns=from(html,'  function answerReferenceName(g){','  // v200: 解答表示後')+
    from(html,'  function showGrade(g){','  async function restoreFromServer(').split('\n  function ').slice(0,1).join('\n');
  const marks=[];
  const app={innerHTML:'',querySelector(selector){
    return {classList:{add(name){if(name==='correct')marks.push(selector);}}};
  }};
  const node={disabled:false};
  const noop=()=>{};
  const calls=[];
  const state={sessionId:sid,question};
  const ctx={question,grade,app,state,marks,document:{getElementById:()=>node},
    esc:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    safeUrl:x=>x,journeyBar:()=>'',localBar:()=>'',fieldJumpHtml:()=>'',endBar:()=>'',sourceManagerBar:()=>'',
    bindEnd:noop,bindSourceManager:noop,bindFieldJump:noop,scrollUp:noop,
    callTool:(...args)=>calls.push(args),saveRecentView:noop};
  const functions=fns+'\nfunction render(data){\n'+restore+'\n state.question=data.question;\n}';
  const results=runInNewContext(functions+'\n;({showGrade,render,renderVerifiedExplanation})',ctx);
  return {results,app,marks,calls};
}
function display(html,data,entry){
  const w=widgetFixture(html,data);
  if(entry==='verified') w.results.renderVerifiedExplanation({ ...data,sessionId:sid });
  else if(entry==='restore') w.results.render({ ...data,sessionId:sid,status:'restoredGrade' });
  else w.results.showGrade(data.grade);
  assert.equal(w.calls.length,0);
  return {out:w.app.innerHTML,marks:w.marks};
}
const count=(text,token)=>text.split(token).length-1;
test('negative control: v205 wrongly gives each Q4 option a substantive answer badge',()=>{
  const data=fixture(all,2);
  const {out,marks}=display(original,data,'grade');
  assert.equal(count(out,'【正答】'),4);
  assert.equal(count(out,'class="qlp-answer-text"'),4);
  assert.equal(marks.length,4);
  assert.equal(count(display(original,data,'verified').out,'【正答】'),4);
});
for(const mode of ['grade','restore','verified']){
  for(const value of [1,2,3,4,...(mode!=='verified'?['分からない']:[])]){
    test(`Q4: ${mode} ${value}, officially credited without content labels`,()=>{
      const data=fixture(all,value);
      const prev=JSON.stringify(data);
      const {out,marks}=display(patched,data,mode);
      assert.equal(JSON.stringify(data),prev,'Widget rendering must not mutate the saved grade');
      assert.equal(marks.length,0);
      assert.equal(count(out,'【正答】'),0);
      assert.equal(count(out,'class="qlp-answer-text"'),0);
      assert.equal(count(out,'【あなたの回答】'),typeof value==='number'?1:0);
      assert.match(out,/公式発表：正解肢なし。全解答を採点上正解として扱います。/);
      assert.ok(data.question.choices.every(choice=>out.includes(choice)));
      if(value==='分からない') assert.match(out,/採点には数えません/);
      else assert.match(out,/採点上の正解/);
      assert.match(out,/R04_answer\.pdf/);
      assert.match(out,/次の問題へ/);
    });
  }
  for(const [type,values] of [[multi,[1,2,3]],[single,[1,3]]]){
    for (const value of values) {
      test(`Q${type.q}: ${mode} ${value}, complete output unchanged from v205`,()=>{
        const data=fixture(type,value);
        const before=display(original,data,mode);
        assert.deepEqual(display(patched,data,mode),before);
        assert.equal(count(before.out,'【正答】'),type.accepted?.length??1);
        assert.match(before.out,data.grade.correct?/✓ 正解/:/不正解/);
      });
    }
  }
}
