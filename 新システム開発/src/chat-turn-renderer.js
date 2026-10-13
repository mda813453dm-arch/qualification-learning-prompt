/**
 * ChatGPT通常会話へ渡す唯一の回答本文を構築する。
 * 図はこの処理実行へ渡された公式PDFから抽出したPNGのみを使う。
 */
import {compileChatInlinePayload,renderChatInlineMarkdown} from './chat-inline-render-adapter.js';
import {verifyAttachedPdfFigureSource} from './attached-pdf-figure-gate.js';

const blocked=reason=>Object.freeze({status:'blocked',reason});

export function buildChatTurn(question,assetRegistry,{sourcePdfAttachment}={}){
 const source=verifyAttachedPdfFigureSource(question,assetRegistry,sourcePdfAttachment);
 if(!source.ok)return blocked(source.reason);
 const payload=compileChatInlinePayload(question,assetRegistry);
 if(payload.status!=='ready')return payload;
 return buildChatTurnFromPayload(payload,{sourcePdfAttachment,source});
}

export function buildChatTurnFromPayload(payload,{sourcePdfAttachment=null,source=null}={}){
 const hasFigure=(payload?.nodes||[]).some(n=>n.role==='official_figure');
 if(hasFigure&&(!source?.ok||!sourcePdfAttachment))return blocked('PDF_EXECUTION_RECEIPT_REQUIRED');
 const rendered=renderChatInlineMarkdown(payload);
 if(rendered.status!=='ready')return rendered;
 // This exact string is the complete assistant response body to send/render.
 return Object.freeze({
  status:'ready',
  singleTurn:true,
  questionId:payload.questionId,
  packetHash:payload.packetHash,
  messageBody:rendered.markdown,
  markdown:rendered.markdown,
  nodes:payload.nodes,
  figureSource:hasFigure?Object.freeze({
   pdfSha256:sourcePdfAttachment.sha256,
   operationId:sourcePdfAttachment.operationId,
   figureCount:source.figureCount
  }):null
 });
}

/** Prevent a placeholder, heading-only answer, or omitted image from counting as rendered. */
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
 if(imageNodes.some(n=>n.role==='official_figure')&&
    (!turn.figureSource||!/^[a-f0-9]{64}$/.test(turn.figureSource.pdfSha256||'')||
     typeof turn.figureSource.operationId!=='string'||turn.figureSource.figureCount<1))
  return {ok:false,reason:'PDF_FIGURE_PROVENANCE_MISSING'};
 if((turn.nodes||[]).some(n=>n.type==='native_image'))return {ok:false,reason:'ALTERNATE_IMAGE_PATH_FORBIDDEN'};
 if(!(turn.nodes||[]).some(n=>n.role==='choices'))return {ok:false,reason:'CHOICES_MISSING'};
 return {ok:true,questionId:turn.questionId,packetHash:turn.packetHash,messageBody:turn.messageBody};
}
