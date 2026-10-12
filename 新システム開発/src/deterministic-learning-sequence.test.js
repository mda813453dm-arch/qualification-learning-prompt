import {createDeterministicLearningSequence} from './deterministic-learning-sequence.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const throws=(fn,expected,m)=>{let e=null;try{const r=fn();if(r?.ok===false)e=new Error(r.reason)}catch(x){e=x}ok(e!==null,m+': did not block');if(expected)ok(e.message===expected,m+': expected '+expected+', got '+e.message)};
const plan={status:'approved',qualificationId:'real-estate-agent',sha256:'a'.repeat(64),itemIds:['guarantee','declarations']};
const meta=(questionId,kind='official_practice',origin=kind==='ai_confirmation'?'ai':'official',itemId='guarantee',extra={})=>({questionId,qualificationId:plan.qualificationId,itemId,kind,origin,verifiedBundle:kind==='official_practice',...extra});
const seq=createDeterministicLearningSequence({studyPlan:plan,itemId:'guarantee'});
throws(()=>createDeterministicLearningSequence({itemId:'guarantee'}),'APPROVED_STUDY_PLAN_REQUIRED','unapproved plan');
ok(seq.validateQuestion(meta('p1')).ok,'same-unit official question');
ok(seq.recordAnswer('p1',false).state.phase==='PRACTICE_READY','first miss continues official practice');
throws(()=>seq.validateQuestion(meta('other','official_practice','official','declarations')),'STUDY_UNIT_MISMATCH','different unit cannot mix');
ok(seq.validateQuestion(meta('p2')).ok,'second official practice');
ok(seq.recordAnswer('p2',false).state.phase==='CONFIRMATION_REQUIRED','second same-unit miss forces AI check');
throws(()=>seq.validateQuestion(meta('p3')),'AI_CONFIRMATION_REQUIRED','official practice blocked after two misses');
throws(()=>seq.validateQuestion(meta('c1','ai_confirmation','official','guarantee',{parentQuestionId:'p2'})),'AI_CONFIRMATION_REQUIRED','AI check origin required');
ok(seq.validateQuestion(meta('c1','ai_confirmation','ai','guarantee',{parentQuestionId:'p2'})).ok,'AI confirmation accepted');
const missed=seq.recordAnswer('c1',false);
ok(missed.state.officialPracticeCount===2&&missed.state.phase==='CONFIRMATION_REQUIRED','AI confirmation excluded and retry stays active');
ok(seq.validateQuestion(meta('c2','ai_confirmation','ai','guarantee',{parentQuestionId:'p2'})).ok,'fresh confirmation retry');
const passed=seq.recordAnswer('c2',true);
ok(passed.state.officialPracticeCount===2&&passed.state.consecutivePracticeMisses===0,'AI confirmation excluded and clears miss streak');
for(const id of ['p3','p4','p5']){ok(seq.validateQuestion(meta(id)).ok,'resume practice '+id);seq.recordAnswer(id,true);}
ok(seq.state().phase==='PRACTICE_READY'&&seq.state().batchCount===2,'the interrupted non-perfect trio does not trigger a choice');
for(const id of ['p6','p7','p8']){ok(seq.validateQuestion(meta(id)).ok,'continue same item '+id);seq.recordAnswer(id,true);}
ok(seq.state().phase==='PERFECT_RUN_CHOICE'&&seq.state().batchCount===3,'three same-unit correct official questions prompt a choice');
throws(()=>seq.validateQuestion(meta('p6')),'UNIT_CHOICE_REQUIRED','no question before user choice');
const next=seq.chooseAfterPerfectRun('next_unit');
ok(next.ok&&next.nextItemId==='declarations'&&next.state.itemId==='declarations','next unit comes from approved plan order');
throws(()=>seq.validateQuestion(meta('bad','official_practice','official','guarantee')),'STUDY_UNIT_MISMATCH','old unit blocked after move');
const same=createDeterministicLearningSequence({studyPlan:plan,itemId:'guarantee'});
for(const id of ['a','b','c']){same.validateQuestion(meta(id));same.recordAnswer(id,true);}
ok(same.chooseAfterPerfectRun('continue_same_unit').state.itemId==='guarantee','same-unit choice resets trio');
const imperfect=createDeterministicLearningSequence({studyPlan:plan,itemId:'guarantee'});
for(const [id,right] of [['x1',false],['x2',true],['x3',true]]){imperfect.validateQuestion(meta(id));imperfect.recordAnswer(id,right);}
ok(imperfect.state().phase==='PRACTICE_READY'&&imperfect.state().batchCount===0,'imperfect trio continues same unit');
const prediction=createDeterministicLearningSequence({studyPlan:plan,itemId:'guarantee'});
prediction.validateQuestion(meta('r1'));ok(prediction.predictNextKind(false).kind==='official_practice','first miss route remains same-unit official');
prediction.recordAnswer('r1',false);prediction.validateQuestion(meta('r2'));
ok(prediction.predictNextKind(false).kind==='ai_confirmation','second miss route is AI confirmation before grading');
ok(prediction.predictNextKind(true).kind==='official_practice','answer correction/reset route is official practice');
console.log('PASS deterministic learning sequence: approved plan binding, same-unit three-question group, two-miss AI confirmation, and perfect-run choice');
