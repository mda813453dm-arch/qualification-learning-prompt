export function createDeterministicLearningSequence({studyPlan,itemId}={}){
 if(!studyPlan||studyPlan.status!=='approved'||!studyPlan.qualificationId||
    !/^[a-f0-9]{64}$/.test(studyPlan.sha256||'')||!Array.isArray(studyPlan.itemIds)||
    studyPlan.itemIds.length===0||new Set(studyPlan.itemIds).size!==studyPlan.itemIds.length)
  throw new Error('APPROVED_STUDY_PLAN_REQUIRED');
 if(!itemId||!studyPlan.itemIds.includes(itemId))throw new Error('STUDY_UNIT_NOT_IN_PLAN');
 const qualificationId=studyPlan.qualificationId;
 let currentItemId=itemId,phase='PRACTICE_READY',batchCount=0,batchAllCorrect=true;
 let consecutivePracticeMisses=0,officialPracticeCount=0,confirmationMisses=0;
 let pendingQuestion=null,pendingOutcome=null;
 const seenQuestionIds=new Set();
 const snapshot=()=>Object.freeze({qualificationId,itemId:currentItemId,phase,batchCount,batchAllCorrect,
  consecutivePracticeMisses,officialPracticeCount,confirmationMisses,
  pendingQuestion:pendingQuestion?Object.freeze({...pendingQuestion}):null,
  pendingOutcome:pendingOutcome?Object.freeze({...pendingOutcome}):null,
  seenQuestionIds:Object.freeze([...seenQuestionIds])});
 const reject=reason=>Object.freeze({ok:false,reason,state:snapshot()});
 function validateQuestion(meta){
  if(!meta||!meta.questionId||!meta.qualificationId||!meta.itemId)return reject('QUESTION_BINDING_REQUIRED');
  if(meta.qualificationId!==qualificationId)return reject('QUALIFICATION_MISMATCH');
  if(meta.itemId!==currentItemId)return reject('STUDY_UNIT_MISMATCH');
  if(pendingQuestion){if(pendingQuestion.questionId===meta.questionId)return Object.freeze({ok:true,state:snapshot()});return reject('QUESTION_ALREADY_PENDING');}
  if(phase==='PERFECT_RUN_CHOICE')return reject('UNIT_CHOICE_REQUIRED');
  if(phase==='CONFIRMATION_REQUIRED'){
   if(meta.kind!=='ai_confirmation'||meta.origin!=='ai'||!meta.parentQuestionId)return reject('AI_CONFIRMATION_REQUIRED');
  }else if(meta.kind!=='official_practice'||meta.origin!=='official'||meta.verifiedBundle!==true)
   return reject('OFFICIAL_SAME_UNIT_PRACTICE_REQUIRED');
  if(seenQuestionIds.has(meta.questionId))return reject('QUESTION_ALREADY_USED');
  pendingQuestion=Object.freeze({...meta});seenQuestionIds.add(meta.questionId);
  return Object.freeze({ok:true,state:snapshot()});
 }
 function recordAnswer(questionId,correct){
  if(!pendingQuestion||pendingQuestion.questionId!==questionId)return reject('PENDING_QUESTION_MISMATCH');
  if(typeof correct!=='boolean')return reject('ANSWER_RESULT_REQUIRED');
  const q=pendingQuestion;pendingQuestion=null;
  if(q.kind==='official_practice'){
   officialPracticeCount++;batchCount++;batchAllCorrect=batchAllCorrect&&correct;
   consecutivePracticeMisses=correct?0:consecutivePracticeMisses+1;
   if(consecutivePracticeMisses>=2)phase='CONFIRMATION_REQUIRED';
   else if(batchCount===3&&batchAllCorrect)phase='PERFECT_RUN_CHOICE';
   else if(batchCount===3){batchCount=0;batchAllCorrect=true;phase='PRACTICE_READY';}
   else phase='PRACTICE_READY';
   pendingOutcome=Object.freeze({questionId,itemId:currentItemId,kind:q.kind,correct,officialPracticeCount,batchCount,batchAllCorrect,consecutivePracticeMisses,directive:phase});
  }else if(q.kind==='ai_confirmation'&&q.origin==='ai'){
   confirmationMisses=correct?0:confirmationMisses+1;
   if(correct){consecutivePracticeMisses=0;phase='PRACTICE_READY';}else phase='CONFIRMATION_REQUIRED';
   pendingOutcome=Object.freeze({questionId,itemId:currentItemId,kind:q.kind,correct,officialPracticeCount,confirmationMisses,directive:phase});
  }else return reject('QUESTION_KIND_INVALID');
  return Object.freeze({ok:true,state:snapshot(),outcome:pendingOutcome});
 }
 function chooseAfterPerfectRun(choice){
  if(phase!=='PERFECT_RUN_CHOICE')return reject('PERFECT_RUN_CHOICE_NOT_PENDING');
  const currentIndex=studyPlan.itemIds.indexOf(currentItemId);
  if(choice==='continue_same_unit'){
   batchCount=0;batchAllCorrect=true;phase='PRACTICE_READY';pendingOutcome=null;
   return Object.freeze({ok:true,state:snapshot(),nextItemId:currentItemId});
  }
  if(choice==='next_unit'){
   const nextItemId=studyPlan.itemIds[currentIndex+1];
   if(!nextItemId)return reject('NEXT_STUDY_UNIT_NOT_IN_PLAN');
   currentItemId=nextItemId;batchCount=0;batchAllCorrect=true;consecutivePracticeMisses=0;
   officialPracticeCount=0;confirmationMisses=0;phase='PRACTICE_READY';pendingOutcome=null;
   return Object.freeze({ok:true,state:snapshot(),nextItemId});
  }
  return reject('UNIT_CHOICE_INVALID');
 }
 return Object.freeze({state:snapshot,validateQuestion,recordAnswer,chooseAfterPerfectRun});
}