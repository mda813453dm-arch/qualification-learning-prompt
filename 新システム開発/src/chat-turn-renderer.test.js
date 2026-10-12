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
const ref='sandbox:/mnt/data/official-q2.png?_chatgptios_conversationID=conv-1&_chatgptios_messageID=msg-1';
const assetRegistry={resolve:id=>id==='official-q2'?{
 questionId:q.id,verified:true,mime:'image/png',inlineRef:ref,sha256:'asset-hash'
 }:null};
const turn=buildChatTurn(q,assetRegistry);
ok(turn.status==='ready','complete turn is ready');
ok(verifyChatTurn(turn).ok,'turn passes output boundary');
const image='![公式図]('+ref+')';
ok(turn.messageBody.includes(image),'literal assistant message body contains proven inline Markdown image syntax');
ok(turn.messageBody.indexOf('問題文の前半')<turn.messageBody.indexOf(image)&&
 turn.messageBody.indexOf(image)<turn.messageBody.indexOf('問題文の後半')&&
 turn.messageBody.indexOf('問題文の後半')<turn.messageBody.indexOf('選択肢1'),
 'image appears at exact ordered content position');
ok(turn.messageBody.endsWith('番号で答えてください。'),'full problem ends with answer instruction');
ok(!turn.nodes.some(n=>n.type==='native_image'),'no competing native image path is emitted');

const noAsset=buildChatTurn(q,{resolve:()=>null});
ok(noAsset.status==='blocked','missing figure asset fails closed');
ok(noAsset.reason==='INLINE_FIGURE_UNAVAILABLE','missing asset reason is explicit');
const noInstruction=buildChatTurnFromPayload({...turn,nodes:turn.nodes.slice(0,-1)});
ok(noInstruction.status==='blocked','incomplete message fails closed');
const tampered={...turn,messageBody:'■令和7年度 問2'};
ok(verifyChatTurn(tampered).reason==='MESSAGE_BODY_MISSING','heading-only message is rejected');
const placeholder={...turn,messageBody:turn.messageBody.replace(image,'〔図〕')};
ok(!verifyChatTurn(placeholder).ok,'label-only figure is rejected');
console.log('PASS chat-turn-renderer 11 checks');
