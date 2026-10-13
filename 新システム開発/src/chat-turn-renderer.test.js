import {buildChatTurn,buildChatTurnFromPayload,verifyChatTurn} from './chat-turn-renderer.js';

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
const pdf={serverReceived:true,receivedInCurrentChat:true,mediaType:'application/pdf',
 fileId:'attached-pdf-q2',sha256:'a'.repeat(64),chatId:'current-chat'};
const ref='sandbox:/mnt/data/official-q2.png';
const makeRegistry=(origin={})=>({resolve:id=>id==='official-q2'?{
 questionId:q.id,verified:true,mime:'image/png',inlineRef:ref,sha256:'b'.repeat(64),
 generatedInChatId:pdf.chatId,derivedFromPdf:{fileId:pdf.fileId,pdfSha256:pdf.sha256,page:5,
  crop:{x0:0.1,y0:0.2,x1:0.8,y1:0.9},extractionVerified:true,...origin}
 }:null});
const registry=makeRegistry();
const turn=buildChatTurn(q,registry,{sourcePdfAttachment:pdf});
ok(turn.status==='ready','complete turn is ready when figure was cut from current attached PDF');
ok(verifyChatTurn(turn).ok,'turn passes output boundary');
const image='![公式図]('+ref+')';
ok(turn.messageBody.includes(image),'literal assistant message body contains actual inline Markdown image syntax');
ok(turn.messageBody.indexOf('問題文の前半')<turn.messageBody.indexOf(image)&&
 turn.messageBody.indexOf(image)<turn.messageBody.indexOf('問題文の後半')&&
 turn.messageBody.indexOf('問題文の後半')<turn.messageBody.indexOf('選択肢1'),
 'image appears at exact ordered content position');
ok(turn.messageBody.endsWith('番号で答えてください。'),'full problem ends with answer instruction');
ok(!turn.nodes.some(n=>n.type==='native_image'),'no competing native image path is emitted');
ok(turn.figureSource.fileId===pdf.fileId&&turn.figureSource.pdfSha256===pdf.sha256,
 'rendered figure carries the current PDF source identity');

const noAsset=buildChatTurn(q,{resolve:()=>null},{sourcePdfAttachment:pdf});
ok(noAsset.status==='blocked'&&noAsset.reason==='PDF_FIGURE_ASSET_UNAVAILABLE','missing extracted figure fails closed');
const noPdf=buildChatTurn(q,registry);
ok(noPdf.status==='blocked'&&noPdf.reason==='CURRENT_CHAT_OFFICIAL_PDF_REQUIRED',
 'a saved PNG or inline reference alone cannot make a new chat ready');
const previousChatPdf={...pdf,receivedInCurrentChat:false,chatId:'previous-chat'};
ok(buildChatTurn(q,registry,{sourcePdfAttachment:previousChatPdf}).reason==='CURRENT_CHAT_OFFICIAL_PDF_REQUIRED',
 'a PDF from another conversation is rejected');
ok(buildChatTurn(q,makeRegistry({fileId:'other-pdf'}),{sourcePdfAttachment:pdf}).reason==='FIGURE_NOT_EXTRACTED_FROM_CURRENT_CHAT_PDF',
 'a figure from another PDF is rejected');
ok(buildChatTurn(q,makeRegistry({pdfSha256:'c'.repeat(64)}),{sourcePdfAttachment:pdf}).reason==='FIGURE_NOT_EXTRACTED_FROM_CURRENT_CHAT_PDF',
 'a PDF hash mismatch is rejected');
ok(buildChatTurn(q,makeRegistry({extractionVerified:false}),{sourcePdfAttachment:pdf}).reason==='FIGURE_NOT_EXTRACTED_FROM_CURRENT_CHAT_PDF',
 'an unverified or cached crop is rejected');
const incompleteExtraction=buildChatTurn(q,makeRegistry({crop:null}),{sourcePdfAttachment:pdf});
ok(incompleteExtraction.reason==='FIGURE_NOT_EXTRACTED_FROM_CURRENT_CHAT_PDF','missing crop coordinates are rejected');

const payload=buildChatTurn(q,registry,{sourcePdfAttachment:pdf});
const noInstruction=buildChatTurnFromPayload({...payload,nodes:payload.nodes.slice(0,-1)},
 {sourcePdfAttachment:pdf,source:{ok:true,figureCount:1}});
ok(noInstruction.status==='blocked','incomplete message fails closed');
const tampered={...turn,messageBody:'■令和7年度 問2'};
ok(verifyChatTurn(tampered).reason==='MESSAGE_BODY_MISSING','heading-only message is rejected');
const noProvenance={...turn,figureSource:null};
ok(verifyChatTurn(noProvenance).reason==='CURRENT_CHAT_PDF_FIGURE_PROVENANCE_MISSING',
 'render receipt without PDF provenance is rejected');
const placeholder={...turn,messageBody:turn.messageBody.replace(image,'〔図〕')};
ok(!verifyChatTurn(placeholder).ok,'label-only figure is rejected');
console.log('PASS chat-turn-renderer: current-chat PDF extraction, exact placement, and fail-closed portable-image checks');
