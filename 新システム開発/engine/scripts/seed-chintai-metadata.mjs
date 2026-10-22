/** 本番保存は年度・問番号・分類・正答の4項目のみ。原本PDF・設問本文は保存しない。 */
import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GcpStore } from '../src/gcp-store.js';

const execFile=promisify(callback);
const year=Number(process.argv[2]);
assert(Number.isInteger(year)&&year>=2015&&year<=2025,'YEAR_INVALID');
assert.equal(process.argv[3],'--commit','COMMIT_SWITCH_REQUIRED');
assert.equal(process.env.QLP_METADATA_APPROVED,'YES','APPROVAL_REQUIRED');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'qualification-learning','PROJECT_MISMATCH');
assert.equal(process.env.QLP_METADATA_ENV,'chintai-metadata-only','METADATA_SCOPE_REQUIRED');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const script=join(root,'parser/scripts/extract-chintai-metadata.py');
const {stdout}=await execFile('python3',[script,String(year)],{
 env:{...process.env,PYTHONPATH:join(root,'parser')},
 timeout:1800000,maxBuffer:1024*1024
});
const rows=JSON.parse(stdout);
const count=year<2020?40:50;
assert.equal(rows.length,count,'MISSING_QUESTIONS');
assert.deepEqual(rows.map(x=>x.questionNumber),Array.from({length:count},(_,i)=>i+1));
for(const row of rows){
 assert.deepEqual(Object.keys(row).sort(),['correctAnswer','fieldId','questionNumber','year']);
 assert.equal(row.year,year);
 assert(['c1','c2','c3','c4','c5','c6','unclassified'].includes(row.fieldId));
 const a=row.correctAnswer;
 assert(a===null||(Number.isInteger(a)&&a>=1&&a<=4)||
   (Array.isArray(a)&&a.length>=2&&a.every(x=>Number.isInteger(x)&&x>=1&&x<=4)),
   'INVALID_OFFICIAL_ANSWER');
}
const store=new GcpStore({bucket:'qualification-learning-qlp-figures'});
const key='metadata/q097/'+year+'/main';
const existing=await store.get(key,'json');
if(existing){
 assert.equal(existing.length,rows.length,'EXISTING_COUNT_CONFLICT');
 for(let i=0;i<rows.length;i++){
   assert.equal(existing[i].year,rows[i].year);
   assert.equal(existing[i].questionNumber,rows[i].questionNumber);
   assert.deepEqual(existing[i].correctAnswer,rows[i].correctAnswer,'EXISTING_ANSWER_CONFLICT');
   assert(existing[i].fieldId===rows[i].fieldId ||
     (existing[i].fieldId==='unclassified' &&
      ['c1','c2','c3','c4','c5','c6'].includes(rows[i].fieldId)),
     'EXISTING_CLASSIFICATION_CONFLICT');
 }
 if(JSON.stringify(existing)!==JSON.stringify(rows)){
   await store.put(key,JSON.stringify(rows));
   console.log('CHINTAI_METADATA_CLASSIFICATION_UPGRADED',year,
     rows.filter((x,i)=>existing[i].fieldId!==x.fieldId).length);
 }else console.log('CHINTAI_METADATA_ALREADY_PRESENT',year,rows.length);
}else{
 await store.put(key,JSON.stringify(rows));
 console.log('CHINTAI_METADATA_WRITTEN',year,rows.length);
}
assert.deepEqual(await store.get(key,'json'),rows,'READBACK_MISMATCH');
console.log('CHINTAI_METADATA_READBACK_OK',year,'questions='+rows.length);
