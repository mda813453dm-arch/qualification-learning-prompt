import {createHash} from 'node:crypto';
import {createOfficialRetrievalPipeline} from './official-retrieval-pipeline.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const plan={status:'approved',qualificationId:'land-surveyor',sha256:'c'.repeat(64),itemIds:['control-points','traverse']};
const candidate=(year,questionId='q-'+year,studyUnitId='control-points')=>({
 qualificationId:plan.qualificationId,studyUnitId,studyPlanSha256:plan.sha256,
 year,section:'morning',questionId
});
const queue={status:'approved',candidates:[candidate(2025),candidate(2024)]};
const calls=[];
const buildInlinePayload=async({candidate})=>{
 const packetHash=createHash('sha256').update(candidate.questionId).digest('hex');
 const nodes=[
  {role:'question_number',value:'問'},
  {role:'body',value:'official question'},
  {role:'choices',value:['1','2','3','4']},
  {role:'instruction',value:'番号で答えてください。'}
 ];
 return {status:'ready',questionId:candidate.questionId,packetHash,
  signature:nodes.map(n=>n.role).join('>'),nodes,
  question:{id:candidate.questionId},
  packet:{id:candidate.questionId,packetHash}};
};
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
const pipeline=createOfficialRetrievalPipeline({retrieveAndVerify,adapters:[],buildInlinePayload,resolveCandidates:async input=>{
 ok(input.studyUnitId==='control-points'&&input.studyPlanSha256===plan.sha256,'resolver receives fixed unit and plan');
 return queue;
}});
const result=await pipeline({studyPlan:plan,studyUnitId:'control-points'});
ok(result.status==='ready','retrieval falls back to a verified candidate');
ok(result.verifiedQuestion.question.key.year===2024&&result.verifiedQuestion.question.key.questionNumber==='q-2024','selected candidate year and ID stay bound');
ok(result.verifiedQuestion.studyUnitId==='control-points'&&result.verifiedQuestion.studyPlanSha256===plan.sha256,'verified result carries approved unit binding');
ok(result.verifiedQuestion.inlinePayload.questionId==='q-2024'&&result.verifiedQuestion.inlinePayload.signature.endsWith('>choices>instruction'),'only a fully compiled inline packet is marked ready');
ok(calls.length===2&&calls[0].year===2025&&calls[1].year===2024,'same-unit candidates are tried in approved descending-year order');
ok(result.attempts[0].status==='unverified'&&result.attempts[1].status==='ready','attempt evidence distinguishes fallback');
let invocations=0;
const strict=createOfficialRetrievalPipeline({retrieveAndVerify:async()=>{invocations++;return null;},adapters:[],buildInlinePayload,resolveCandidates:async()=>({status:'approved',candidates:[candidate(2025,'wrong-unit','traverse')]})});
const mismatch=await strict({studyPlan:plan,studyUnitId:'control-points'});
ok(mismatch.status==='rejected'&&mismatch.reason==='CANDIDATE_BINDING_INVALID'&&invocations===0,'cross-unit candidate is blocked before retrieval');
const noPlan=await pipeline({studyUnitId:'control-points'});
ok(noPlan.status==='rejected'&&noPlan.reason==='APPROVED_STUDY_PLAN_REQUIRED','unapproved plan blocks retrieval');
const outOfOrder=createOfficialRetrievalPipeline({retrieveAndVerify,adapters:[],buildInlinePayload,resolveCandidates:async()=>({status:'approved',candidates:[candidate(2024),candidate(2025)]})});
const order=await outOfOrder({studyPlan:plan,studyUnitId:'control-points'});
ok(order.status==='rejected'&&order.reason==='CANDIDATE_YEAR_ORDER_INVALID','out-of-order fallback queue is rejected');
let configurationBlocked=false;
try{createOfficialRetrievalPipeline({retrieveAndVerify,adapters:[],resolveCandidates:async()=>queue});}
catch(error){configurationBlocked=error.message==='PIPELINE_CONFIGURATION_REQUIRED';}
ok(configurationBlocked,'a retrieval pipeline without a deterministic inline payload builder cannot start');
const incomplete=createOfficialRetrievalPipeline({
 retrieveAndVerify,adapters:[],resolveCandidates:async()=>queue,
 buildInlinePayload:async()=>({status:'ready',questionId:'q-2024',packetHash:'not-a-sha',question:{id:'q-2024'},packet:{id:'q-2024',packetHash:'not-a-sha'},signature:'question_number>body',nodes:[{role:'question_number'},{role:'body'}]})
});
const incompleteResult=await incomplete({studyPlan:plan,studyUnitId:'control-points'});
ok(incompleteResult.status==='unavailable'&&incompleteResult.attempts.at(-1).reason==='COMPLETE_INLINE_PACKET_REQUIRED',
 'incomplete or unbound display packet cannot be returned as ready');
console.log('PASS official retrieval pipeline: complete inline packet required, approved unit binding, descending-year fallback, and fail-closed rejection');
