import test from 'node:test';
import assert from 'node:assert/strict';
export const plan=(s,edit)=>({...s,draft:{...s.plan,...edit},approved:false,screen:'PLAN_PREVIEW',history:s.history});
export const approve=s=>({...s,plan:s.draft,approved:true,screen:'MODE_CHOICE'});
export const rank=(rows,officialOrder)=>[...rows].sort((a,b)=>{
 const ra=a.valid? a.wrong/a.valid:-1,rb=b.valid?b.wrong/b.valid:-1;
 if(ra!==rb)return rb-ra;
 if(a.confidenceCount&&b.confidenceCount){const ca=a.unsure/a.confidenceCount,cb=b.unsure/b.confidenceCount;if(ca!==cb)return cb-ca;}
 if(a.frequency!=null&&b.frequency!=null&&a.frequency!==b.frequency)return b.frequency-a.frequency;
 return officialOrder.indexOf(a.name)-officialOrder.indexOf(b.name);
});
export const due=(record,now)=>record.reviewQueue.filter(x=>Date.parse(x.dueAt)<=Date.parse(now)).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
export const next=(record,now)=>{const d=due(record,now);return d.length?{screen:'REVIEW',topic:d[0].topic,returnTo:record.screen}:{screen:record.screen};};
const base={plan:{fields:['A','B'],method:'balanced',intervals:[1440]},approved:true,history:[{id:'h1'}],screen:'STUDY'};
for(const [name,edit] of [['分野順',{fields:['B','A']}],['学習方法',{method:'practice'}],['復習間隔',{intervals:[3,60]}],['その他',{note:'test'}]])test('計画変更 '+name,()=>{const s=plan(base,edit);assert.equal(s.approved,false);assert.deepEqual(s.history,base.history);assert.deepEqual(approve(s).plan,{...base.plan,...edit});});
test('承認前出題拒否',()=>assert.equal(plan(base,{method:'practice'}).approved,false));
const order=['A','B','C'];
for(const [name,rows,expected] of [
 ['誤答率優先',[{name:'A',valid:4,wrong:2},{name:'B',valid:2,wrong:2}], 'B'],
 ['迷い率優先',[{name:'A',valid:2,wrong:1,confidenceCount:2,unsure:0},{name:'B',valid:2,wrong:1,confidenceCount:2,unsure:2}],'B'],
 ['頻出根拠優先',[{name:'A',valid:2,wrong:1,frequency:2},{name:'B',valid:2,wrong:1,frequency:5}],'B'],
 ['公式順同率',[{name:'B',valid:2,wrong:1},{name:'A',valid:2,wrong:1}],'A'],
 ['全問正解',[{name:'A',valid:2,wrong:0},{name:'B',valid:2,wrong:0}],'A'],
 ['全問不正解',[{name:'A',valid:2,wrong:2},{name:'B',valid:2,wrong:2}],'A'],
 ['採点不能除外',[{name:'A',valid:0,wrong:0},{name:'B',valid:1,wrong:1}],'B']
])test('診断 '+name,()=>assert.equal(rank(rows,order)[0].name,expected));
const log={screen:'PRACTICE',reviewQueue:[{topic:'A',dueAt:'2026-10-14T10:03:00+09:00'},{topic:'B',dueAt:'2026-10-14T11:00:00+09:00'}]};
for(const [name,at,count] of [['期限前','2026-10-14T10:02:59+09:00',0],['3分後','2026-10-14T10:03:00+09:00',1],['1時間後','2026-10-14T11:00:00+09:00',2],['期限超過','2026-10-14T12:00:00+09:00',2]])test('引継ぎ '+name,()=>assert.equal(due(JSON.parse(JSON.stringify(log)),at).length,count));
test('復習後の戻り先',()=>assert.equal(next(log,'2026-10-14T11:01:00+09:00').returnTo,'PRACTICE'));
test('期限前は通常学習',()=>assert.equal(next(log,'2026-10-14T10:00:00+09:00').screen,'PRACTICE'));
