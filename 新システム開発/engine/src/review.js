/**
 * 復習の予定（src/review-scheduler.js をそのまま移植。日付はJSTの暦日、時計や保存先には依存しない）。
 */
export const INTERVALS=Object.freeze([1,3,7,14,30]);
const date=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const add=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const days=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
/** intervals：復習の間隔（日）。学習計画の「復習頻度・タイミング」で選んだ型。既定は 1→3→7→14→30日。 */
export function updateReviewItem(previous,event,{today,examDate=null,intervals=INTERVALS,intervalsMinutes=null,now=null}={}){
 if(!date(today))return {status:'date_unverified',item:previous??null};
 if(examDate!==null&&!date(examDate))throw Error('INVALID_EXAM_DATE');
 if(!event?.unitId||!event.topicId)throw Error('REVIEW_UNIT_REQUIRED');
 const p=previous??null;
 const minuteBased=Array.isArray(intervalsMinutes)&&intervalsMinutes.length>0;
 if(minuteBased&&intervalsMinutes.some((m,i)=>!Number.isInteger(m)||m<0||m>525600||(i>0&&m<=intervalsMinutes[i-1])))throw Error('INVALID_REVIEW_INTERVALS');
 const steps=minuteBased?intervalsMinutes:(intervals.length?intervals:INTERVALS);
 const current=Number.isFinite(now)?now:Date.parse(today+'T00:00:00+09:00');
 const dueTime=(m)=>new Date(current+m*60000).toISOString();
 const dueDay=(iso)=>new Date(Date.parse(iso)+9*3600000).toISOString().slice(0,10);
 let step=Number.isInteger(p?.step)&&p.step<steps.length?p.step:Math.max(0,steps.indexOf(p?.intervalDays));
 let stage=steps[step], successes=p?.recallSuccesses??0, due=p?.dueDate??null;
 let dueAt=p?.dueAt??null, mastered=p?.mastered??false;
 const nextDue=()=>{ if(minuteBased){dueAt=dueTime(stage);due=dueDay(dueAt);}else{due=add(today,stage);dueAt=null;} };
 const isDue=()=>dueAt?Date.parse(dueAt)<=current:!!due&&due<=today;
 const result=event.result;
 if(!['wrong','recall_failure','confident_correct','guess_correct','hinted_correct','skip','exposed','invalid'].includes(result))throw Error('INVALID_REVIEW_RESULT');
 if(!p&&!['wrong','recall_failure','guess_correct'].includes(result)&&event.explicitReview!==true)return {status:'not_registered',item:null};
 if(result==='wrong'||result==='recall_failure'){step=0;stage=steps[0];successes=0;due=add(today,stage);}
 else if(result==='guess_correct'){
   successes=0;
   if(!due||due<=today)due=add(today,stage);
 }else if(result==='confident_correct'&&!event.hintShown){
   if(!due)due=add(today,stage);
   else if(due<=today){step=Math.min(step+1,steps.length-1);stage=steps[step];successes++;due=add(today,stage);}
 }
 let comprehensive=false;
 if(due&&examDate&&due>=examDate){
   const gap=days(today,examDate);
   if(gap<=1){due=null;comprehensive=true;}
   else due=add(today,Math.max(1,Math.floor(gap/2)));
 }
 return {status:'updated',item:Object.freeze({qualificationId:event.qualificationId??p?.qualificationId??null,topicId:event.topicId,unitId:event.unitId,pointId:event.pointId??p?.pointId??null,source:event.source??p?.source??'self_report',intervalDays:stage,step,recallSuccesses:successes,lastJudgedDate:today,dueDate:due,lastResult:result,comprehensive,exemptStopped:p?.exemptStopped??false})};
}
export function selectDueReviews({today,items=[],explicitTopic=false,defer=false,practiceSinceReview=0,sessionStart=true}={}){
 if(!date(today))return {status:'date_unverified',items:[]};
 const due=items.filter(x=>!x.exemptStopped&&x.dueDate&&x.dueDate<=today);
 due.sort((a,b)=>a.dueDate.localeCompare(b.dueDate) || Number(b.source==='wrong'||b.source==='self_report')-Number(a.source==='wrong'||a.source==='self_report'));
 if(defer)return {status:'deferred',items:[]};
 if(!explicitTopic&&sessionStart)return {status:'due',items:due.slice(0,5)};
 return {status:'due',items:practiceSinceReview>=2?due.slice(0,1):[]};
}
export function consumeReview(queue,{unitId,attemptId,valid,explanationComplete,isReinforcement=false}){
 if(!queue?.queueId||!unitId||!attemptId)throw Error('REVIEW_CONSUME_KEY_REQUIRED');
 if(!valid||!explanationComplete||isReinforcement)return queue;
 const key=[queue.queueId,unitId,attemptId].join(':');
 if(queue.consumedKeys?.includes(key))return queue;
 if(queue.unitIds?.[queue.nextIndex]!==unitId)throw Error('REVIEW_QUEUE_ORDER_MISMATCH');
 return {...queue,consumedKeys:[...(queue.consumedKeys??[]),key],nextIndex:queue.nextIndex+1};
}
