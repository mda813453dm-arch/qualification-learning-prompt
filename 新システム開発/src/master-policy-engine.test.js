import {strict as assert} from 'node:assert';
import {officialKey,selectOfficialCandidate,summarizeLedger,chooseNextLearningAction,recordReviewDue} from './master-policy-engine.js';
const base={qualificationId:'takken',topicId:'37',pointId:'37-written',session:'regular',section:'general',status:'ready',officialVerified:true,answerVerified:true,displayReady:true,currentLawCompatible:true};
const q=(year,number,changes={})=>({...base,year,number,...changes});
const candidates=[q(2025,29),q(2024,32),q(2025,30,{topicId:'other'}),q(2023,29,{answerVerified:false})];
let x=selectOfficialCandidate({qualificationId:'takken',topicId:'37',candidates,usedKeys:[officialKey(candidates[0])]});
assert.equal(x.question.year,2024,'cross-year topic must outrank adjacent 2025 question');
assert.equal(x.question.number,32);
assert.equal(selectOfficialCandidate({qualificationId:'takken',topicId:'37',candidates,fixedYear:2025,usedKeys:[officialKey(candidates[0])]}).status,'needs_verified_candidate');
assert.equal(selectOfficialCandidate({qualificationId:'takken',topicId:'37',candidates:[q(2025,30,{currentLawCompatible:false})]}).status,'needs_verified_candidate');
const events=[
 {topicId:'37',kind:'practice',attemptId:'1',valid:true,correct:false},
 {topicId:'other',kind:'practice',attemptId:'2',valid:true,correct:false},
 {topicId:'37',kind:'practice',attemptId:'3',valid:true,correct:false},
 {topicId:'37',kind:'practice',attemptId:'3',valid:true,correct:false},
 {topicId:'37',kind:'practice',attemptId:'4',valid:false,correct:false},
 {topicId:'37',kind:'practice',attemptId:'5',valid:true,correct:false},
];
assert.equal(summarizeLedger(events,'37').practiceWrong,3);
assert.equal(chooseNextLearningAction({now:100,topicId:'37',events}).action,'reinforcement_question');
const queue=[recordReviewDue({topicId:'other',pointId:'x',dueAt:90,reason:'recall-failure'})];
assert.equal(chooseNextLearningAction({now:100,topicId:'37',events,reviewQueue:queue}).action,'due_review');
assert.equal(chooseNextLearningAction({now:100,topicId:'37',events,reviewQueue:queue,explicitTopicId:'target'}).action,'start_topic');
assert.equal(chooseNextLearningAction({now:100,topicId:'37',events:[...events,{topicId:'37',kind:'reinforcement',attemptId:'6',valid:true,correct:true}]}).action,'review_or_next_topic');
assert.equal(chooseNextLearningAction({now:100,topicId:'37',confirmationChain:{id:'c1',kind:'confirmation',status:'active'},events:[
 {topicId:'37',kind:'confirmation',chainId:'c1',attemptId:'c1',valid:true,correct:false},
 {topicId:'37',kind:'confirmation',chainId:'c1',attemptId:'c2',valid:true,correct:false},
 {topicId:'37',kind:'confirmation',chainId:'c1',attemptId:'c3',valid:true,correct:false}
]}).action,'confirmation_continue_menu');
console.log('PASS master-policy-engine topic-first multi-year, review priority, distinct ledgers');
