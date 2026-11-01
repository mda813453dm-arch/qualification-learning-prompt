// Additional regression cases for the verified MC cache/descriptive split.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResult } from '../src/ingest.js';
import { availablePackets, newState, pickNext, updatePlan, verifiedLegacyChoicePacket } from '../src/engine.js';
import { MemoryStore } from '../src/store.js';
import { readResult, writeResult } from '../src/cache.js';
import { handle } from '../src/app.js';
import { SRC, PV, T0, fakeResult, pdf } from './helpers.js';

async function validation(type) {
  const { result, assets } = await fakeResult({ qBytes: pdf('q'), aBytes: pdf('a') });
  if (type !== undefined) result.packets[0].questionType = type;
  return validateResult(SRC,
    { question: result.questionPdfSha256, answer: result.answerPdfSha256 }, PV, result, assets);
}
test('旧パーサーの検証済み択一式に questionType を付与する', async () => {
  const v = await validation();
  assert.equal(v.packets[0].questionType, 'multiple_choice');
});
test('questionType が unknown の問題を除外し理由を残す', async () => {
  const v = await validation('unknown');
  assert.equal(v.packets.some(p => p.questionNumber === 1), false);
  assert.ok(v.excluded.some(e => e.questionNumber === 1 && e.reason === 'QUESTION_TYPE_UNVERIFIED'));
});
test('未検証の記述式packetを択一の採点経路へ混ぜない', async () => {
  const v = await validation('descriptive');
  assert.equal(v.packets.some(p => p.questionNumber === 1), false);
  assert.ok(v.excluded.some(e => e.questionNumber === 1 && e.reason === 'QUESTION_TYPE_UNVERIFIED'));
});
test('明示的な unknown を旧択一として救済しない', () => {
  const key={ questionSha256:'a', answerSha256:'b' };
  const p={questionType:'unknown',choices:['a','b'],correctAnswer:1,stem:'ok',questionPdfSha256:'a',answerPdfSha256:'b'};
  assert.equal(verifiedLegacyChoicePacket(p,key),false);
});
test('旧キャッシュは原本SHAと択一の正答・選択肢が揃う場合だけ復元', async () => {
  const store=new MemoryStore();
  const v=await validation();
  const keyParts={ qualificationId:SRC.qualificationId, year:SRC.year, section:SRC.section,
    questionSha256:v.questionPdfSha256, answerSha256:v.answerPdfSha256, parserVersion:PV };
  const legacy={ ...v, packets:v.packets.map(p=>{const q={...p};delete q.questionType;return q;}) };
  await writeResult(store,keyParts,legacy,{},T0);
  const job={ sources:[{status:'done',keyParts}] };
  const items=await availablePackets(store,job,T0);
  assert.equal(items.length,legacy.packets.length);
  assert.ok(items.every(x=>x.packet.questionType==='multiple_choice'));
  assert.equal((await readResult(store,keyParts,T0)).result.packets[0].questionType,undefined,'キャッシュは上書きしない');
  const altered={ ...legacy, packets:[{...legacy.packets[0],answerPdfSha256:'unverified'}] };
  await writeResult(store,keyParts,altered,{},T0);
  assert.equal((await availablePackets(store,job,T0)).length,0,'SHA不一致は復元しない');
});
test('形式不明が明示されたpacketは any の新規出題でも使わない', () => {
  const state=newState({qualificationId:'test',now:0});
  const items=[{packet:{questionId:'u',fieldId:'A',questionType:'unknown'}},
    {packet:{questionId:'m',fieldId:'B',questionType:'multiple_choice'}}];
  assert.equal(pickNext(state,items,{today:'2026-11-01',job:null}).item.packet.questionId,'m');
});
test('newState で学習計画の形式指定・順序が保持される', () => {
  const state=newState({qualificationId:'test',now:0,plan:{orderedFields:['B','A'],questionPreference:'descriptive',questionPreferenceScope:'all'}});
  assert.deepEqual(state.plan.orderedFields,['B','A']);
  assert.equal(state.plan.questionPreference,'descriptive');
  assert.equal(state.plan.questionPreferenceScope,'all');
});
const env=()=>({STORE:new MemoryStore(),API_TOKEN:'test-token',clock:()=>T0});
async function call(e,method,path,payload){
  const r=await handle(new Request('https://engine.example'+path,{method,
    headers:{authorization:'Bearer test-token','content-type':'application/json'},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})}),e);
  return {status:r.status,body:await r.json()};
}
test('記述式から開始する計画は形式希望も保存し、択一へ暗黙変更しない', async () => {
  const e=env();
  const created=await call(e,'POST','/v1/sessions',{qualificationId:'land_surveyor',sources:[]});
  assert.equal(created.status,201);
  const sid=created.body.sessionId;
  const saved=await call(e,'POST','/v1/sessions/'+sid+'/plan',{startMode:'descriptive'});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal(saved.body.questionPreference,'descriptive');
  const next=await call(e,'POST','/v1/sessions/'+sid+'/next',{});
  assert.notEqual(next.body.status,'question','択一の通常問題へ自動で切り替わらない');
});
test('記述式専用APIで別資格を指定しても開けない', async () => {
  const e=env();
  const created=await call(e,'POST','/v1/sessions',{qualificationId:'land_surveyor',sources:[]});
  const sid=created.body.sessionId;
  const result=await call(e,'POST','/v1/sessions/'+sid+'/descriptive',
    {year:2025,section:'午後の部',number:21,qualificationId:'宅地建物取引士'});
  assert.equal(result.status,409);
  assert.equal(result.body.error,'QUALIFICATION_MISMATCH');
});
test('択一式のみの計画で記述式専用経路へ迂回できない', async () => {
  const e=env();
  const created=await call(e,'POST','/v1/sessions',{qualificationId:'land_surveyor',sources:[]});
  const sid=created.body.sessionId;
  const saved=await call(e,'POST','/v1/sessions/'+sid+'/plan',{questionPreference:'multiple_choice'});
  assert.equal(saved.status,200);
  const result=await call(e,'POST','/v1/sessions/'+sid+'/descriptive',
    {year:2025,section:'午後の部',number:21});
  assert.equal(result.status,409);
  assert.equal(result.body.error,'DESCRIPTIVE_MODE_MISMATCH');
});
test('nextQuestion経路でも別資格指定の不一致を拒否', async () => {
  const e=env();
  const created=await call(e,'POST','/v1/sessions',{qualificationId:'land_surveyor',sources:[]});
  const result=await call(e,'POST','/v1/sessions/'+created.body.sessionId+'/next',
    {qualificationId:'宅地建物取引士'});
  assert.equal(result.status,409);
  assert.equal(result.body.error,'QUALIFICATION_MISMATCH');
});
