import {createHash} from 'node:crypto';
import {validateQuestionBundle} from './question-bundle-gate.js';
import {compileChatInlinePayload} from './chat-inline-render-adapter.js';

/**
 * 検証済み公式PDF bundleだけをChatGPTインライン表示経路へ接続する。
 * AIによる本文・図表・順序の補完は禁止。ゲート不合格はfail closed。
 */
export function bridgeOfficialBundleToInline(bundle,manifest,assetRegistry){
 const gate=validateQuestionBundle(bundle,manifest);
 if(!gate.ok)return Object.freeze({status:'blocked',reason:gate.reason});
 const blocks=[{order:0,type:'question_number',value:bundle.displayNumber||bundle.key,questionId:bundle.key}];
 for(const item of gate.contentBlocks){
  if(item.type==='text')blocks.push({order:blocks.length,type:'text',value:item.value,questionId:bundle.key});
  else if(item.type==='table')blocks.push({order:blocks.length,type:'table',assetId:item.assetId,questionId:bundle.key});
  else if(item.type==='formula')blocks.push(item.assetId?{order:blocks.length,type:'figure',assetId:item.assetId,questionId:bundle.key}:{order:blocks.length,type:'formula',value:item.value,questionId:bundle.key});
  else if(item.type==='figure'||item.type==='other')blocks.push({order:blocks.length,type:'figure',assetId:item.assetId,questionId:bundle.key});
  else return Object.freeze({status:'blocked',reason:'CONTENT_BLOCK_TYPE_UNSUPPORTED'});
 }
 blocks.push({order:blocks.length,type:'choices',value:gate.choices,questionId:bundle.key});
 blocks.push({order:blocks.length,type:'instruction',value:'番号で答えてください。',questionId:bundle.key});
 const number=Number(bundle.key.split(':').at(-1));
 if(!Number.isInteger(number)||number<1)return Object.freeze({status:'blocked',reason:'QUESTION_NUMBER_INVALID'});
 const question=Object.freeze({status:'ready',id:bundle.key,number,qualification:gate.qualification,subjectArea:gate.subjectArea,explanationPolicy:gate.explanationPolicy,studyUnitId:gate.studyUnitId,studyPlanSha256:gate.studyPlanSha256,kind:'official_practice',origin:'official',verifiedBundle:true});
 const packet={status:'ready',id:bundle.key,number,packetHash:bundle.packetHash||manifest.packetHash,subjectArea:gate.subjectArea,explanationPolicy:gate.explanationPolicy,studyUnitId:gate.studyUnitId,studyPlanSha256:gate.studyPlanSha256,contentBlocks:blocks,answer:{value:bundle.answer.number,sourceSha256:bundle.source.answerPdfSha256}};
 if(!packet.packetHash)return Object.freeze({status:'blocked',reason:'PACKET_HASH_REQUIRED'});
 const payload=compileChatInlinePayload(packet,assetRegistry);
 if(payload.status!=='ready')return payload;
 return Object.freeze({...payload,question,packet:Object.freeze({...packet,contentBlocks:Object.freeze(blocks.map(Object.freeze)),answer:Object.freeze({...packet.answer})})});
}

const sha=value=>createHash('sha256').update(value).digest('hex');
const isSha=value=>/^[a-f0-9]{64}$/.test(value||'');
const sameArray=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const buildFail=reason=>Object.freeze({status:'blocked',reason});
const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;};

/** Server-owned verifiers bind PDF extraction and reviewed visual placement. */
export function createOfficialQuestionBundleBuilder({verifyExtraction,verifyLayoutReview}={}){
 if(typeof verifyExtraction!=='function'||typeof verifyLayoutReview!=='function')throw new Error('TRUSTED_BUNDLE_VERIFIERS_REQUIRED');
 return async function build({extraction,layoutReview}={}){
  if(!extraction||!layoutReview)return buildFail('EXTRACTION_AND_LAYOUT_REQUIRED');
  let sourceOk=false,reviewOk=false;
  try{sourceOk=await verifyExtraction(extraction)===true;}catch{}
  if(!sourceOk)return buildFail('PINNED_EXTRACTION_NOT_VERIFIED');
  try{reviewOk=await verifyLayoutReview(layoutReview)===true;}catch{}
  if(!reviewOk)return buildFail('LAYOUT_REVIEW_NOT_VERIFIED');
  const {key,number,year}=extraction;
  if(typeof key!=='string'||!/^.+:\d{4}:.+:\d+$/.test(key)||!Number.isInteger(year)||!Number.isInteger(number)||number<1||
     String(year)!==key.split(':')[1]||String(number)!==key.split(':').at(-1)||
     !extraction.qualification||!extraction.section||!extraction.studyUnitId||!isSha(extraction.studyPlanSha256))
   return buildFail('QUESTION_IDENTITY_INVALID');
  if(!isSha(extraction.questionPdfSha256)||!isSha(extraction.answerPdfSha256)||!Array.isArray(extraction.pages)||!extraction.pages.length||
     extraction.pages.some((p,i)=>!Number.isInteger(p)||p<1||(i>0&&p<=extraction.pages[i-1])))return buildFail('SOURCE_PAGES_INVALID');
  if(typeof extraction.stemText!=='string'||!extraction.stemText.trim()||!isSha(extraction.stemSha256)||sha(extraction.stemText)!==extraction.stemSha256)
   return buildFail('EXTRACTED_STEM_HASH_MISMATCH');
  if(!Array.isArray(extraction.choices)||extraction.choices.length<2||extraction.choices.some(c=>typeof c!=='string'||!c.trim())||
     !Number.isInteger(extraction.answerNumber)||extraction.answerNumber<1||extraction.answerNumber>extraction.choices.length||
     !isSha(extraction.answerEvidenceSha256))return buildFail('EXTRACTED_ANSWER_INCOMPLETE');
  if(layoutReview.status!=='approved'||layoutReview.key!==key||
     layoutReview.questionPdfSha256!==extraction.questionPdfSha256||layoutReview.answerPdfSha256!==extraction.answerPdfSha256||
     layoutReview.stemSha256!==extraction.stemSha256||!sameArray(layoutReview.pages,extraction.pages)||
     layoutReview.answerEvidenceSha256!==extraction.answerEvidenceSha256||
     !Array.isArray(layoutReview.contentOrder)||!Array.isArray(layoutReview.assets)||
     layoutReview.allVisualsAccountedFor!==true||layoutReview.textChecked!==true||
     layoutReview.displayChecked!==true||layoutReview.answerCellChecked!==true)return buildFail('LAYOUT_REVIEW_BINDING_INVALID');
  const assetById=new Map();
  for(const a of layoutReview.assets){
   if(!a||typeof a.id!=='string'||assetById.has(a.id)||!['figure','table','formula','other'].includes(a.kind)||
      !Number.isInteger(a.page)||!extraction.pages.includes(a.page)||!isSha(a.sha256)||!a.crop||
      !['x0','y0','x1','y1'].every(k=>Number.isFinite(a.crop[k]))||a.crop.x0>=a.crop.x1||a.crop.y0>=a.crop.y1)
    return buildFail('REVIEW_ASSET_INVALID');
   assetById.set(a.id,a);
  }
  const used=new Set(),contentBlocks=[],layout=[],contentBlockSha256=[];let cursor=0,textIndex=0;
  for(const item of layoutReview.contentOrder){
   if(item?.type==='text'){
    if(item.startOffset!==cursor||!Number.isInteger(item.endOffset)||item.endOffset<=item.startOffset||item.endOffset>extraction.stemText.length)
     return buildFail('TEXT_SEGMENT_OFFSETS_INVALID');
    const value=extraction.stemText.slice(item.startOffset,item.endOffset);if(!value.trim())return buildFail('TEXT_SEGMENT_EMPTY');
    contentBlocks.push({type:'text',value});layout.push('text:'+textIndex++);contentBlockSha256.push(sha(value));cursor=item.endOffset;
   }else if(['figure','table','formula','other'].includes(item?.type)){
    const a=assetById.get(item.assetId);
    if(!a||a.kind!==item.type||item.atOffset!==cursor||used.has(item.assetId))return buildFail('VISUAL_POSITION_OR_ASSET_INVALID');
    used.add(item.assetId);contentBlocks.push({type:item.type,assetId:item.assetId});
    layout.push(item.type+':'+item.assetId);contentBlockSha256.push(sha(item.type+':'+item.assetId));
   }else return buildFail('CONTENT_ORDER_ITEM_INVALID');
  }
  if(cursor!==extraction.stemText.length||used.size!==assetById.size)return buildFail('CONTENT_ORDER_INCOMPLETE');
  const pages=[...extraction.pages],assets=layoutReview.assets.map(a=>({...a,crop:{...a.crop}})),choiceSha256=extraction.choices.map(sha);
  const packetHash=sha(JSON.stringify({key,questionPdfSha256:extraction.questionPdfSha256,answerPdfSha256:extraction.answerPdfSha256,pages,
   stemSha256:extraction.stemSha256,choiceSha256,answerNumber:extraction.answerNumber,answerEvidenceSha256:extraction.answerEvidenceSha256,
   contentBlockSha256,assets}));
  const bundle={schema:'official-question-bundle-v1',key,qualification:extraction.qualification,subjectArea:extraction.subjectArea||'general',
   explanationPolicy:extraction.explanationPolicy||'general',studyUnitId:extraction.studyUnitId,studyPlanSha256:extraction.studyPlanSha256,
   displayNumber:extraction.displayNumber,source:{questionPdfSha256:extraction.questionPdfSha256,answerPdfSha256:extraction.answerPdfSha256,pages},
   body:extraction.stemText,contentBlocks,contentBlockSha256,choices:[...extraction.choices],
   answer:{number:extraction.answerNumber,evidenceSha256:extraction.answerEvidenceSha256},assets,layout:[...layout,'choices','answer-control'],packetHash};
  const manifest={key,studyUnitId:extraction.studyUnitId,studyPlanSha256:extraction.studyPlanSha256,
   questionPdfSha256:extraction.questionPdfSha256,answerPdfSha256:extraction.answerPdfSha256,pages,bodySha256:extraction.stemSha256,
   choiceSha256,answerNumber:extraction.answerNumber,answerEvidenceSha256:extraction.answerEvidenceSha256,
   assets:assets.map(a=>({...a,crop:{...a.crop}})),contentBlockSha256:[...contentBlockSha256],packetHash,reviewStatus:'approved',
   allVisualsAccountedFor:true,answerCellChecked:true,textChecked:true,displayChecked:true,explanationPolicy:bundle.explanationPolicy};
  const checked=validateQuestionBundle(bundle,manifest);if(!checked.ok)return buildFail('BUILT_BUNDLE_REJECTED:'+checked.reason);
  return deepFreeze({status:'ready',bundle,manifest,packetHash});
 };
}

/**
 * Official retrieval pipeline用の、本番用Bundle→インラインpayload合成器。
 * PDF抽出結果、公式取得結果、レビュー配置の三者が同一の問題・出典に
 * 結び付かない場合は表示データを返さない。
 */
export function createOfficialBundleInlineCompiler({
 verifyExtraction,verifyLayoutReview,assetRegistry
}={}){
 const build=createOfficialQuestionBundleBuilder({verifyExtraction,verifyLayoutReview});
 if(!assetRegistry||typeof assetRegistry.resolve!=='function')
  throw new Error('ASSET_REGISTRY_REQUIRED');
 return async function compile({candidate,verifiedResult,studyUnitId,studyPlanSha256}={}){
  const extraction=verifiedResult?.bundleExtraction;
  const q=verifiedResult?.question,a=verifiedResult?.answer;
  if(!candidate||!extraction||!q||!a)return buildFail('VERIFIED_BUNDLE_INPUTS_REQUIRED');
  const choiceText=Array.isArray(q.choices)?q.choices.map(c=>c?.text):[];
  if(verifiedResult.status!=='verified'||q.source?.official!==true||a.source?.official!==true||
     extraction.key!==candidate.questionId||q.id!==candidate.questionId||
     a.questionId!==candidate.questionId||extraction.qualification!==candidate.qualificationId||
     String(extraction.year)!==String(candidate.year)||extraction.section!==candidate.section||
     q.section!==candidate.section||a.section!==candidate.section||
     String(q.year)!==String(candidate.year)||String(a.year)!==String(candidate.year)||
     extraction.studyUnitId!==studyUnitId||extraction.studyPlanSha256!==studyPlanSha256||
     q.source?.questionPdfSha256!==extraction.questionPdfSha256||
     a.source?.answerPdfSha256!==extraction.answerPdfSha256||
     typeof q.text!=='string'||sha(q.text)!==extraction.stemSha256||
     !sameArray(choiceText,extraction.choices)||a.number!==extraction.answerNumber||
     typeof a.evidence!=='string'||sha(a.evidence)!==extraction.answerEvidenceSha256)
   return buildFail('VERIFIED_EXTRACTION_BINDING_MISMATCH');
  const built=await build({extraction,layoutReview:verifiedResult.layoutReview});
  if(built.status!=='ready')return built;
  return bridgeOfficialBundleToInline(built.bundle,built.manifest,assetRegistry);
}
}


/**
 * Python extractor exportを、Bundle compilerが受け取る厳密な抽出証拠へ変換する。
 * PDF export自体は公式取得パイプラインのサーバー検証後にのみ信頼する。
 */
export function adaptSurveyorExportedQuestion(exported,{number,studyUnitId,studyPlanSha256}={}){
 const blocked=reason=>Object.freeze({status:'blocked',reason});
 if(!exported||exported.schema!=='surveyor_2025_afternoon_v1'||
    exported.registryKey!=='土地家屋調査士:2025:午後'||
    exported.qualification!=='土地家屋調査士'||exported.year!==2025||
    exported.section!=='午後'||!Array.isArray(exported.questions)||
    !Number.isInteger(number)||number<1||number>20)
  return blocked('SURVEYOR_EXPORT_IDENTITY_INVALID');
 if(!isSha(exported.questionPdfSha256)||!isSha(exported.answerPdfSha256)||
    typeof studyUnitId!=='string'||!studyUnitId||!isSha(studyPlanSha256))
  return blocked('SURVEYOR_EXPORT_SOURCE_OR_STUDY_BINDING_INVALID');
 const matches=exported.questions.filter(q=>q?.number===number);
 if(matches.length!==1)return blocked('SURVEYOR_EXPORT_QUESTION_NOT_UNIQUE');
 const q=matches[0],key='土地家屋調査士:2025:午後:'+number;
 if(q.key!==key||q.displayNumber!=='■2025年度 午後の部 問'+number||
    !Number.isInteger(q.page)||q.page<1||!Array.isArray(q.pages)||q.pages.length<1||
    q.pages[0]!==q.page||q.pages.some((p,i)=>!Number.isInteger(p)||p<1||(i>0&&p<=q.pages[i-1])))
  return blocked('SURVEYOR_EXPORT_QUESTION_IDENTITY_INVALID');
 if(typeof q.rawSpan!=='string'||!q.rawSpan||!isSha(q.spanSha256)||sha(q.rawSpan)!==q.spanSha256||
    typeof q.stemText!=='string'||!q.stemText.trim()||!q.rawSpan.includes(q.stemText)||
    !isSha(q.stemSha256)||sha(q.stemText)!==q.stemSha256)
  return blocked('SURVEYOR_EXPORT_QUESTION_EVIDENCE_INVALID');
 if(!Array.isArray(q.choices)||q.choices.length!==5||q.choices.some(c=>typeof c!=='string'||!c.trim())||
    !Number.isInteger(q.answerNumber)||q.answerNumber<1||q.answerNumber>q.choices.length||
    typeof q.answerEvidence!=='string'||!q.answerEvidence.trim()||
    !isSha(q.answerEvidenceSha256)||sha(q.answerEvidence)!==q.answerEvidenceSha256||
    !Number.isInteger(q.answerPage)||q.answerPage<1)
  return blocked('SURVEYOR_EXPORT_ANSWER_EVIDENCE_INVALID');
 const extraction=Object.freeze({
  key,qualification:exported.qualification,year:exported.year,section:exported.section,number,
  studyUnitId,studyPlanSha256,displayNumber:q.displayNumber,
  questionPdfSha256:exported.questionPdfSha256,answerPdfSha256:exported.answerPdfSha256,
  pages:Object.freeze([...q.pages]),rawSpan:q.rawSpan,spanSha256:q.spanSha256,
  stemText:q.stemText,stemSha256:q.stemSha256,choices:Object.freeze([...q.choices]),
  answerNumber:q.answerNumber,answerEvidence:q.answerEvidence,
  answerEvidenceSha256:q.answerEvidenceSha256,answerPage:q.answerPage
 });
 return Object.freeze({status:'ready',extraction});
}
