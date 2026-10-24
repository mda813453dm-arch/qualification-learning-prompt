import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

const T0 = Date.parse('2026-10-24T07:20:00Z');
const SID = '11111111-2222-4333-8444-555555555555';
const Q1 = 'land_surveyor:2025:午前の部:11';
const Q2 = 'land_surveyor:2025:午後の部:21';
const base = 'https://engine.example';
const env = () => ({ STORE:new MemoryStore(), API_TOKEN:'test-token', clock:()=>T0 });
async function send(e, method, route, payload){
  const res = await handle(new Request(base+route,{method,
    headers:{authorization:'Bearer test-token','content-type':'application/json'},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})}),e);
  return { status:res.status, body:await res.json() };
}
async function store(e, questionId, shownAt, revealedAt){
  await e.STORE.put('ses/'+SID, JSON.stringify({savedAt:T0,
    state:{ qualificationId:'land_surveyor',
      descriptiveCurrent:{ questionId,year:2025,
        section:questionId.includes('午前')?'午前の部':'午後の部',
        number:questionId.includes('午前')?11:21,shownAt,revealedAt,
        text:'公式原本の内容を保持',pageNumbers:[14],
        pages:[{page:14,url:'https://moj.example/p14.png'}],
        layout:[{kind:'text',text:'第11問の公式本文'}] }
      } }));
}
test('解説前には操作メニューを返さず、現在問だけ解説後の短い操作パネルを返す',async()=>{
  const e=env();await store(e,Q1,T0,null);
  const uri='/v1/sessions/'+SID+'/descriptive/actions?questionId=';
  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q1))).status,409);
  assert.equal((await send(e,'POST','/v1/sessions/'+SID+'/descriptive/reveal',{questionId:Q2})).status,409);
  const shown=await send(e,'POST','/v1/sessions/'+SID+'/descriptive/reveal',{questionId:Q1});
  assert.equal(shown.status,200);
  assert.equal(shown.body.status,'descriptiveReveal');
  const controls=await send(e,'GET',uri+encodeURIComponent(Q1));
  assert.equal(controls.status,200);
  assert.equal(controls.body.status,'descriptiveActions');
  assert.equal(controls.body.question.questionId,Q1);
  assert.equal(controls.body.question.shownAt,T0);
  assert.equal(controls.body.question.layout,undefined,'元の問題・表・図を返さない');
  assert.equal(controls.body.grade,undefined,'自動採点しない');
  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q2))).status,409);
  await store(e,Q2,T0+1000,T0+1500);
  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q1))).status,409,'次問移動後の旧パネルは無効');
  assert.equal((await send(e,'GET',uri+encodeURIComponent(Q2))).status,200);
});
test('モデルの操作パネル取得ツールは本文を再掲せずMCPのUIメタデータを伴う',async()=>{
  const e=env();await store(e,Q1,T0,T0+1);
  const post=(method,params)=>send(e,'POST','/mcp',{jsonrpc:'2.0',id:1,method,params});
  const list=await post('tools/list',{});
  const tool=list.body.result.tools.find(t=>t.name==='showDescriptiveActions');
  assert.ok(tool?._meta?.['openai/outputTemplate']);
  const response=await post('tools/call',{name:'showDescriptiveActions',arguments:{sessionId:SID,questionId:Q1}});
  assert.equal(response.status,200);
  assert.equal(response.body.result.structuredContent.status,'descriptiveActions');
  assert.equal(response.body.result._meta.qlp.question.text,undefined,'モデルと画面のどちらにも原本は再送しない');
  assert.equal(response.body.result._meta.qlp.question.questionId,Q1);
});
