import {createInlineStudyFlow} from './deterministic-inline-study-flow.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const throws=(fn,expected,m)=>{
 let error=null;
 try{fn()}catch(e){error=e}
 ok(error!==null,m+': did not block');
 if(expected)ok(error.message===expected,m+': expected '+expected+', got '+error.message);
};
const currentPacket={status:'ready',id:'q2',number:2,studyUnitId:'control-points',studyPlanSha256:'c'.repeat(64),packetHash:'p2',answer:{value:4},contentBlocks:[
 {order:0,type:'question_number',value:'Q2'},{order:1,type:'text',value:'stem'},
 {order:2,type:'figure',assetId:'f2'},{order:3,type:'choices',value:['1','2','3','4','5']},
 {order:4,type:'instruction',value:'番号で答えてください。'}]};
const registry={resolve:id=>id==='f2'?{questionId:'q2',verified:true,mime:'image/png',inlineRef:'sandbox:/mnt/data/f2.png?_chatgptios_conversationID=6acb6ae2-3a40-83ee-9d31-fe1181310e46&_chatgptios_messageID=dcd9c58a-39fa-4f0e-a3ee-b2cd9e558b34',sha256:'fig'}:
 id==='f3'?{questionId:'q3',verified:true,mime:'image/png',inlineRef:'sandbox:/mnt/data/f3.png?_chatgptios_conversationID=6acb6ae2-3a40-83ee-9d31-fe1181310e46&_chatgptios_messageID=dcd9c58a-39fa-4f0e-a3ee-b2cd9e558b34',sha256:'fig3'}:null};
function answerWait(){
 const flow=createInlineStudyFlow(registry,{studyPlan:{status:'approved',qualificationId:'land-surveyor',sha256:'c'.repeat(64),itemIds:['control-points','traverse']}});
 const payload=flow.prepare({qualificationId:'land-surveyor',source:{problemSha256:'p',answerSha256:'a'},
  question:{status:'ready',id:'q2',number:2,studyUnitId:'control-points',studyPlanSha256:'c'.repeat(64),kind:'official_practice',origin:'official',verifiedBundle:true},assets:[{assetId:'f2',sha256:'fig',sourcePage:2}],packet:currentPacket});
 throws(()=>flow.answer(4),'ANSWER_NOT_ALLOWED','render前の回答');
 flow.rendered({complete:true,questionId:'q2',packetHash:'p2',signature:payload.signature,nodeCount:payload.nodes.length,markdown:payload.markdown});
 ok(flow.state().phase==='ANSWER_WAIT','完全表示後に回答待ち');
 return flow;
}
function q3Packet(){
 return {status:'ready',id:'q3',number:3,studyUnitId:'control-points',studyPlanSha256:'c'.repeat(64),packetHash:'p3',answer:{value:2},contentBlocks:[
  {order:0,type:'question_number',value:'Q3'},
  {order:1,type:'text',value:'stem3'},
  {order:2,type:'figure',assetId:'f3'},
  {order:3,type:'choices',value:['1','2','3','4','5']},
  {order:4,type:'instruction',value:'番号で答えてください。'}]};
}
function q3Input(packet=q3Packet(),question={status:'ready',id:'q3',number:3,studyUnitId:'control-points',studyPlanSha256:'c'.repeat(64),kind:'official_practice',origin:'official',verifiedBundle:true}){
 return {question,packet,assets:[{assetId:'f3',sha256:'fig3',sourcePage:3}]};
}
const mismatchFlow=createInlineStudyFlow(registry,{studyPlan:{status:'approved',qualificationId:'land-surveyor',sha256:'c'.repeat(64),itemIds:['control-points','traverse']}});
const mismatchPayload=mismatchFlow.prepare({qualificationId:'land-surveyor',source:{problemSha256:'p',answerSha256:'a'},
 question:{status:'ready',id:'q2',number:2,studyUnitId:'control-points',studyPlanSha256:'c'.repeat(64),kind:'official_practice',origin:'official',verifiedBundle:true},
 assets:[{assetId:'f2',sha256:'fig',sourcePage:2}],packet:currentPacket});
throws(()=>mismatchFlow.rendered({complete:true,questionId:'q2',packetHash:'p2',signature:mismatchPayload.signature,
 nodeCount:mismatchPayload.nodes.length,markdown:mismatchPayload.markdown.replace('stem','AIが変更した本文')}),
 'RENDER_MARKDOWN_MISMATCH','AI表示本文の改変');
ok(mismatchFlow.displayAudit().at(-1).status==='FAIL'&&mismatchFlow.displayAudit().at(-1).reason==='RENDER_MARKDOWN_MISMATCH',
 '表示本文不一致をFAIL記録として残す');
throws(()=>mismatchFlow.answer(4),'ANSWER_NOT_ALLOWED','表示FAIL後は回答・採点へ進まない');
ok(mismatchFlow.state().phase==='PACKET_VALIDATED','表示FAIL時に回答待ちへ遷移しない');
mismatchFlow.rendered({complete:true,questionId:'q2',packetHash:'p2',signature:mismatchPayload.signature,
 nodeCount:mismatchPayload.nodes.length,markdown:mismatchPayload.markdown});
ok(mismatchFlow.displayAudit().at(-1).status==='PASS'&&
 mismatchFlow.displayAudit().at(-1).expectedMarkdownSha256===mismatchFlow.displayAudit().at(-1).observedMarkdownSha256,
 '完全一致をPASS記録として残す');

const noPrefetch=answerWait();
throws(()=>noPrefetch.answer(4),'NEXT_NOT_PREFETCHED','prefetch前の採点');
ok(noPrefetch.state().phase==='ANSWER_WAIT','prefetch前は回答待ち状態を保持');
const incomplete=answerWait();
throws(()=>incomplete.prefetchNext(3,q3Input({status:'ready',id:'q3',number:3,packetHash:'p3',answer:{value:2},
 contentBlocks:[{order:0,type:'question_number',value:'Q3'}]})),'PAYLOAD_INCOMPLETE','不完全packet');
throws(()=>incomplete.answer(4),'NEXT_NOT_PREFETCHED','不完全packet後の採点');
const wrongQuestionNumber=answerWait();
throws(()=>wrongQuestionNumber.prefetchNext(3,q3Input(q3Packet(),{status:'ready',id:'q3',number:4})),
 'NEXT_NUMBER_MISMATCH','次問question番号不一致');
const wrongPacketNumber=answerWait();
throws(()=>wrongPacketNumber.prefetchNext(3,q3Input({...q3Packet(),number:4})),
 'NEXT_PACKET_NUMBER_MISMATCH','次問packet番号不一致');
const missingAsset=answerWait();
const missingFigure=q3Packet();
missingFigure.contentBlocks[2]={order:2,type:'figure',assetId:'missing-f3'};
throws(()=>missingAsset.prefetchNext(3,q3Input(missingFigure)),'NEXT_ASSET_EVIDENCE_MISMATCH','公式図asset欠落');
throws(()=>missingAsset.answer(4),'NEXT_NOT_PREFETCHED','図asset欠落後の採点');
const invalidAnswerFlow=answerWait();
invalidAnswerFlow.prefetchNext(3,q3Input());
throws(()=>invalidAnswerFlow.answer(0),'ANSWER_VALUE_INVALID','無効回答は採点前に拒否');
ok(invalidAnswerFlow.state().phase==='ANSWER_WAIT','無効回答時は状態とprefetch分岐を保持');
ok(invalidAnswerFlow.answer(4).correct===true,'有効回答後に正しい分岐で採点');
invalidAnswerFlow.decideExplanation('skip');
invalidAnswerFlow.skipExplanation();
ok(invalidAnswerFlow.commitPrefetchedNext().state.question.id==='q3','無効回答後も準備packetを正しくcommit');
const flow=answerWait();
const nextInput=q3Input();
const ready=flow.prefetchNext(3,nextInput);
nextInput.packet.answer.value=5;
ok(ready.ready===true&&ready.routes[0].number===3&&ready.routes[0].packetHash==='p3','次問prefetch成功');
const graded=flow.answer(4);
ok(graded.correct===true&&graded.learning.officialPracticeCount===1&&graded.learning.itemId==='control-points','固定済み公式正答・同単元カウンタで採点');
ok(graded.explanationChoiceRequired&&graded.explanationChoices.join(',')==='detailed,skip','採点後に詳しい解説の要否を確認');
let decisionBlocked=false;try{await flow.explain('explanation')}catch(e){decisionBlocked=e.message==='EXPLANATION_DECISION_REQUIRED'}
ok(decisionBlocked,'解説選択前の説明を禁止');
flow.decideExplanation('detailed');
await flow.explain('explanation');
throws(()=>flow.next(3),'NEXT_REQUIRES_READY_PACKET','見出しだけの次問遷移');
throws(()=>flow.nextReady(3,q3Input({...q3Packet(),id:'q4',number:3})),
 'NEXT_REQUIRES_PREFETCHED_PACKET','未prefetch packetでの差し替え遷移');
const explanationQuestion=flow.clarifyDuringExplanation('この解説の理由を確認したいです。');
throws(()=>flow.commitPrefetchedNext(),'EXPLANATION_QUESTION_UNRESOLVED','説明質問の回答前進行を禁止');
throws(()=>flow.answer(1),'EXPLANATION_QUESTION_UNRESOLVED','説明質問待ちで次問回答を禁止');
throws(()=>flow.chooseLearningPath('continue_same_unit'),'EXPLANATION_QUESTION_UNRESOLVED','説明質問待ちで単元選択を禁止');
const clarificationResolved=flow.resolveExplanationQuestion('根拠と要件を補足しました。');
ok(clarificationResolved.continueAfterExplanation&&clarificationResolved.question===explanationQuestion.question,
 '解説質問に答えた後で同じ進行状態へ戻る');
const next=flow.commitPrefetchedNext();
ok(next.state.phase==='PACKET_VALIDATED'&&next.state.question.id==='q3','準備済み次問packetを状態機械へ登録');
ok(next.state.packet.answer.value===2,'prefetch時の正答を固定保持');
ok(next.payload.status==='ready'&&next.payload.questionId==='q3'&&next.payload.packetHash==='p3','次問payload完全');
ok(next.payload.nodes.some(n=>n.role==='official_figure'&&n.value==='sandbox:/mnt/data/f3.png?_chatgptios_conversationID=6acb6ae2-3a40-83ee-9d31-fe1181310e46&_chatgptios_messageID=dcd9c58a-39fa-4f0e-a3ee-b2cd9e558b34'),'公式図を保持');
ok(next.payload.nodes.at(-1).role==='instruction'&&next.payload.nodes.at(-1).value==='番号で答えてください。',
 '次問末尾に回答要求');
ok(next.payload.nodes.some(n=>n.role==='choices'&&n.value.length===5),'次問選択肢を保持');
const answerWaitAfterNext=flow.rendered({complete:true,questionId:'q3',packetHash:'p3',
 signature:next.payload.signature,nodeCount:next.payload.nodes.length,markdown:next.payload.markdown});
ok(answerWaitAfterNext.phase==='ANSWER_WAIT','次問完全表示後に回答受付へ遷移');
const followup=flow.clarifyDuringExplanation('先ほどの解説をもう一度確認したいです。');
throws(()=>flow.answer(2),'EXPLANATION_QUESTION_UNRESOLVED','説明の質問を先に処理する');
const followupResolved=flow.resolveExplanationQuestion('補足説明です。');
ok(followupResolved.resumePayload.questionId==='q3'&&followupResolved.resumePayload.packetHash==='p3',
 '質問解決後も同じ未回答次問packetを保持');

function minimalQuestion(id,number,kind='official_practice',studyUnitId='control-points'){
 const origin=kind==='ai_confirmation'?'ai':'official';
 const question={status:'ready',id,number,studyUnitId,studyPlanSha256:'c'.repeat(64),kind,origin,verifiedBundle:kind==='official_practice'};
 if(kind==='ai_confirmation')question.parentQuestionId='q3-miss';
 const packet={status:'ready',id,number,studyUnitId,studyPlanSha256:'c'.repeat(64),packetHash:'packet-'+id,answer:{value:4},contentBlocks:[
  {order:0,type:'question_number',value:'Q'+number},{order:1,type:'text',value:'stem '+id},
  {order:2,type:'choices',value:['1','2','3','4','5']},
  {order:3,type:'instruction',value:'番号で答えてください。'}]};
 return {question,packet,assets:[]};
}
const escalationFlow=createInlineStudyFlow({resolve:()=>null},{studyPlan:{status:'approved',qualificationId:'land-surveyor',sha256:'c'.repeat(64),itemIds:['control-points','traverse']}});
const first=minimalQuestion('q1',1);
let rendered=escalationFlow.prepare({qualificationId:'land-surveyor',source:{problemSha256:'p',answerSha256:'a'},...first});
escalationFlow.rendered({complete:true,questionId:'q1',packetHash:'packet-q1',signature:rendered.signature,nodeCount:rendered.nodes.length,markdown:rendered.markdown});
const advance=async(nextId,nextNo,nextKind,answer)=>{
 const candidate=minimalQuestion(nextId,nextNo,nextKind);
 escalationFlow.prefetchNext(nextNo,candidate);
 escalationFlow.answer(answer);
 if(escalationFlow.state().phase==='GRADED'){
  const decision=escalationFlow.state();
  if(escalationFlow.learningState().pendingOutcome?.kind==='official_practice')escalationFlow.decideExplanation('skip');
  escalationFlow.skipExplanation();
 }
 const committed=escalationFlow.commitPrefetchedNext();
 if(committed.payload){
  escalationFlow.rendered({complete:true,questionId:nextId,packetHash:'packet-'+nextId,signature:committed.payload.signature,nodeCount:committed.payload.nodes.length,markdown:committed.payload.markdown});
 }
 return committed;
};
await advance('q2',2,'official_practice',1);
await advance('q3-miss',3,'official_practice',1);
await advance('c1',4,'ai_confirmation',1);
await advance('c2',5,'ai_confirmation',1);
const c3=minimalQuestion('c3',6,'ai_confirmation');
escalationFlow.prefetchNext(6,c3);
escalationFlow.answer(1);
escalationFlow.skipExplanation();
const c3Ready=escalationFlow.commitPrefetchedNext();
escalationFlow.rendered({complete:true,questionId:'c3',packetHash:'packet-c3',signature:c3Ready.payload.signature,nodeCount:c3Ready.payload.nodes.length,markdown:c3Ready.payload.markdown});
escalationFlow.answer(1);
ok(escalationFlow.learningState().phase==='CONFIRMATION_CHOICE_REQUIRED','third confirmation miss grades without requiring an unrelated next packet');
escalationFlow.skipExplanation();
const menu=escalationFlow.commitPrefetchedNext();
ok(menu.confirmationChoiceRequired&&menu.choices.join(',')==='continue_confirmation,hold_and_move','flow emits fixed U21 choices');
const continueChoice=escalationFlow.chooseConfirmationPath('continue_confirmation');
ok(continueChoice.requiresBriefExplanation,'flow requires short explanation before next confirmation');
throws(()=>escalationFlow.prefetchNext(6,minimalQuestion('c4',6,'ai_confirmation')),'NEXT_PREFETCH_NOT_ALLOWED','cannot prefetch before short explanation');
escalationFlow.completeConfirmationBriefExplanation('誤りの要点を短く説明します。');
escalationFlow.prefetchNext(6,minimalQuestion('c4',6,'ai_confirmation'));
ok(escalationFlow.commitPrefetchedNext().payload.status==='ready','next confirmation is available after short explanation');


const perfectFlow=createInlineStudyFlow({resolve:()=>null},{studyPlan:{status:'approved',qualificationId:'land-surveyor',sha256:'c'.repeat(64),itemIds:['control-points','traverse']}});
const perfectOne=minimalQuestion('perfect-1',1);
let perfectPayload=perfectFlow.prepare({qualificationId:'land-surveyor',source:{problemSha256:'p',answerSha256:'a'},...perfectOne});
perfectFlow.rendered({complete:true,questionId:'perfect-1',packetHash:'packet-perfect-1',signature:perfectPayload.signature,nodeCount:perfectPayload.nodes.length,markdown:perfectPayload.markdown});
for(const [id,n,routeList] of [
 ['perfect-2',2,[minimalQuestion('perfect-2',2)]],
 ['perfect-3',3,[minimalQuestion('perfect-3',3)]]
]){
 perfectFlow.prefetchNext(routeList.map(input=>({number:n,input})));
 perfectFlow.answer(4);perfectFlow.decideExplanation('skip');perfectFlow.skipExplanation();
 const committed=perfectFlow.commitPrefetchedNext();
 perfectFlow.rendered({complete:true,questionId:id,packetHash:'packet-'+id,signature:committed.payload.signature,nodeCount:committed.payload.nodes.length,markdown:committed.payload.markdown});
}
const sameUnitCandidate=minimalQuestion('same-unit-next',4);
const nextUnitCandidate=minimalQuestion('next-unit-first',5,'official_practice','traverse');
perfectFlow.prefetchNext([
 {number:4,input:sameUnitCandidate},
 {number:5,input:nextUnitCandidate}
]);
const perfectGrade=perfectFlow.answer(4);
ok(perfectGrade.correct&&perfectGrade.learning.directive==='PERFECT_RUN_CHOICE','third correct practice grades into fixed choice state');
perfectFlow.decideExplanation('skip');perfectFlow.skipExplanation();
const perfectMenu=perfectFlow.commitPrefetchedNext();
ok(perfectMenu.choiceRequired&&perfectMenu.choices.join(',')==='continue_same_unit,next_unit','three correct questions expose the two fixed choices');
const moved=perfectFlow.chooseLearningPath('next_unit');
ok(moved.state.question.id==='next-unit-first'&&moved.learning.itemId==='traverse','next-unit choice commits the preverified next-unit packet');

console.log('PASS deterministic inline flow mandatory prefetch, immutable commit, and next render');
