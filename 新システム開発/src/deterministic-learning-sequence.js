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
 const snapshot=()=>{const currentIndex=studyPlan.itemIds.indexOf(currentItemId);return Object.freeze({qualificationId,itemId:currentItemId,phase,batchCount,batchAllCorrect,hasNextUnit:currentIndex>=0&&currentIndex+1<studyPlan.itemIds.length,nextItemId:studyPlan.itemIds[currentIndex+1]||null,
  consecutivePracticeMisses,officialPracticeCount,confirmationMisses,
  pendingQuestion:pendingQuestion?Object.freeze({...pendingQuestion}):null,
  pendingOutcome:pendingOutcome?Object.freeze({...pendingOutcome}):null,
  seenQuestionIds:Object.freeze([...seenQuestionIds])});};
 const reject=reason=>Object.freeze({ok:false,reason,state:snapshot()});
 function validateQuestion(meta){
  if(!meta||!meta.questionId||!meta.qualificationId||!meta.itemId)return reject('QUESTION_BINDING_REQUIRED');
  if(meta.qualificationId!==qualificationId)return reject('QUALIFICATION_MISMATCH');
  if(meta.itemId!==currentItemId)return reject('STUDY_UNIT_MISMATCH');
  if(pendingQuestion){if(pendingQuestion.questionId===meta.questionId)return Object.freeze({ok:true,state:snapshot()});return reject('QUESTION_ALREADY_PENDING');}
  if(phase==='PERFECT_RUN_CHOICE')return reject('UNIT_CHOICE_REQUIRED');
  if(phase==='CONFIRMATION_CHOICE_REQUIRED')return reject('CONFIRMATION_CHOICE_REQUIRED');
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
   if(correct){consecutivePracticeMisses=0;phase='PRACTICE_READY';}else phase=confirmationMisses>=3?'CONFIRMATION_CHOICE_REQUIRED':'CONFIRMATION_REQUIRED';
   pendingOutcome=Object.freeze({questionId,itemId:currentItemId,kind:q.kind,correct,officialPracticeCount,confirmationMisses,directive:phase});
  }else return reject('QUESTION_KIND_INVALID');
  return Object.freeze({ok:true,state:snapshot(),outcome:pendingOutcome});
 }
 function predictNextKind(correct){
  if(!pendingQuestion||typeof correct!=='boolean')return reject('PENDING_QUESTION_REQUIRED');
  if(pendingQuestion.kind==='ai_confirmation')return Object.freeze({ok:true,kind:correct?'official_practice':confirmationMisses+1>=3?'confirmation_menu':'ai_confirmation'});
  if(!correct&&consecutivePracticeMisses+1>=2)return Object.freeze({ok:true,kind:'ai_confirmation'});
  if(correct&&batchCount===2&&batchAllCorrect)return Object.freeze({ok:true,kind:'unit_choice'});
  return Object.freeze({ok:true,kind:'official_practice'});
 }
 function chooseAfterConfirmationMisses(choice){
  if(phase!=='CONFIRMATION_CHOICE_REQUIRED')return reject('CONFIRMATION_CHOICE_NOT_PENDING');
  if(choice==='continue_confirmation'){
   phase='CONFIRMATION_BRIEF_EXPLANATION_REQUIRED';pendingOutcome=null;
   return Object.freeze({ok:true,state:snapshot(),nextKind:'ai_confirmation',requiresBriefExplanation:true});
  }
  if(choice==='hold_and_move'){
   const currentIndex=studyPlan.itemIds.indexOf(currentItemId);
   const nextItemId=studyPlan.itemIds[currentIndex+1]||null;
   if(!nextItemId){phase='SESSION_END_REQUIRED';pendingOutcome=null;return Object.freeze({ok:true,state:snapshot(),sessionEndRequired:true,heldItemId:currentItemId});}
   currentItemId=nextItemId;batchCount=0;batchAllCorrect=true;consecutivePracticeMisses=0;
   officialPracticeCount=0;confirmationMisses=0;phase='PRACTICE_READY';pendingOutcome=null;
   return Object.freeze({ok:true,state:snapshot(),nextItemId,heldItemId:studyPlan.itemIds[currentIndex]});
  }
  return reject('CONFIRMATION_CHOICE_INVALID');
 }
 function completeBriefExplanation(text){
  if(phase!=='CONFIRMATION_BRIEF_EXPLANATION_REQUIRED')return reject('BRIEF_EXPLANATION_NOT_PENDING');
  if(typeof text!=='string'||!text.trim())return reject('BRIEF_EXPLANATION_REQUIRED');
  phase='CONFIRMATION_REQUIRED';
  return Object.freeze({ok:true,state:snapshot()});
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
 return Object.freeze({state:snapshot,validateQuestion,recordAnswer,predictNextKind,chooseAfterConfirmationMisses,completeBriefExplanation,chooseAfterPerfectRun});
}