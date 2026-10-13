/** In-chat runtime bridge: never emit an unverified or incomplete question. */
import {selectOfficialCandidate,officialKey,chooseNextLearningAction} from './master-policy-engine.js';
import {selectDueReviews} from './review-scheduler.js';
import {exportCheckpoint,restoreCheckpoint} from './session-checkpoint.js';

export function prepareInChatTurn({session,candidates=[],nowMs,today,majorPoints=[],fixedYear=null}){
 if(!session?.qualificationId||!session.topicId)return {status:'blocked',reason:'SESSION_CONTEXT_REQUIRED'};
 if(!today)return {status:'blocked',reason:'JST_DATE_REQUIRED'};
 const due=selectDueReviews({today,items:session.reviewItems??[],explicitTopic:!!session.explicitTopic,practiceSinceReview:session.practiceSinceReview??0,sessionStart:session.sessionStart!==false,defer:!!session.deferReview});
 const dueUnit=due.items[0];
 const topicId=dueUnit?.topicId??session.topicId;
 const action=chooseNextLearningAction({now:nowMs,topicId,events:session.ledger??[],majorPointsComplete:!!session.majorPointsComplete,confirmationChain:session.confirmationChain??null});
 if(action.action==='blocked')return {status:'blocked',reason:action.reason};
 if(action.action==='reinforcement_question'||action.action==='confirmation_question'||action.action==='confirmation_continue_menu')return {status:'needs_confirmation',action:action.action,topicId};
 const picked=selectOfficialCandidate({qualificationId:session.qualificationId,topicId,majorPoints,candidates,usedKeys:session.usedOfficialKeys??[],fixedYear});
 if(picked.status!=='selected')return {status:'needs_verified_official',reason:picked.reason,topicId};
 const q=picked.question;
 if(typeof q.stem!=='string'||!q.stem.trim()||!Array.isArray(q.choices)||q.choices.length<2||q.choices.some(x=>typeof x!=='string'||!x.trim()))return {status:'blocked',reason:'COMPLETE_TEXT_REQUIRED'};
 if(!q.problemUrl||!q.answerEvidence||!q.packetHash||!Number.isInteger(q.correctAnswer)||q.correctAnswer<1||q.correctAnswer>q.choices.length)return {status:'blocked',reason:'ANSWER_AND_SOURCE_BINDING_REQUIRED'};
 if(q.hasVisuals===true&&(!Array.isArray(q.visualAssets)||!q.visualAssets.length||q.visualAssets.some(x=>x.verified!==true||!x.path)))return {status:'blocked',reason:'VERIFIED_INLINE_VISUAL_REQUIRED'};
 const packet=Object.freeze({status:'ready',packetHash:q.packetHash,questionKey:officialKey(q),topicId,year:q.year,number:q.number,stem:q.stem,choices:q.choices,correctAnswer:q.correctAnswer,problemUrl:q.problemUrl,answerEvidence:q.answerEvidence,visualAssets:q.visualAssets??[],purpose:dueUnit?'due_review':'practice',reviewUnitId:dueUnit?.unitId??null});
 return {status:'ready',packet};
}

export function gradeInChatAnswer(packet,input){
 if(packet?.status!=='ready'||!packet.packetHash)return {status:'blocked',reason:'PINNED_PACKET_REQUIRED'};
 const value=String(input??'').trim();
 if(!/^[1-9]\d*$/.test(value))return {status:'invalid_answer'};
 const selected=Number(value);
 if(selected<1||selected>packet.choices.length)return {status:'invalid_answer'};
 return {status:'graded',correct:selected===packet.correctAnswer,correctAnswer:packet.correctAnswer,selected,packetHash:packet.packetHash,questionKey:packet.questionKey};
}

export function checkpointInChatSession(session,at){
 return exportCheckpoint({...session,at});
}
export {restoreCheckpoint};
