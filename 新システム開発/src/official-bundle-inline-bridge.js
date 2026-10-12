import {validateQuestionBundle} from './question-bundle-gate.js';
import {compileChatInlinePayload} from './chat-inline-render-adapter.js';

/**
 * 検証済み公式PDF bundleだけをChatGPTインライン表示経路へ接続する。
 * AIによる本文・図表・順序の補完は禁止。ゲート不合格はfail closed。
 */
export function bridgeOfficialBundleToInline(bundle,manifest,assetRegistry){
 const gate=validateQuestionBundle(bundle,manifest);
 if(!gate.ok)return Object.freeze({status:'blocked',reason:gate.reason});
 const blocks=[{order:0,type:'question_number',value:bundle.displayNumber||bundle.key}];
 blocks.push({order:1,type:'text',value:gate.body,questionId:bundle.key});
 for(const token of gate.layout.slice(1,-2)){
  const a=gate.assets.find(x=>x.id===token);
  if(!a)return Object.freeze({status:'blocked',reason:'LAYOUT_ASSET_NOT_FOUND'});
  blocks.push({order:blocks.length,type:a.kind==='table'?'table':'figure',assetId:a.id,questionId:bundle.key});
 }
 blocks.push({order:blocks.length,type:'choices',value:gate.choices,questionId:bundle.key});
 blocks.push({order:blocks.length,type:'instruction',value:'番号で答えてください。',questionId:bundle.key});
 const packet={status:'ready',id:bundle.key,packetHash:bundle.packetHash||manifest.packetHash,contentBlocks:blocks,answer:{value:bundle.answer.number,sourceSha256:bundle.source.answerPdfSha256}};
 if(!packet.packetHash)return Object.freeze({status:'blocked',reason:'PACKET_HASH_REQUIRED'});
 return compileChatInlinePayload(packet,assetRegistry);
}
