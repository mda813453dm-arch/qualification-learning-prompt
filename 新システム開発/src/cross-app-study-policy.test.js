import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLearningPlan,initialStudyState,transitionStudy} from './cross-app-study-policy.js';
const fields=[{id:'a',name:'A'},{id:'b',name:'B'}];
const plan=()=>makeLearningPlan({qualificationId:'generic',fields,officialFieldOrder:['a','b']});
const apply=(s,e)=>{const r=transitionStudy(s,e);assert.equal(r.ok,true,JSON.stringify(r));return r.state;};
test('frequency > official order > supplied stable random',()=>{
 assert.deepEqual(makeLearningPlan({qualificationId:'q',fields,frequencyEvidence:[{fieldId:'a',frequency:1,verified:true},{fieldId:'b',frequency:3,verified:true}]}).fieldIds,['b','a']);
 assert.deepEqual(plan().fieldIds,['a','b']);
 assert.deepEqual(makeLearningPlan({qualificationId:'q',fields,randomOrder:['b','a']}).fieldIds,['b','a']);
 assert.throws(()=>makeLearningPlan({qualificationId:'q',fields}),/RANDOM_ORDER_REQUIRED/);
});
test('start choice and explanation choice',()=>{
 let s=initialStudyState(plan());assert.equal(s.mode,'choose_start');
 s=apply(s,{type:'select_mode',mode:'explanation'});
 s=apply(s,{type:'explanation_complete'});assert.equal(s.lastAction,'ask_confirmation_or_practice');
});
test('confirmation correct asks user every time; free question never grades',()=>{
 let s=apply(initialStudyState(plan()),{type:'select_mode',mode:'confirmation'});
 s=apply(s,{type:'question_ready',questionId:'c1',fieldId:'a',kind:'confirmation',aiCreated:true});
 s=apply(s,{type:'user_question'});assert.equal(s.pendingQuestion.questionId,'c1');
 s=apply(s,{type:'answer',questionId:'c1',correct:true,attemptId:'1',today:'2026-10-14'});
 assert.equal(s.mode,'confirmation_choice');
 s=apply(s,{type:'choose_after_confirmation',choice:'step_up'});assert.equal(s.mode,'practice');
});
test('three practice misses per unit and review registration',()=>{
 let s=apply(initialStudyState(plan()),{type:'select_mode',mode:'practice'});
 for(let i=0;i<3;i++){
 s=apply(s,{type:'question_ready',questionId:'p'+i,fieldId:'a',unitId:'a1',kind:'practice',officialVerified:true,packetValidated:true});
 s=apply(s,{type:'answer',questionId:'p'+i,correct:false,attemptId:'p'+i,today:'2026-10-14'});
 }
 assert.equal(s.mode,'confirmation');assert.equal(s.practiceMisses.a1,3);assert.equal(s.reviewItems.a1.dueDate,'2026-10-15');
});
test('unverified official question rejected',()=>{
 const r=transitionStudy(initialStudyState(plan()),{type:'question_ready',questionId:'p',fieldId:'a',kind:'practice',officialVerified:true});
 assert.equal(r.ok,false);assert.equal(r.reason,'OFFICIAL_PACKET_NOT_VALIDATED');
});
test('review due saves and restores study context',()=>{
 let s=initialStudyState(plan());s.reviewItems.a={unitId:'a',fieldId:'a',status:'pending',dueDate:'2026-10-14',stage:0,successes:0};
 s=apply(s,{type:'change_field',fieldId:'b'});s=apply(s,{type:'select_mode',mode:'practice'});
 s=apply(s,{type:'review_due',today:'2026-10-14'});assert.equal(s.mode,'review');assert.equal(s.fieldId,'a');
 s=apply(s,{type:'finish_review'});assert.equal(s.fieldId,'b');assert.equal(s.mode,'practice');
});
