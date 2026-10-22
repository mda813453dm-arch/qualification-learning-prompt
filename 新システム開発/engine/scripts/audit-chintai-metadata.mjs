/** Read-only independent audit of the persisted Chintai metadata-only library. */
import assert from 'node:assert/strict';
import { GcpStore } from '../src/gcp-store.js';
assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'qualification-learning');
const store=new GcpStore({bucket:'qualification-learning-qlp-figures'});
let total=0,unknown=0,special=0;
const details=[];
for(let year=2015;year<=2025;year++){
 const rows=await store.get('metadata/q097/'+year+'/main','json');
 const expected=year<2020?40:50;
 assert(Array.isArray(rows),'YEAR_NOT_REGISTERED_'+year);
 assert.equal(rows.length,expected,'WRONG_YEAR_COUNT_'+year);
 assert.deepEqual(rows.map(x=>x.questionNumber),Array.from({length:expected},(_,i)=>i+1));
 for(const x of rows){
  assert.deepEqual(Object.keys(x).sort(),['correctAnswer','fieldId','questionNumber','year']);
  assert.equal(x.year,year);
  assert(['c1','c2','c3','c4','c5','c6','unclassified'].includes(x.fieldId));
  const a=x.correctAnswer;
  assert(a===null||(Number.isInteger(a)&&a>=1&&a<=4)||
    (Array.isArray(a)&&a.length>=2&&a.every(n=>Number.isInteger(n)&&n>=1&&n<=4)));
  if(x.fieldId==='unclassified')unknown++;
  if(!Number.isInteger(a))special++;
 }
 details.push([year,expected,rows.filter(x=>x.fieldId==='unclassified').length]);
 total+=rows.length;
}
assert.equal(total,500,'TOTAL_NOT_500');
console.log('CHINTAI_METADATA_READBACK_OK years=11 questions=500');
console.log('CHINTAI_METADATA_UNCLASSIFIED',unknown);
console.log('CHINTAI_METADATA_SPECIAL_ANSWERS',special);
console.log('CHINTAI_METADATA_YEAR_DETAILS',JSON.stringify(details));
for(let year=2015;year<=2016;year++){
 const rows=await store.get('metadata/q097/'+year+'/main','json');
 console.log('CHINTAI_METADATA_UNCLASSIFIED_QUESTION_NUMBERS',year,
   rows.filter(x=>x.fieldId==='unclassified').map(x=>x.questionNumber).join(','));
}
