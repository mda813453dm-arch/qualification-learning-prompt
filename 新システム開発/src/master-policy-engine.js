/**
 * Learning policy primitives: pure, auditable decisions.
 * The approved development override is 3 wrong practice answers;
 * main/master_prompt.txt remains unchanged.
 * The caller must supply verified official candidate metadata and a review queue.
 */
export const PRACTICE_WRONG_THRESHOLD = 3;
export const CONFIRMATION_WRONG_THRESHOLD = 3;

export function officialKey(q) {
  if (!q || !q.qualificationId || !Number.isInteger(q.year) || !q.section || !Number.isInteger(q.number)) return null;
  return [q.qualificationId,q.year,q.session??'regular',q.section,q.number].join(':');
}

export function selectOfficialCandidate({qualificationId,topicId,majorPoints=[],candidates=[],usedKeys=[],fixedYear=null}={}) {
  if (!qualificationId || !topicId) return {status:'blocked',reason:'TOPIC_REQUIRED'};
  const used=new Set(usedKeys);
  const eligible=candidates.filter(q=>
    q.qualificationId===qualificationId && q.topicId===topicId &&
    (!majorPoints.length || majorPoints.includes(q.pointId)) &&
    (fixedYear===null || q.year===fixedYear) &&
    q.officialVerified===true && q.answerVerified===true &&
    q.displayReady===true && q.status==='ready' &&
    officialKey(q)!==null && !used.has(officialKey(q)) &&
    q.currentLawCompatible===true
  );
  // Never infer an approved topic from adjacent question numbers.
  eligible.sort((a,b)=>b.year-a.year || a.number-b.number);
  return eligible.length?{status:'selected',question:eligible[0]}:
    {status:'needs_verified_candidate',reason:'NO_VERIFIED_MATCHING_TOPIC'};
}

export function summarizeLedger(events,topicId) {
  let practiceWrong=0, practiceCount=0, practiceCorrectRun=0;
  const confirmationWrongByChain={};
  const seen=new Set();
  for(const e of events) {
    if(e.topicId!==topicId || e.valid!==true || !e.attemptId || seen.has(e.attemptId))continue;
    seen.add(e.attemptId);
    if(e.kind==='practice') {
      practiceCount++;
      practiceWrong=e.correct?0:practiceWrong+1;
      practiceCorrectRun=e.correct?practiceCorrectRun+1:0;
    } else if(e.kind==='reinforcement' && e.correct===true) {
      practiceWrong=0;
    }
    if((e.kind==='reinforcement'||e.kind==='confirmation') && e.chainId) {
      const key=e.kind+':'+e.chainId;
      confirmationWrongByChain[key]=e.correct?0:(confirmationWrongByChain[key]??0)+1;
    }
  }
  return {practiceWrong,practiceCount,practiceCorrectRun,confirmationWrongByChain};
}

export function chooseNextLearningAction({now,reviewQueue=[],topicId,events=[],majorPointsComplete=false,explicitTopicId=null,parentReturn=null,confirmationChain=null}={}) {
  if(!Number.isFinite(now))return {action:'blocked',reason:'TIME_REQUIRED'};
  if(explicitTopicId)return {action:'start_topic',topicId:explicitTopicId};
  const due=reviewQueue.filter(x=>x && Number.isFinite(x.dueAt) && x.dueAt<=now && x.status==='pending')
    .sort((a,b)=>a.dueAt-b.dueAt);
  if(due.length)return {action:'due_review',item:due[0],returnContext:parentReturn??{topicId}};
  if(!topicId)return {action:'select_topic'};
  const summary=summarizeLedger(events,topicId);
  if(confirmationChain?.status==='pending')return {action:'resume_confirmation',chain:confirmationChain};
  if(confirmationChain?.status==='active') {
    const wrong=summary.confirmationWrongByChain[confirmationChain.kind+':'+confirmationChain.id]??0;
    if(wrong>=CONFIRMATION_WRONG_THRESHOLD)return {action:'confirmation_continue_menu',chain:confirmationChain};
    return {action:'confirmation_question',chain:confirmationChain};
  }
  if(summary.practiceWrong>=PRACTICE_WRONG_THRESHOLD)return {action:'reinforcement_question',topicId};
  if(parentReturn?.ready===true)return {action:'return_to_parent',returnContext:parentReturn};
  if(summary.practiceCount<3 || !majorPointsComplete)return {action:'official_practice',topicId};
  return {action:'review_or_next_topic',topicId};
}

/** No interval is invented: a verified scheduling policy supplies dueAt. */
export function recordReviewDue({topicId,pointId,dueAt,reason}) {
  if(!topicId||!pointId||!Number.isFinite(dueAt)||!reason)throw new Error('REVIEW_SCHEDULE_EVIDENCE_REQUIRED');
  return Object.freeze({topicId,pointId,dueAt,reason,status:'pending'});
}
