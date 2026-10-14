/**
 * Cross-app study planning and learning-mode reducer. Pure JS, no network or storage.
 * AI apps must NOT claim this code runs in chat without an actual runtime connector.
 */
export const REVIEW_DAYS=Object.freeze([1,3,7,14,30]);
const fail=(reason)=>({ok:false,reason});
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const validDay=(s)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
export function makeLearningPlan({qualificationId,fields,frequencyEvidence=[],officialFieldOrder=[],randomOrder=[],exemptFieldIds=[]}={}){
 if(!qualificationId||!Array.isArray(fields)||!fields.length||new Set(fields.map(f=>f.id)).size!==fields.length||fields.some(f=>!f?.id||!f?.name))throw Error('INVALID_FIELDS');
 const exempt=new Set(exemptFieldIds),active=fields.filter(f=>!exempt.has(f.id));
 const byId=new Map(active.map(f=>[f.id,f]));
 const verified=frequencyEvidence.filter(x=>byId.has(x.fieldId)&&x.verified===true&&Number.isFinite(x.frequency)&&x.frequency>=0);
 let basis,ids;
 if(verified.length===active.length&&active.length){basis='verified_frequency';ids=[...verified].sort((a,b)=>b.frequency-a.frequency||a.fieldId.localeCompare(b.fieldId)).map(x=>x.fieldId);}
 else if(officialFieldOrder.filter(id=>byId.has(id)).length===active.length&&new Set(officialFieldOrder.filter(id=>byId.has(id))).size===active.length){basis='official_overview';ids=officialFieldOrder.filter(id=>byId.has(id));}
 else {basis='recorded_random';ids=randomOrder.filter(id=>byId.has(id));if(ids.length!==active.length||new Set(ids).size!==active.length)throw Error('RANDOM_ORDER_REQUIRED');}
 return Object.freeze({qualificationId,basis,fieldIds:Object.freeze(ids),fields:Object.freeze(ids.map(id=>byId.get(id))),exemptFieldIds:Object.freeze([...exempt].filter(id=>fields.some(f=>f.id===id)))});
}
export function initialStudyState(plan){
 if(!plan?.qualificationId||!Array.isArray(plan.fieldIds))throw Error('PLAN_REQUIRED');
 return {qualificationId:plan.qualificationId,fieldIds:[...plan.fieldIds],fieldId:plan.fieldIds[0]??null,mode:'choose_start',pendingQuestion:null,practiceMisses:{},reviewItems:{},returnContext:null,seenAttemptIds:[],lastAction:'choose_start'};
}
export function transitionStudy(state,event){
 if(!state||!event?.type)return fail('EVENT_REQUIRED');
 const s=structuredClone(state);
 if(event.type==='select_mode'){
  if(!['explanation','confirmation','practice'].includes(event.mode))return fail('INVALID_MODE');
  s.mode=event.mode;s.lastAction=event.mode==='practice'?'request_verified_official_question':event.mode==='confirmation'?'request_ai_confirmation':'explain_for_beginner';return {ok:true,state:s};
 }
 if(event.type==='explanation_complete'){
  if(s.mode!=='explanation')return fail('NOT_IN_EXPLANATION');
  s.mode='choose_after_explanation';s.lastAction='ask_confirmation_or_practice';return {ok:true,state:s};
 }
 if(event.type==='change_field'){
  if(!s.fieldIds.includes(event.fieldId))return fail('FIELD_NOT_IN_PLAN');
  s.fieldId=event.fieldId;s.mode='choose_start';s.pendingQuestion=null;s.lastAction='ask_mode';return {ok:true,state:s};
 }
 if(event.type==='question_ready'){
  if(s.pendingQuestion)return fail('QUESTION_ALREADY_PENDING');
  if(!event.questionId||!event.fieldId||event.fieldId!==s.fieldId||!['confirmation','practice'].includes(event.kind))return fail('QUESTION_BINDING_REQUIRED');
  if(event.kind==='practice'&&event.officialVerified!==true&&event.aiCreated!==true)return fail('OFFICIAL_OR_LABELLED_AI_REQUIRED');
  if(event.kind==='practice'&&event.officialVerified===true&&event.packetValidated!==true)return fail('OFFICIAL_PACKET_NOT_VALIDATED');
  if(event.kind==='confirmation'&&event.aiCreated!==true)return fail('AI_CONFIRMATION_REQUIRED');
  s.pendingQuestion={questionId:event.questionId,fieldId:event.fieldId,unitId:event.unitId??event.fieldId,kind:event.kind,officialVerified:event.officialVerified===true,aiCreated:event.aiCreated===true,packetValidated:event.packetValidated===true};
  s.mode='answer_wait';s.lastAction='render_full_question';return {ok:true,state:s};
 }
 if(event.type==='user_question'){
  // Free-form study question is not an answer and never consumes a pending question.
  s.lastAction='explain_user_question_and_resume';return {ok:true,state:s};
 }
 if(event.type==='answer'){
  const q=s.pendingQuestion;
  if(!q||q.questionId!==event.questionId||typeof event.correct!=='boolean'||!event.attemptId)return fail('VERIFIED_PENDING_ANSWER_REQUIRED');
  if(s.seenAttemptIds.includes(event.attemptId))return fail('DUPLICATE_ATTEMPT');
  if(!validDay(event.today))return fail('DATE_REQUIRED');
  s.seenAttemptIds.push(event.attemptId);
  s.pendingQuestion=null;
  const unit=q.unitId;
  if(q.kind==='practice'){
   s.practiceMisses[unit]=event.correct?0:(s.practiceMisses[unit]??0)+1;
   if(!event.correct&&s.practiceMisses[unit]>=3){s.mode='confirmation';s.lastAction='explain_then_confirmation';}
   else {s.mode='practice';s.lastAction='explain_then_next_practice';}
  }else if(event.correct){s.mode='confirmation_choice';s.lastAction='ask_continue_confirmation_or_step_up';}
  else {s.mode='confirmation';s.lastAction='explain_then_confirmation';}
  const p=s.reviewItems[unit];
  const weak=!event.correct||event.uncertain===true||event.hintUsed===true;
  if(weak){
   s.reviewItems[unit]={unitId:unit,fieldId:q.fieldId,stage:0,dueDate:addDays(event.today,1),status:'pending',successes:0};
  }else if(p?.status==='pending'){
   const next=Math.min(p.stage+1,REVIEW_DAYS.length-1);
   s.reviewItems[unit]={...p,stage:next,successes:p.successes+1,dueDate:next===REVIEW_DAYS.length-1&&p.stage===next?null:addDays(event.today,REVIEW_DAYS[next]),status:next===REVIEW_DAYS.length-1&&p.stage===next?'mastered':'pending'};
  }
  return {ok:true,state:s};
 }
 if(event.type==='choose_after_confirmation'){
  if(s.mode!=='confirmation_choice')return fail('CONFIRMATION_CHOICE_NOT_PENDING');
  return transitionStudy(s,{type:'select_mode',mode:event.choice==='step_up'?'practice':event.choice==='continue'?'confirmation':'invalid'});
 }
 if(event.type==='review_due'){
  if(!validDay(event.today))return fail('DATE_REQUIRED');
  const due=Object.values(s.reviewItems).filter(x=>x.status==='pending'&&x.dueDate<=event.today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  if(!due.length)return {ok:true,state:s,due:[]};
  if(s.pendingQuestion)return {ok:true,state:s,due};
  s.returnContext={fieldId:s.fieldId,mode:s.mode};s.fieldId=due[0].fieldId;s.mode='review';s.lastAction='ask_due_review';return {ok:true,state:s,due};
 }
 if(event.type==='finish_review'){
  if(!s.returnContext)return fail('NO_RETURN_CONTEXT');
  s.fieldId=s.returnContext.fieldId;s.mode=s.returnContext.mode;s.returnContext=null;s.lastAction='resume_previous_study';return {ok:true,state:s};
 }
 return fail('UNKNOWN_EVENT');
}
