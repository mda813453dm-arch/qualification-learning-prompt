/**
 * ChatGPTで実機PASSしたインライン画像参照方式へ、
 * ordered contentBlocks を決定論的に変換する。
 * AIによる並べ替え・補完・代替は禁止。
 */
export function compileChatInlinePayload(question, assetRegistry){
 const fail=(reason,detail=null)=>Object.freeze({status:'blocked',reason,detail});
 if(!question||question.status!=='ready'||!Array.isArray(question.contentBlocks))return fail('QUESTION_NOT_READY');
 if(!assetRegistry||typeof assetRegistry.resolve!=='function')return fail('ASSET_REGISTRY_REQUIRED');

 const out=[];
 for(let i=0;i<question.contentBlocks.length;i++){
  const b=question.contentBlocks[i];
  if(!b||b.order!==i)return fail('ORDER_INVALID',i);
  if(b.type==='question_number'){
    out.push({type:'text',role:'question_number',value:b.value});
  }else if(b.type==='text'){
    out.push({type:'text',role:'body',value:b.value});
  }else if(b.type==='figure'){
    const a=assetRegistry.resolve(b.assetId);
    if(!a||a.questionId!==question.id||a.verified!==true||a.mime!=='image/png'||!a.inlineRef||!a.sha256)
      return fail('INLINE_FIGURE_UNAVAILABLE',b.assetId);
    out.push({type:'image',role:'official_figure',value:a.inlineRef,assetId:b.assetId,sha256:a.sha256});
  }else if(b.type==='table'){
    if(b.assetId){
      const a=assetRegistry.resolve(b.assetId);
      if(!a||a.questionId!==question.id||a.verified!==true||!a.inlineRef||!a.sha256)
        return fail('INLINE_TABLE_UNAVAILABLE',b.assetId);
      out.push({type:'image',role:'official_table',value:a.inlineRef,assetId:b.assetId,sha256:a.sha256});
    }else if(b.value){
      out.push({type:'table',role:'official_table',value:b.value});
    }else return fail('TABLE_DATA_MISSING',i);
  }else if(b.type==='formula'){
    out.push({type:'text',role:'formula',value:b.value});
  }else if(b.type==='choices'){
    out.push({type:'choices',role:'choices',value:b.value});
  }else if(b.type==='instruction'){
    out.push({type:'text',role:'instruction',value:b.value||'番号で答えてください。'});
  }else return fail('UNKNOWN_BLOCK_TYPE',b.type);
 }
 const sig=out.map(x=>x.role).join('>');
 if(out[0]?.role!=='question_number'||out.at(-1)?.role!=='instruction'||!out.some(x=>x.role==='choices'))
   return fail('PAYLOAD_INCOMPLETE',sig);
 return Object.freeze({status:'ready',questionId:question.id,packetHash:question.packetHash,signature:sig,nodes:Object.freeze(out.map(Object.freeze))});
}

/**
 * 実画面送信後の受領情報を検証。成功証明がなければ ANSWER_WAIT へ進ませない。
 */
export function verifyChatInlineReceipt(payload,receipt){
 if(!payload||payload.status!=='ready')return Object.freeze({ok:false,reason:'PAYLOAD_NOT_READY'});
 if(!receipt||receipt.complete!==true)return Object.freeze({ok:false,reason:'RENDER_NOT_CONFIRMED'});
 if(receipt.questionId!==payload.questionId||receipt.packetHash!==payload.packetHash)
   return Object.freeze({ok:false,reason:'RENDER_BINDING_MISMATCH'});
 if(receipt.signature!==payload.signature||receipt.nodeCount!==payload.nodes.length)
   return Object.freeze({ok:false,reason:'RENDER_ORDER_MISMATCH'});
 return Object.freeze({ok:true,packetHash:payload.packetHash,complete:true});
}

/**
 * 完成済みpayloadを、通常のChatGPTメッセージ本文へ直列化する。
 * 図表assetはテキストラベルへ置換せず、検証済みsandbox PNGの
 * Markdown image linkをcontentBlocksと同じ順序で埋め込む。
 */
export function renderChatInlineMarkdown(payload){
 const fail=reason=>Object.freeze({status:'blocked',reason});
 if(!payload||payload.status!=='ready'||!Array.isArray(payload.nodes))return fail('PAYLOAD_NOT_READY');
 const parts=[];
 for(const node of payload.nodes){
  if(!node||typeof node.role!=='string')return fail('RENDER_NODE_INVALID');
  if(['question_number','body','formula','instruction'].includes(node.role)){
   if(typeof node.value!=='string'||!node.value.trim())return fail('RENDER_TEXT_MISSING');
   parts.push(node.value);
  }else if(node.role==='official_figure'||node.role==='official_table'){
   if(typeof node.value!=='string')return fail('INLINE_IMAGE_REFERENCE_MISSING');
   const split=node.value.split('?');
   if(split.length!==2||!split[0].startsWith('sandbox:/mnt/data/')||!split[0].toLowerCase().endsWith('.png'))
    return fail('INLINE_IMAGE_REFERENCE_INVALID');
   const params=new URLSearchParams(split[1]);
   if(!params.get('_chatgptios_conversationID')||!params.get('_chatgptios_messageID'))
    return fail('INLINE_IMAGE_CONTEXT_MISSING');
   const alt=node.role==='official_figure'?'公式図':'公式表';
   parts.push(`![${alt}](${node.value})`);
  }else if(node.role==='choices'){
   if(!Array.isArray(node.value)||node.value.length<2||node.value.some(x=>typeof x!=='string'||!x.trim()))
    return fail('RENDER_CHOICES_INVALID');
   parts.push('選択肢\n'+node.value.map((x,i)=>(i+1)+'. '+x).join('\n'));
  }else if(node.role==='official_table_data'){
   if(typeof node.value!=='string'||!node.value.trim())return fail('RENDER_TABLE_INVALID');
   parts.push(node.value);
  }else return fail('RENDER_ROLE_UNSUPPORTED:'+node.role);
 }
 if(!parts.length||!payload.nodes.some(n=>n.role==='choices')||
    payload.nodes.at(-1)?.role!=='instruction'||!parts.at(-1)?.endsWith('番号で答えてください。'))
  return fail('RENDER_PAYLOAD_INCOMPLETE');
 return Object.freeze({status:'ready',questionId:payload.questionId,packetHash:payload.packetHash,
  markdown:parts.join('\n\n')});
}
