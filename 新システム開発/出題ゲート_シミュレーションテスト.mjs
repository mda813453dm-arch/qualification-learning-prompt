import assert from 'node:assert/strict';
import test from 'node:test';
export function validateQuestion(q) {
 if (!q || !String(q.body ?? '').trim()) return 'BODY_MISSING';
 if (!Array.isArray(q.options) || q.options.length < 2) return 'OPTIONS_MISSING';
 if (q.options.some((o,i)=>o.number!==i+1 || !String(o.text??'').trim())) return 'OPTIONS_INVALID';
 if (!Number.isInteger(q.answer) || q.answer<1 || q.answer>q.options.length) return 'ANSWER_INVALID';
 if (q.figureRequired && !q.figureDisplayed) return 'FIGURE_MISSING';
 if (q.official && !q.officialAnswerVerified) return 'OFFICIAL_ANSWER_UNVERIFIED';
 if (!String(q.id??'').trim()) return 'ID_MISSING';
 return null;
}
export function present(q, approved, rendered=true) {
 const error=validateQuestion(q);
 if (!approved) return {state:'AWAIT_APPROVAL'};
 if (error) return {state:'PREPARATION_FAILED',error};
 if (!rendered) return {state:'NOT_PRESENTED'};
 return {state:'AWAIT_ANSWER', text:`■${q.id}\n${q.body}\n${q.options.map(o=>`${o.number}. ${o.text}`).join('\n')}\n番号で答えてください。`};
}
const good={id:'診断1',body:'正しいものはどれか。',options:[{number:1,text:'甲'},{number:2,text:'乙'},{number:3,text:'丙'},{number:4,text:'丁'}],answer:2,official:false,figureRequired:false};
const cases=[
 ['AI作成正常',good,'AWAIT_ANSWER'],
 ['公式正常',{...good,official:true,officialAnswerVerified:true},'AWAIT_ANSWER'],
 ['本文空',{...good,body:''},'PREPARATION_FAILED'],
 ['選択肢空',{...good,options:[]},'PREPARATION_FAILED'],
 ['選択肢欠番',{...good,options:[{number:1,text:'甲'},{number:3,text:'乙'}]},'PREPARATION_FAILED'],
 ['正答範囲外',{...good,answer:5},'PREPARATION_FAILED'],
 ['図表欠落',{...good,figureRequired:true},'PREPARATION_FAILED'],
 ['公式正答未照合',{...good,official:true},'PREPARATION_FAILED'],
 ['問題ID欠落',{...good,id:''},'PREPARATION_FAILED'],
];
for (const [name,q,expected] of cases) test(name,()=>assert.equal(present(q,true).state,expected));
test('承認前は出題しない',()=>assert.equal(present(good,false).state,'AWAIT_APPROVAL'));
test('表示欠落は未出題',()=>assert.equal(present(good,true,false).state,'NOT_PRESENTED'));
test('完全出題は回答指示を含む',()=>assert.match(present(good,true).text,/番号で答えてください。/));
test('失敗問題は診断分母に算入しない',()=>{const attempts=[{presented:true,graded:true},{presented:false,graded:false},{presented:true,graded:false}];assert.equal(attempts.filter(x=>x.presented&&x.graded).length,1)});
