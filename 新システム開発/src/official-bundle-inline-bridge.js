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
