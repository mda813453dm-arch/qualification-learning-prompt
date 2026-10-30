import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { selectQualificationLearner, qualificationOwnerOverview } from '../src/learner-owner.js';

const lids=['aaaaaaaaaa','bbbbbbbbbb','cccccccccc','dddddddddd','eeeeeeeeee','fffffffffff'];
function generate(){
  let index=0; return ()=>lids[index++];
}
test('同じ引継ぎIDから別資格へ移り、再び元の資格へ戻っても前のIDを再利用する',async()=>{
  const store=new MemoryStore(), next=generate();
  const initial=await selectQualificationLearner(store,{qualificationId:'q090',createId:next,now:1});
  assert.equal(initial.learnerId,'aaaaaaaaaa');
  const switched=await selectQualificationLearner(store,{suppliedId:initial.learnerId,qualificationId:'q041',
    createId:next,savedQualification:'q090',now:2});
  assert.equal(switched.learnerId,'bbbbbbbbbb');
  const back=await selectQualificationLearner(store,{suppliedId:switched.learnerId,
    qualificationId:'q090',savedQualification:'q041',createId:next,now:3});
  assert.equal(back.learnerId,initial.learnerId,'既存の取込みジョブが参照するIDを変更しない');
  const again=await selectQualificationLearner(store,{suppliedId:initial.learnerId,
    qualificationId:'q041',savedQualification:'q090',createId:next,now:4});
  assert.equal(again.learnerId,switched.learnerId,'再切替で新しいIDを増やさない');
  assert.deepEqual((await qualificationOwnerOverview(store,switched.learnerId)).qualifications,['q041','q090']);
  assert.equal((await store.get('owner/root/bbbbbbbbbb')),'aaaaaaaaaa');
});
test('別資格の既存履歴と個人専用取り込みを上書き・削除しない',async()=>{
  const store=new MemoryStore(),next=generate();
  const legacy='cccccccccc', before='historical-answers-and-imports';
  await store.put('lrnstate/'+legacy,JSON.stringify({qualificationId:'q041',answers:before}));
  await store.put('job/q041~'+legacy,JSON.stringify({persistent:true,sources:[{year:2025,status:'done'}]}));
  const alias=await selectQualificationLearner(store,{suppliedId:legacy,qualificationId:'q090',
    savedQualification:'q041',createId:next,now:55});
  assert.notEqual(alias.learnerId,legacy);
  assert.equal((await store.get('lrnstate/'+legacy,'json')).answers,before);
  assert.equal((await store.get('job/q041~'+legacy,'json')).sources[0].status,'done');
  const returned=await selectQualificationLearner(store,{suppliedId:alias.learnerId,qualificationId:'q041',
    savedQualification:'q090',createId:next,now:56});
  assert.equal(returned.learnerId,legacy);
});
test('無関係な旧IDは単独では自動統合しない（本人確認できない）',async()=>{
  const store=new MemoryStore(), next=generate();
  const x=await selectQualificationLearner(store,{suppliedId:'dddddddddd',qualificationId:'q041',createId:next,now:1});
  const y=await selectQualificationLearner(store,{suppliedId:'eeeeeeeeee',qualificationId:'q090',createId:next,now:2});
  assert.notEqual(x.root,y.root);
  assert.deepEqual((await qualificationOwnerOverview(store,x.learnerId)).qualifications,['q041']);
  assert.deepEqual((await qualificationOwnerOverview(store,y.learnerId)).qualifications,['q090']);
});
test('同じ資格の既存学習者はIDを変えず、レガシー記録を引き継ぐ',async()=>{
  const store=new MemoryStore(), next=generate();
  const id='ffffffffff';
  const a=await selectQualificationLearner(store,{suppliedId:id,qualificationId:'q090',
    savedQualification:'q090',createId:next,now:1});
  const b=await selectQualificationLearner(store,{suppliedId:id,qualificationId:'q090',
    savedQualification:'q090',createId:next,now:2});
  assert.equal(a.learnerId,id);
  assert.equal(b.learnerId,id);
  assert.equal((await store.get('owner/qualifications/'+id,'json')).createdAt,1);
});
test('不正なID・資格は安全に拒否し、保存領域を操作しない',async()=>{
  const store=new MemoryStore(), next=generate();
  await assert.rejects(selectQualificationLearner(store,{suppliedId:'invalid',qualificationId:'q090',createId:next}),/OWNER_ID_INVALID/);
  await assert.rejects(selectQualificationLearner(store,{suppliedId:'aaaaaaaaaa',qualificationId:'../../../other',createId:next}),/OWNER_INPUT_INVALID/);
  assert.equal(store.writes,0);
});
test('先にstartStudyで作った資格のIDは後のstartSessionでも同じ',async()=>{
  const store=new MemoryStore(), next=generate();
  const fromStudy=await selectQualificationLearner(store,{suppliedId:null,qualificationId:'q090',createId:next,now:1});
  const fromSession=await selectQualificationLearner(store,{suppliedId:fromStudy.learnerId,qualificationId:'q090',createId:next,now:2});
  assert.equal(fromStudy.learnerId,fromSession.learnerId);
});

test('日本語資格IDを使う既存の自由入力資格は破損させず、危険なプロパティ名は拒否する',async()=>{
  const store=new MemoryStore(),next=generate();
  const out=await selectQualificationLearner(store,{qualificationId:'第二級建築士',createId:next,now:100});
  assert.equal(out.qualificationId,'第二級建築士');
  await assert.rejects(selectQualificationLearner(store,{suppliedId:out.learnerId,qualificationId:'__proto__',createId:next}),/OWNER_INPUT_INVALID/);
  await assert.rejects(selectQualificationLearner(store,{suppliedId:out.learnerId,qualificationId:'../private',createId:next}),/OWNER_INPUT_INVALID/);
});
