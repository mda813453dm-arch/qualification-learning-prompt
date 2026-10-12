import {createDeterministicSession} from './deterministic-session-machine.js';
import {compileChatInlinePayload,verifyChatInlineReceipt} from './chat-inline-render-adapter.js';
import {compileLegalBasisExplanation,resolveExplanationPolicy} from './legal-basis-explanation.js';
import {createDeterministicLearningSequence} from './deterministic-learning-sequence.js';

function immutableJson(value){
 const copy=JSON.parse(JSON.stringify(value));
 const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
 return freeze(copy);
}
export function createInlineStudyFlow(assetRegistry,options={}){
 const machine=createDeterministicSession();
 const verifyOfficialSource=options.verifyOfficialSource;
 const studyPlan=options.studyPlan;
 if(!studyPlan||studyPlan.status!=='approved'||!studyPlan.qualificationId||
    !/^[a-f0-9]{64}$/.test(studyPlan.sha256||'')||!Array.isArray(studyPlan.itemIds)||studyPlan.itemIds.length===0)
  throw new Error('APPROVED_STUDY_PLAN_REQUIRED');
 let payload=null,prefetchedNext=null,currentExplanationPolicy='general';
 let learningSequence=null,currentLearningContext=null,explanationDecision=null,pendingClarification=null;
 const explanationPreferences=options.explanationPreferences||{};
 const explanationPreference=itemId=>explanationPreferences[itemId]||options.explanationPreference||'ask_each';
 if(!['ask_each','detailed','skip'].includes(options.explanationPreference||'ask_each'))throw new Error('EXPLANATION_PREFERENCE_INVALID');
 const must=r=>{if(!r||r.ok!==true)throw new Error(r?.reason||'FLOW_REJECTED');return r;};
 const makeLearningContext=(question,qualificationId)=>{
  if(!question?.id||!question.studyUnitId||question.studyPlanSha256!==studyPlan.sha256)
   throw new Error('STUDY_PLAN_BINDING_REQUIRED');
  if(!studyPlan.itemIds.includes(question.studyUnitId))throw new Error('STUDY_UNIT_NOT_IN_PLAN');
  return immutableJson({
   questionId:question.id,qualificationId,itemId:question.studyUnitId,
   kind:question.kind,origin:question.origin,verifiedBundle:question.verifiedBundle===true,
   parentQuestionId:question.parentQuestionId||null
  });
 };
 const pinPrefetchedRoute=(kind,itemId)=>{
  const routes=Array.isArray(prefetchedNext)?prefetchedNext:(prefetchedNext?[prefetchedNext]:[]);
  const selected=routes.find(x=>x.input.learningContext.kind===kind&&x.input.learningContext.itemId===itemId);
  if(!selected)throw new Error('NEXT_BRANCH_PACKET_NOT_PREFETCHED:'+kind);
  prefetchedNext=selected;
  return selected;
 };
 const commitPinnedNext=()=>{
  if(!prefetchedNext)throw new Error('NEXT_NOT_PREFETCHED');
  const {number,input,payload:nextPayload,policy}=prefetchedNext;
  must(learningSequence.validateQuestion(input.learningContext));
  must(machine.dispatch({type:'FIX_NEXT',nextQuestionNumber:number}));
  must(machine.dispatch({type:'LOAD_NEXT',question:input.question}));
  must(machine.dispatch({type:'PIN_ASSETS',assets:input.assets}));
  must(machine.dispatch({type:'VALIDATE_PACKET',packet:input.packet}));
  payload=nextPayload;currentExplanationPolicy=policy;currentLearningContext=input.learningContext;explanationDecision=null;prefetchedNext=null;
  return Object.freeze({state:machine.state(),payload:nextPayload,learning:learningSequence.state()});
 };
 return Object.freeze({
  state(){return machine.state();},
  learningState(){return learningSequence?.state()||null;},
  prepare(x){
   if(x.qualificationId!==studyPlan.qualificationId)throw new Error('STUDY_PLAN_QUALIFICATION_MISMATCH');
   const context=makeLearningContext(x.question,x.qualificationId);
   if(x.question.id!==x.packet?.id||x.question.studyUnitId!==x.packet?.studyUnitId||
      x.packet.studyPlanSha256!==studyPlan.sha256)throw new Error('QUESTION_PACKET_BINDING_MISMATCH');
   const policy=resolveExplanationPolicy(x.qualificationId,x.question,x.packet);
   const candidatePayload=compileChatInlinePayload(x.packet,assetRegistry);
   if(candidatePayload.status!=='ready')throw new Error(candidatePayload.reason);
   if(!learningSequence)learningSequence=createDeterministicLearningSequence({studyPlan,itemId:context.itemId});
   must(learningSequence.validateQuestion(context));
   must(machine.dispatch({type:'SET_QUALIFICATION',qualificationId:x.qualificationId}));
   must(machine.dispatch({type:'PIN_SOURCE',source:x.source}));
   must(machine.dispatch({type:'PIN_QUESTION',question:x.question}));
   must(machine.dispatch({type:'PIN_ASSETS',assets:x.assets}));
   must(machine.dispatch({type:'VALIDATE_PACKET',packet:x.packet}));
   payload=candidatePayload;currentExplanationPolicy=policy;currentLearningContext=context;
   return payload;
  },
  rendered(receipt){
   if(!payload)throw new Error('PAYLOAD_NOT_PREPARED');
   const v=verifyChatInlineReceipt(payload,receipt);
   if(!v.ok)throw new Error(v.reason);
   must(machine.dispatch({type:'COMMIT_RENDER',receipt}));
   must(machine.dispatch({type:'OPEN_ANSWER'}));
   return machine.state();
  },
  prefetchNext(number,nextInput){
   const phase=machine.state().phase;
   const sequencePhase=learningSequence?.state().phase;
   const afterChoice=phase==='EXPLAINED'&&['PRACTICE_READY','CONFIRMATION_REQUIRED'].includes(sequencePhase);
   if(phase!=='ANSWER_WAIT'&&!afterChoice)throw new Error('NEXT_PREFETCH_NOT_ALLOWED');
   const requests=Array.isArray(number)?number:[{number,input:nextInput}];
   if(!requests.length)throw new Error('NEXT_PREFETCH_INPUT_REQUIRED');
   const existing=Array.isArray(prefetchedNext)?prefetchedNext:(prefetchedNext?[prefetchedNext]:[]);
   const compiled=[];
   for(const request of requests){
    const n=request.number,input=request.input;
    const question=input?.question,packet=input?.packet;
    if(!question||question.status!=='ready'||question.number!==n)throw new Error('NEXT_NUMBER_MISMATCH');
    if(!packet||packet.status!=='ready')throw new Error('NEXT_PACKET_NOT_READY');
    if(packet.number!==n)throw new Error('NEXT_PACKET_NUMBER_MISMATCH');
    if(!question.id||packet.id!==question.id)throw new Error('NEXT_QUESTION_ID_MISMATCH');
    const context=makeLearningContext(question,studyPlan.qualificationId);
    const sequence=learningSequence.state();
    const allowedUnitIds=new Set([sequence.itemId]);
    if(sequence.batchCount===2&&sequence.batchAllCorrect&&sequence.hasNextUnit)allowedUnitIds.add(sequence.nextItemId);
    if(!allowedUnitIds.has(context.itemId))throw new Error('NEXT_STUDY_UNIT_MISMATCH');
    if(!Array.isArray(input.assets))throw new Error('NEXT_ASSET_EVIDENCE_REQUIRED');
    const assetsById=new Map();
    for(const asset of input.assets){
     if(!asset?.assetId||!asset.sha256||!Number.isInteger(asset.sourcePage)||asset.sourcePage<1||assetsById.has(asset.assetId))
      throw new Error('NEXT_ASSET_EVIDENCE_INVALID');
     assetsById.set(asset.assetId,asset);
    }
    const visualIds=new Set(packet.contentBlocks.filter(b=>(b.type==='figure'||b.type==='table')&&b.assetId).map(b=>b.assetId));
    for(const id of visualIds){
     const evidence=assetsById.get(id),registered=assetRegistry?.resolve?.(id);
     if(!evidence||!registered||registered.questionId!==packet.id||registered.verified!==true||
        !registered.sha256||evidence.sha256!==registered.sha256)throw new Error('NEXT_ASSET_EVIDENCE_MISMATCH');
    }
    const pinnedInput=immutableJson({...input,learningContext:context});
    const nextPayload=compileChatInlinePayload(pinnedInput.packet,assetRegistry);
    if(nextPayload.status!=='ready')throw new Error(nextPayload.reason||'NEXT_RENDER_NOT_READY');
    if(nextPayload.questionId!==pinnedInput.question.id||nextPayload.packetHash!==pinnedInput.packet.packetHash)
     throw new Error('NEXT_PAYLOAD_BINDING_MISMATCH');
    const tail=nextPayload.nodes.at(-1);
    if(tail?.role!=='instruction'||tail.value!=='番号で答えてください。')throw new Error('NEXT_INSTRUCTION_INCOMPLETE');
    if(!nextPayload.nodes.some(n=>n.role==='choices'&&Array.isArray(n.value)&&n.value.length>0))throw new Error('NEXT_CHOICES_INCOMPLETE');
    const route=Object.freeze({number:n,input:pinnedInput,payload:nextPayload,
     policy:resolveExplanationPolicy(studyPlan.qualificationId,question,packet)});
    if([...existing,...compiled].some(x=>x.input.learningContext.questionId===context.questionId))
     throw new Error('NEXT_QUESTION_ALREADY_PREFETCHED');
    compiled.push(route);
   }
   prefetchedNext=Object.freeze([...existing,...compiled]);
   return Object.freeze({ready:true,routes:Object.freeze(compiled.map(x=>Object.freeze({
    number:x.number,studyUnitId:x.input.learningContext.itemId,kind:x.input.learningContext.kind,
    questionId:x.input.learningContext.questionId,packetHash:x.payload.packetHash})))});
  },
  answer(value){
   if(pendingClarification)throw new Error('EXPLANATION_QUESTION_UNRESOLVED');
   if(machine.state().phase!=='ANSWER_WAIT')throw new Error('ANSWER_NOT_ALLOWED');
   const parsedAnswer=Number(String(value).trim());
   const choiceBlock=machine.state().packet?.contentBlocks?.find(b=>b.type==='choices');
   if(!Number.isInteger(parsedAnswer)||parsedAnswer<1||parsedAnswer>(choiceBlock?.value?.length||0))
    throw new Error('ANSWER_VALUE_INVALID');
   const proposedCorrect=parsedAnswer===Number(machine.state().packet?.answer?.value);
   const prediction=learningSequence.predictNextKind(proposedCorrect);
   if(prediction.ok!==true)throw new Error(prediction.reason);
   const menuOnly=prediction.kind==='confirmation_menu';
   if(!prefetchedNext&&!menuOnly)throw new Error('NEXT_NOT_PREFETCHED');
   const candidates=Array.isArray(prefetchedNext)?prefetchedNext:(prefetchedNext?[prefetchedNext]:[]);
   let selected=null;
   if(prediction.kind==='unit_choice'){
    const sequence=learningSequence.state();
    const requiredItems=[sequence.itemId,...(sequence.hasNextUnit?[sequence.nextItemId]:[])];
    for(const itemId of requiredItems){
     if(!candidates.some(x=>x.input.learningContext.kind==='official_practice'&&x.input.learningContext.itemId===itemId))
      throw new Error('NEXT_BRANCH_PACKET_NOT_PREFETCHED:unit_choice:'+itemId);
    }
   }else{
    selected=candidates.find(x=>x.input.learningContext.kind===prediction.kind);
    if(!selected&&!menuOnly)throw new Error('NEXT_BRANCH_PACKET_NOT_PREFETCHED:'+prediction.kind);
   }
   const grade=must(machine.dispatch({type:'SUBMIT_ANSWER',value:parsedAnswer})).state.grade;
   const result=learningSequence.recordAnswer(currentLearningContext.questionId,grade.correct);
   if(result.ok!==true)throw new Error(result.reason);
   prefetchedNext=menuOnly?null:(prediction.kind==='unit_choice'?Object.freeze(candidates):selected);
   const preference=explanationPreference(currentLearningContext.itemId);
   explanationDecision=currentLearningContext.kind==='ai_confirmation'?'skip':(preference==='ask_each'?null:preference);
   return Object.freeze({...grade,learning:result.outcome,explanationChoiceRequired:explanationDecision===null,explanationChoices:explanationDecision===null?Object.freeze(['detailed','skip']):Object.freeze([])});
  },
  decideExplanation(choice){
   if(machine.state().phase!=='GRADED'||explanationPreference(currentLearningContext.itemId)!=='ask_each'||currentLearningContext.kind==='ai_confirmation')
    throw new Error('EXPLANATION_CHOICE_NOT_ALLOWED');
   if(!['detailed','skip'].includes(choice))throw new Error('EXPLANATION_CHOICE_INVALID');
   explanationDecision=choice;return Object.freeze({choice,packetHash:machine.state().packet.packetHash});
  },
  async explain(text){
   const s=machine.state();
   if(explanationDecision!=='detailed')throw new Error('EXPLANATION_DECISION_REQUIRED');
   if(s.phase!=='GRADED')throw new Error('EXPLANATION_NOT_ALLOWED');
   let display=text;
   if(currentExplanationPolicy==='legal_basis_required'){
    const result=await compileLegalBasisExplanation(text,{questionId:s.question?.id,packetHash:s.packet.packetHash,verifyOfficialSource});
    if(!result.ok)throw new Error(result.reason);
    display=result.displayText;
   }
   if(typeof display!=='string'||!display.trim())throw new Error('EXPLANATION_TEXT_MISSING');
   must(machine.dispatch({type:'COMMIT_EXPLANATION',explanation:display,packetHash:s.packet.packetHash}));
   return machine.state();
  },
  skipExplanation(){
   const s=machine.state();if(s.phase!=='GRADED')throw new Error('EXPLANATION_SKIP_NOT_ALLOWED');
   if(explanationDecision!=='skip')throw new Error('EXPLANATION_DECISION_REQUIRED');
   must(machine.dispatch({type:'SKIP_EXPLANATION',packetHash:s.packet.packetHash}));return machine.state();
  },
  clarifyDuringExplanation(question){
   if(!['EXPLAINED','ANSWER_WAIT'].includes(machine.state().phase))throw new Error('EXPLANATION_QUESTION_NOT_ALLOWED');
   if(typeof question!=='string'||!question.trim())throw new Error('EXPLANATION_QUESTION_REQUIRED');
   if(pendingClarification)throw new Error('EXPLANATION_QUESTION_ALREADY_PENDING');
   pendingClarification=question.trim();
   return Object.freeze({state:machine.state(),question:pendingClarification,progression:learningSequence?.state()||null});
  },
  resolveExplanationQuestion(answer){
   if(!pendingClarification)throw new Error('EXPLANATION_QUESTION_NOT_PENDING');
   if(typeof answer!=='string'||!answer.trim())throw new Error('EXPLANATION_ANSWER_REQUIRED');
   const question=pendingClarification;pendingClarification=null;
   const inAnswerWait=machine.state().phase==='ANSWER_WAIT';
   return Object.freeze({question,answer:answer.trim(),state:machine.state(),
    progression:learningSequence?.state()||null,resumePayload:inAnswerWait?payload:null,
    continueAfterExplanation:machine.state().phase==='EXPLAINED'});
  },
  next(number){throw new Error('NEXT_REQUIRES_READY_PACKET');},
  commitPrefetchedNext(){
   if(machine.state().phase!=='EXPLAINED')throw new Error('NEXT_COMMIT_NOT_ALLOWED');
   if(pendingClarification)throw new Error('EXPLANATION_QUESTION_UNRESOLVED');
   if(learningSequence.state().phase==='CONFIRMATION_CHOICE_REQUIRED')
    return Object.freeze({state:machine.state(),confirmationChoiceRequired:true,choices:Object.freeze(learningSequence.state().hasNextUnit?['continue_confirmation','hold_and_move']:['continue_confirmation','end_session']),learning:learningSequence.state()});
   if(!prefetchedNext)throw new Error('NEXT_NOT_PREFETCHED');
   const learning=learningSequence.state();
   if(learning.phase==='PERFECT_RUN_CHOICE')
    return Object.freeze({state:machine.state(),choiceRequired:true,choices:Object.freeze(learning.hasNextUnit?['continue_same_unit','next_unit']:['continue_same_unit']),learning});
   pinPrefetchedRoute(learning.phase==='CONFIRMATION_REQUIRED'?'ai_confirmation':'official_practice',learning.itemId);
   return commitPinnedNext();
  },
  chooseConfirmationPath(choice){
   if(machine.state().phase!=='EXPLAINED')throw new Error('CONFIRMATION_CHOICE_NOT_ALLOWED');
   const result=must(learningSequence.chooseAfterConfirmationMisses(choice));
   prefetchedNext=null;
   return Object.freeze({...result,ready:false});
  },
  completeConfirmationBriefExplanation(text){
   if(machine.state().phase!=='EXPLAINED')throw new Error('BRIEF_EXPLANATION_NOT_ALLOWED');
   return must(learningSequence.completeBriefExplanation(text)).state;
  },
  chooseLearningPath(choice){
   if(machine.state().phase!=='EXPLAINED')throw new Error('UNIT_CHOICE_NOT_ALLOWED');
   const result=must(learningSequence.chooseAfterPerfectRun(choice));
   if(prefetchedNext){pinPrefetchedRoute('official_practice',result.nextItemId);return commitPinnedNext();}
   prefetchedNext=null;
   return Object.freeze({state:machine.state(),ready:false,nextItemId:result.nextItemId,learning:result.state});
  },
  nextReady(number,nextInput){throw new Error('NEXT_REQUIRES_PREFETCHED_PACKET');},
  load(question){must(machine.dispatch({type:'LOAD_NEXT',question}));payload=null;return machine.state();}
 });
}
