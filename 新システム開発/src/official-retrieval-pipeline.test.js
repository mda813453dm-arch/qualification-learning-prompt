import {createOfficialRetrievalPipeline} from './official-retrieval-pipeline.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const plan={status:'approved',qualificationId:'land-surveyor',sha256:'c'.repeat(64),itemIds:['control-points','traverse']};
const candidate=(year,questionId='q-'+year,studyUnitId='control-points')=>({
 qualificationId:plan.qualificationId,studyUnitId,studyPlanSha256:plan.sha256,
 year,section:'morning',questionId
});
const queue={status:'approved',candidates:[candidate(2025),candidate(2024)]};
const calls=[];
const retrieveAndVerify=async c=>{
 calls.push(c);
 if(c.year===2025)return {status:'unavailable',reason:'PDF_READ_FAILED'};
 const question={id:c.questionId,year:c.year,section:c.section,text:'official question',choices:[
  {text:'choice 1'},{text:'choice 2'},{text:'choice 3'},{text:'choice 4'}],
  source:{official:true,url:'https://official.example/problem.pdf'}};
 const answer={questionId:c.questionId,year:c.year,section:c.section,number:2,page:1,evidence:'問1 2',
  source:{official:true,url:'https://official.example/answer.pdf'}};
 return {status:'verified',key:{qualification:c.qualificationId},question,answer};
};
const pipeline=createOfficialRetrievalPipeline({retrieveAndVerify,adapters:[],resolveCandidates:async input=>{
 ok(input.studyUnitId==='control-points'&&input.studyPlanSha256===plan.sha256,'resolver receives fixed unit and plan');
 return queue;
}});
const result=await pipeline({studyPlan:plan,studyUnitId:'control-points'});
ok(result.status==='ready','retrieval falls back to a verified candidate');
ok(result.verifiedQuestion.question.key.year===2024&&result.verifiedQuestion.question.key.questionNumber==='q-2024','selected candidate year and ID stay bound');
ok(result.verifiedQuestion.studyUnitId==='control-points'&&result.verifiedQuestion.studyPlanSha256===plan.sha256,'verified result carries approved unit binding');
ok(calls.length===2&&calls[0].year===2025&&calls[1].year===2024,'same-unit candidates are tried in approved descending-year order');
ok(result.attempts[0].status==='unverified'&&result.attempts[1].status==='ready','attempt evidence distinguishes fallback');
let invocations=0;
const strict=createOfficialRetrievalPipeline({retrieveAndVerify:async()=>{invocations++;return null;},adapters:[],resolveCandidates:async()=>({status:'approved',candidates:[candidate(2025,'wrong-unit','traverse')]})});
const mismatch=await strict({studyPlan:plan,studyUnitId:'control-points'});
ok(mismatch.status==='rejected'&&mismatch.reason==='CANDIDATE_BINDING_INVALID'&&invocations===0,'cross-unit candidate is blocked before retrieval');
const noPlan=await pipeline({studyUnitId:'control-points'});
ok(noPlan.status==='rejected'&&noPlan.reason==='APPROVED_STUDY_PLAN_REQUIRED','unapproved plan blocks retrieval');
const outOfOrder=createOfficialRetrievalPipeline({retrieveAndVerify,adapters:[],resolveCandidates:async()=>({status:'approved',candidates:[candidate(2024),candidate(2025)]})});
const order=await outOfOrder({studyPlan:plan,studyUnitId:'control-points'});
ok(order.status==='rejected'&&order.reason==='CANDIDATE_YEAR_ORDER_INVALID','out-of-order fallback queue is rejected');
console.log('PASS official retrieval pipeline: approved unit binding, descending-year fallback, and fail-closed rejection');
