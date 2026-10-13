import {buildChatTurn,buildChatTurnFromPayload,verifyChatTurn,verifyFinalResponseBody} from './chat-turn-renderer.js';

const ok=(x,m)=>{if(!x)throw new Error(m)};
const q={
 status:'ready',id:'土地家屋調査士:2025:午前:2',packetHash:'packet-hash',
 contentBlocks:[
  {order:0,type:'question_number',value:'■令和7年度 問2'},
  {order:1,type:'text',value:'問題文の前半'},
  {order:2,type:'figure',assetId:'official-q2'},
  {order:3,type:'text',value:'問題文の後半'},
  {order:4,type:'choices',value:['選択肢1','選択肢2','選択肢3','選択肢4','選択肢5']},
  {order:5,type:'instruction',value:'番号で答えてください。'}
 ]
};
const pdf={status:'ready',mediaType:'application/pdf',sha256:'a'.repeat(64),operationId:'run-001'};
const ref='sandbox:/mnt/data/official-q2-run-001.png';
const pngSha='b'.repeat(64);
const makeRegistry=(origin={})=>({resolve:id=>id==='official-q2'?{
 questionId:q.id,verified:true,mime:'image/png',inlineRef:ref,sha256:pngSha,
 derivedFromPdf:{pdfSha256:pdf.sha256,page:5,crop:{x0:50,y0:80,x1:450,y1:600},
  operationId:pdf.operationId,imageSha256:pngSha,extractionVerified:true,...origin}
 }:null});
const registry=makeRegistry();
const turn=buildChatTurn(q,registry,{sourcePdfAttachment:pdf});
ok(turn.status==='ready','complete turn is ready from an extraction receipt tied to actual PDF bytes');
ok(verifyChatTurn(turn).ok,'turn passes output boundary');
const image='![公式図]('+ref+')';
ok(turn.messageBody.includes(image),'literal assistant response body contains inline Markdown image syntax');
ok(turn.messageBody.indexOf('問題文の前半')<turn.messageBody.indexOf(image)&&
 turn.messageBody.indexOf(image)<turn.messageBody.indexOf('問題文の後半')&&
 turn.messageBody.indexOf('問題文の後半')<turn.messageBody.indexOf('選択肢1'),
 'image appears at exact ordered content position');
ok(turn.messageBody.endsWith('番号で答えてください。'),'full problem ends with answer instruction');
ok(!turn.nodes.some(n=>n.type==='native_image'),'no competing native image path is emitted');
ok(turn.figureSource.pdfSha256===pdf.sha256&&turn.figureSource.operationId===pdf.operationId,
 'response carries the PDF digest and extraction operation identity');

const noAsset=buildChatTurn(q,{resolve:()=>null},{sourcePdfAttachment:pdf});
ok(noAsset.status==='blocked'&&noAsset.reason==='PDF_FIGURE_ASSET_UNAVAILABLE','missing extracted figure fails closed');
const noPdf=buildChatTurn(q,registry);
ok(noPdf.status==='blocked'&&noPdf.reason==='PDF_EXECUTION_RECEIPT_REQUIRED',
 'a saved PNG reference alone cannot make a question ready');
const mismatchedPdf={...pdf,sha256:'c'.repeat(64)};
ok(buildChatTurn(q,registry,{sourcePdfAttachment:mismatchedPdf}).reason==='FIGURE_NOT_EXTRACTED_FROM_THIS_PDF_RUN',
 'figure from another PDF is rejected');
const wrongOperation=buildChatTurn(q,makeRegistry({operationId:'prior-run'}),{sourcePdfAttachment:pdf});
ok(wrongOperation.reason==='FIGURE_NOT_EXTRACTED_FROM_THIS_PDF_RUN','figure from a prior processing run is rejected');
const wrongImageHash=buildChatTurn(q,makeRegistry({imageSha256:'d'.repeat(64)}),{sourcePdfAttachment:pdf});
ok(wrongImageHash.reason==='FIGURE_NOT_EXTRACTED_FROM_THIS_PDF_RUN','PNG bytes must match extraction receipt');
const incompleteExtraction=buildChatTurn(q,makeRegistry({crop:null}),{sourcePdfAttachment:pdf});
ok(incompleteExtraction.reason==='FIGURE_NOT_EXTRACTED_FROM_THIS_PDF_RUN','missing crop coordinates are rejected');

const payload=buildChatTurn(q,registry,{sourcePdfAttachment:pdf});
const noInstruction=buildChatTurnFromPayload({...payload,nodes:payload.nodes.slice(0,-1)},
 {sourcePdfAttachment:pdf,source:{ok:true,figureCount:1}});
ok(noInstruction.status==='blocked','incomplete message fails closed');
const placeholder={...turn,messageBody:turn.messageBody.replace(image,'〔図〕'),markdown:turn.messageBody.replace(image,'〔図〕')};
ok(verifyChatTurn(placeholder).reason==='INLINE_IMAGE_NOT_IN_MESSAGE_BODY','label-only figure is rejected');
const omitted={...turn,messageBody:turn.messageBody.replace(image,''),markdown:turn.messageBody.replace(image,'')};
ok(verifyChatTurn(omitted).reason==='INLINE_IMAGE_NOT_IN_MESSAGE_BODY','response cannot omit the inline figure');
const noProvenance={...turn,figureSource:null};
ok(verifyChatTurn(noProvenance).reason==='PDF_FIGURE_PROVENANCE_MISSING',
 'renderer output without PDF extraction receipt is rejected');

const finalOk=verifyFinalResponseBody(turn,turn.messageBody);
ok(finalOk.ok&&finalOk.finalResponseVerified,'actual final response is accepted only when it exactly uses the prepared body');
const finalOmitted=verifyFinalResponseBody(turn,turn.messageBody.replace(image,''));
ok(finalOmitted.reason==='FINAL_RESPONSE_BODY_DIFFERS_FROM_PREPARED_TURN','final response that omits the image is blocked');
const finalPlaceholder=verifyFinalResponseBody(turn,turn.messageBody.replace(image,'〔図〕'));
ok(finalPlaceholder.reason==='FINAL_RESPONSE_BODY_DIFFERS_FROM_PREPARED_TURN','final response that substitutes a figure placeholder is blocked');
const finalHeadingOnly=verifyFinalResponseBody(turn,'■令和7年度 問2\\n\\n番号で答えてください。');
ok(finalHeadingOnly.reason==='FINAL_RESPONSE_BODY_DIFFERS_FROM_PREPARED_TURN','heading-only final response is blocked');

console.log('PASS chat-turn-renderer: PDF-byte/run provenance and actual answer-body embedding');
