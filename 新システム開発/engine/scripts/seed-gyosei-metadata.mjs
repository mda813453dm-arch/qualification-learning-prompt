/** 行政書士：本文を保持せず、年度・問番号・分類・正答だけを共有保存する。 */
import assert from 'node:assert/strict';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GcpStore} from '../src/gcp-store.js';

const execFile=promisify(execFileCallback);
const year=Number(process.argv[2]);
assert(Number.isInteger(year)&&year>=2020&&year<=2025,'YEAR_INVALID');
assert.equal(process.argv[3],'--commit','COMMIT_SWITCH_REQUIRED');
assert.equal(process.env.QLP_METADATA_APPROVED,'YES','APPROVAL_REQUIRED');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'qualification-learning','PROJECT_MISMATCH');
assert.equal(process.env.QLP_METADATA_ENV,'gyosei-metadata-only','METADATA_SCOPE_REQUIRED');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const script=join(root,'parser/scripts/extract-gyosei-metadata.py');
const {stdout}=await execFile('python3',[script,String(year)],{
  env:{...process.env,PYTHONPATH:join(root,'parser')},timeout:300000,maxBuffer:1024*1024
});
const rows=JSON.parse(stdout);
assert.equal(rows.length,60,'INCOMPLETE_YEAR');
assert.deepEqual(rows.map(x=>x.questionNumber),Array.from({length:60},(_,i)=>i+1));
for(const row of rows){
  assert.deepEqual(Object.keys(row).sort(),['correctAnswer','fieldId','questionNumber','year']);
  assert.equal(row.year,year);
  assert(['g1','g2','g3','g4','g5','g6','g7','g8'].includes(row.fieldId));
  const a=row.correctAnswer;
  if(row.questionNumber>=41&&row.questionNumber<=43){
    assert(Array.isArray(a)&&a.length===4&&a.every(n=>Number.isInteger(n)&&n>=1&&n<=20));
  }else if(row.questionNumber>=44&&row.questionNumber<=46){
    assert.equal(a,null,'DESCRIPTIVE_CANNOT_BE_NUMERICALLY_GRADED');
  }else{
    assert(Number.isInteger(a)&&a>=1&&a<=5,'INVALID_OFFICIAL_ANSWER');
  }
}
const store=new GcpStore({bucket:'qualification-learning-qlp-figures'});
const key='metadata/q090/'+year+'/main';
const existing=await store.get(key,'json');
if(existing){
  const classificationOnly=existing.length===60&&existing.every((x,i)=>
    Object.keys(x).sort().join(',')==='fieldId,questionNumber,year'&&
    x.year===rows[i].year&&x.questionNumber===rows[i].questionNumber&&x.fieldId===rows[i].fieldId);
  if(classificationOnly){
    await store.put(key,JSON.stringify(rows));
    console.log('GYOSEI_METADATA_ANSWERS_ADDED',year,rows.length);
  }else{
    assert.deepEqual(existing,rows,'EXISTING_METADATA_CONFLICT');
    console.log('GYOSEI_METADATA_ALREADY_PRESENT',year,rows.length);
  }
}else{
  await store.put(key,JSON.stringify(rows));
  console.log('GYOSEI_METADATA_WRITTEN',year,rows.length);
}
assert.deepEqual(await store.get(key,'json'),rows,'READBACK_MISMATCH');
console.log('GYOSEI_METADATA_READBACK_OK',year,'questions='+rows.length);
