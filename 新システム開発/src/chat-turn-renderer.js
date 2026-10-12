/**
 * ChatGPT実機向け: 1問を「単一の完成済みターン」にする。
 * 外部ツール画像ブロックを問題文の途中へ挿入する方式は禁止。
 * UIが本文内inline assetを保証できない場合は、表示を成功扱いにしない。
 */
export function buildChatTurn(question, ui){
 const block=r=>Object.freeze({status:'blocked',reason:r});
 if(!question||question.status!=='ready')return block('QUESTION_NOT_READY');
 const hasFigure=question.assets?.some(a=>a.kind==='figure');
 if(hasFigure && ui?.nativeInlineAsset!==true)return block('NATIVE_INLINE_ASSET_REQUIRED');
 const nodes=[
  {type:'heading',text:`■${question.exam}　${question.questionId}`},
  {type:'text',text:question.stem},
 ];
 for(const a of question.assets||[]){
  if(a.kind==='figure')nodes.push({type:'label',text:'〔図〕'},{type:'native_image',assetId:a.assetId,questionId:question.questionId});
  else if(a.kind==='table')nodes.push({type:'table',data:a.data});
  else if(a.kind==='formula'||a.kind==='text')nodes.push({type:'text',text:a.text});
 }
 if(question.response?.options)nodes.push({type:'choices',items:question.response.options});
 nodes.push({type:'instruction',text:'番号で答えてください。'});
 return Object.freeze({status:'ready',singleTurn:true,nodes:Object.freeze(nodes.map(Object.freeze))});
}
export function verifyChatTurn(turn){
 if(!turn||turn.status!=='ready'||turn.singleTurn!==true)return {ok:false,reason:'NOT_SINGLE_TURN'};
 const t=turn.nodes.map(n=>n.type);
 if(t[0]!=='heading'||t[1]!=='text'||t.at(-1)!=='instruction')return {ok:false,reason:'STRUCTURE_INVALID'};
 const image=t.indexOf('native_image');
 if(image>=0&&(t[image-1]!=='label'||image<3))return {ok:false,reason:'IMAGE_POSITION_INVALID'};
 if(!t.includes('choices'))return {ok:false,reason:'CHOICES_MISSING'};
 return {ok:true};
}
