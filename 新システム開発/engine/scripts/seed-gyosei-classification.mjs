/** 行政書士の問題本文・解答を保存せず、3項目の分類台帳だけ登録する。 */
import assert from 'node:assert/strict';
import {GcpStore} from '../src/gcp-store.js';

assert.equal(process.argv[2],'--commit','COMMIT_SWITCH_REQUIRED');
assert.equal(process.env.QLP_METADATA_APPROVED,'YES','APPROVAL_REQUIRED');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'qualification-learning','PROJECT_MISMATCH');
assert.equal(process.env.QLP_METADATA_ENV,'gyosei-classification-only','METADATA_SCOPE_REQUIRED');
const store=new GcpStore({bucket:'qualification-learning-qlp-figures'});
let total=0;
for(const year of [2020,2021,2022,2023,2024,2025]){
  const rows=Array.from({length:60},(_,i)=>{
    const n=i+1;
    const fieldId=n<=2?'g1':n<=7?'g2':n<=26?'g3':n<=35?'g4':n<=40?'g5':n<=43?'g7':n<=46?'g8':'g6';
    return {year,questionNumber:n,fieldId};
  });
  const key=`metadata/q090/${year}/main`;
  const existing=await store.get(key,'json');
  if(existing){
    assert.equal(existing.length,60,'EXISTING_COUNT_CONFLICT');
    for(let i=0;i<60;i++){
      assert.equal(existing[i].year,rows[i].year);
      assert.equal(existing[i].questionNumber,rows[i].questionNumber);
      assert.equal(existing[i].fieldId,rows[i].fieldId);
    }
    console.log('GYOSEI_CLASSIFICATION_ALREADY_PRESENT',year,existing.length);
  }else{
    await store.put(key,JSON.stringify(rows));
    console.log('GYOSEI_CLASSIFICATION_WRITTEN',year,rows.length);
  }
  const readback=await store.get(key,'json');
  assert.deepEqual(readback,existing||rows,'READBACK_MISMATCH');
  assert(readback.every(row=>Object.keys(row).every(k=>['year','questionNumber','fieldId','correctAnswer'].includes(k))));
  total+=rows.length;
}
assert.equal(total,360);
console.log('GYOSEI_CLASSIFICATION_READBACK_OK years=6 questions=360');
