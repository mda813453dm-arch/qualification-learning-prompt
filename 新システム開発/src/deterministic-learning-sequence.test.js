import {createDeterministicLearningSequence} from './deterministic-learning-sequence.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const throws=(fn,expected,m)=>{
 let error=null; try{const r=fn();if(r?.ok===false)error=new Error(r.reason)}catch(e){error=e}
 ok(error!==null,m+': did not block');
 if(expected)ok(error.message===expected,m+': expected '+expected+', got '+error.message);
};
const meta=(questionId,kind='official_practice',origin=kind==='ai_confirmation'?'ai':'official',itemId='guarantee')=>({
 questionId,qualificationId:'real-estate-agent',itemId,kind,origin
});
const seq=createDeterministicLearningSequence({qualificationId:'real-estate-agent',itemId:'guarantee'});
ok(seq.validateQuestion(meta('p1')).ok,'accept official practice for same item');
ok(seq.recordAnswer('p1',false).outcome.directive==='PRACTICE_READY','first miss continues same-unit practice');
throws(()=>seq.validateQuestion(meta('other','official_practice','official','declarations')),
 'STUDY_UNIT_MISMATCH','different unit cannot be mixed');
ok(seq.validateQuestion(meta('p2')).ok,'second official same-unit practice');
ok(seq.recordAnswer('p2',false).outcome.directive==='CONFIRMATION_REQUIRED','second consecutive miss forces confirmation');
throws(()=>seq.validateQuestion(meta('p3')),'AI_CONFIRMATION_REQUIRED','official practice blocked until confirmation');
throws(()=>seq.validateQuestion(meta('c1','ai_confirmation','official')),
 'AI_CONFIRMATION_REQUIRED','confirmation must be AI-created');
ok(seq.validateQuestion(meta('c1','ai_confirmation','ai')).ok,'AI confirmation accepted');
const checkMiss=seq.recordAnswer('c1',false);
ok(checkMiss.state.officialPracticeCount===2,'confirmation excluded from practice count');
ok(checkMiss.state.phase==='CONFIRMATION_REQUIRED','failed confirmation keeps check route active');
ok(seq.validateQuestion(meta('c2','ai_confirmation','ai')).ok,'retry uses a fresh confirmation problem');
const checkPass=seq.recordAnswer('c2',true);
ok(checkPass.state.officialPracticeCount===2,'confirmation success still excluded from practice count');
ok(checkPass.state.consecutivePracticeMisses===0&&checkPass.state.phase==='PRACTICE_READY',
 'confirmation success clears same-item practice miss streak');
ok(seq.validateQuestion(meta('p3')).ok,'resume official practice in same item');
ok(seq.recordAnswer('p3',true).state.correctRun===1,'practice streak resumes');
ok(seq.validateQuestion(meta('p4')).ok,'different official year/problem can continue same item');
ok(seq.recordAnswer('p4',true).state.correctRun===2,'official same-item count advances');
ok(seq.validateQuestion(meta('p5')).ok,'third consecutive official practice accepted');
const perfect=seq.recordAnswer('p5',true);
ok(perfect.state.phase==='PERFECT_RUN_CHOICE'&&perfect.state.correctRun===3,'three correct same-item practices ask user choice');
throws(()=>seq.validateQuestion(meta('p6')),'UNIT_CHOICE_REQUIRED','no question before user chooses');
ok(seq.chooseAfterPerfectRun('continue_same_unit').state.itemId==='guarantee','continue same unit');
ok(seq.state().correctRun===0,'new same-unit run starts after choice');
ok(seq.validateQuestion(meta('p6')).ok,'same-unit practice continues after choice');
const seq2=createDeterministicLearningSequence({qualificationId:'real-estate-agent',itemId:'guarantee'});
ok(seq2.validateQuestion(meta('w1')).ok,'wrong-run setup');
seq2.recordAnswer('w1',false);
ok(seq2.validateQuestion(meta('w2')).ok,'wrong-run second question');
seq2.recordAnswer('w2',false);
ok(seq2.validateQuestion(meta('c3','ai_confirmation','ai')).ok,'AI check after two misses');
seq2.recordAnswer('c3',true);
ok(seq2.chooseAfterPerfectRun('next_unit','declarations').reason==='PERFECT_RUN_CHOICE_NOT_PENDING',
 'next unit choice cannot be fabricated');
console.log('PASS deterministic learning sequence: same-unit practice, two-miss confirmation, and perfect-run choice');
