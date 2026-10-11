import {readFileSync} from 'node:fs';
import {createOfficialPracticeController} from '../src/official-practice-controller.js';
const file=process.argv[2];
if(!file) throw new Error('LOCAL_PDF_FIXTURE_PATH_REQUIRED');
const rows=JSON.parse(readFileSync(file,'utf8'));
if(rows.length!==20)throw new Error('EXPECTED_20_QUESTIONS');
let passed=0;
for(const row of rows){
 const controller=createOfficialPracticeController({retrieveAndVerify:async()=>row,adapters:[]});
 const question=await controller.request('local-pdf-test',{});
 if(question.status!=='question')throw new Error('QUESTION_REJECTED:'+row.question.id);
 if('correctChoice' in question||'answerPdfUrl' in question)throw new Error('ANSWER_LEAK');
 const grade=controller.submit('local-pdf-test',row.answer.number);
 if(!grade.correct||grade.correctChoice!==row.answer.number)throw new Error('GRADE_FAILED:'+row.question.id);
 passed++;
}
console.log('PDF_EXTRACTED_FIXTURE_BRIDGE_PASS',passed,'/',rows.length);
console.log('NOTE: Fixture-supplied verification flags do not prove provenance or visual completeness.');
