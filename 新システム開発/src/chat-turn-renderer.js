/**
 * ChatGPT通常会話へ渡す唯一の回答本文を構築する。
 * 図表は実機成功済みのsandbox PNG Markdown参照で本文へ埋め込む。
 * UI用native_image/別画像ブロック経路は使用しない。
 */
import {compileChatInlinePayload,renderChatInlineMarkdown} from './chat-inline-render-adapter.js';

const blocked=reason=>Object.freeze({status:'blocked',reason});

export function buildChatTurn(question,assetRegistry){
 const payload=compileChatInlinePayload(question,assetRegistry);
 if(payload.status!=='ready')return payload;
 return buildChatTurnFromPayload(payload);
}

export function buildChatTurnFromPayload(payload){
 const rendered=renderChatInlineMarkdown(payload);
 if(rendered.status!=='ready')return rendered;
 // messageBody is the literal content for one ordinary ChatGPT assistant response.
 return Object.freeze({
  status:'ready',
  singleTurn:true,
  questionId:payload.questionId,
  packetHash:payload.packetHash,
  messageBody:rendered.markdown,
  markdown:rendered.markdown,
  nodes:payload.nodes
 });
}

/** Prevent callers from treating a heading, placeholder, or file-generation event as display. */
export function verifyChatTurn(turn){
 if(!turn||turn.status!=='ready'||turn.singleTurn!==true)return {ok:false,reason:'NOT_SINGLE_TURN'};
 if(typeof turn.messageBody!=='string'||!turn.messageBody.trim()||turn.messageBody!==turn.markdown)
  return {ok:false,reason:'MESSAGE_BODY_MISSING'};
 if(!turn.messageBody.endsWith('番号で答えてください。'))return {ok:false,reason:'ANSWER_INSTRUCTION_MISSING'};
 const imageNodes=(turn.nodes||[]).filter(n=>n.role==='official_figure'||(n.role==='official_table'&&n.type==='image'));
 for(const node of imageNodes){
  const alt=node.role==='official_figure'?'公式図':'公式表';
  if(typeof node.value!=='string'||!turn.messageBody.includes(`![${alt}](${node.value})`))
   return {ok:false,reason:'INLINE_IMAGE_NOT_IN_MESSAGE_BODY'};
 }
 if((turn.nodes||[]).some(n=>n.type==='native_image'))return {ok:false,reason:'ALTERNATE_IMAGE_PATH_FORBIDDEN'};
 if(!(turn.nodes||[]).some(n=>n.role==='choices'))return {ok:false,reason:'CHOICES_MISSING'};
 return {ok:true,questionId:turn.questionId,packetHash:turn.packetHash,messageBody:turn.messageBody};
}
