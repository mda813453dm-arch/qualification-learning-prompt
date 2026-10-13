/**
 * ChatGPTで実機PASSしたインライン画像参照方式へ、
 * ordered contentBlocks を決定論的に変換する。
 * AIによる並べ替え・補完・代替は禁止。
 */
// Local sandbox refs work only in the originating ChatGPT conversation.
// Cross-chat / cross-provider MCP images must use an absolute HTTPS PNG URL.
const isSandboxPng=ref=>{
 const path=String(ref||'').split('?')[0].toLowerCase();
 return path.startsWith('sandbox:/mnt/data/')&&path.endsWith('.png');
};
const isRemotePng=ref=>{
 try{
  const u=new URL(String(ref||''));
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash||!u.pathname.toLowerCase().endsWith('.png'))return false;
  const h=u.hostname.toLowerCase();
  if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal'))return false;
  if(/^\\d{1,3}(?:\\.\\d{1,3}){3}$/.test(h)){
   const p=h.split('.').map(Number);
   if(p.some(x=>x>255)||p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168)return false;
  }
  if(h==='::1'||h==='[::1]'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80:'))return false;
  return true;
 }catch{return false;}
};
const isUsablePng=ref=>isSandboxPng(ref)||isRemotePng(ref);

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
 const payload={status:'ready',questionId:question.id,packetHash:question.packetHash,signature:sig,nodes:Object.freeze(out.map(Object.freeze))};
 const rendered=renderChatInlineMarkdown(payload);
 if(rendered.status!=='ready')return fail(rendered.reason);
 return Object.freeze({...payload,markdown:rendered.markdown});
}

/**
 * 実画面送信後の受領情報を検証。成功証明がなければ ANSWER_WAIT へ進ませない。
 */
export function verifyChatInlineReceipt(payload,receipt){
 if(!payload||payload.status!=='ready')return Object.freeze({ok:false,reason:'PAYLOAD_NOT_READY'});
 if(!receipt||receipt.complete!==true)return Object.freeze({ok:false,reason:'RENDER_NOT_CONFIRMED'});
 if(receipt.questionId!==payload.questionId||receipt.packetHash!==payload.packetHash)
   return Object.freeze({ok:false,reason:'RENDER_BINDING_MISMATCH'});
 if(typeof payload.markdown!=='string'||receipt.markdown!==payload.markdown)
   return Object.freeze({ok:false,reason:'RENDER_MARKDOWN_MISMATCH'});
 if(receipt.signature!==payload.signature||receipt.nodeCount!==payload.nodes.length)
   return Object.freeze({ok:false,reason:'RENDER_ORDER_MISMATCH'});
 return Object.freeze({ok:true,packetHash:payload.packetHash,complete:true});
}

/**
 * 完成済みpayloadを、通常のChatGPTメッセージ本文へ直列化する。
 * 図表assetはテキストラベルへ置換せず、検証済みsandbox PNGの
 * Markdown image linkをcontentBlocksと同じ順序で埋め込む。\n * 他AI・別チャットから利用するMCP画像はHTTPS PNG参照を保持する。
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
  }else if(node.role==='official_table'&&node.type==='table'){
   if(!Array.isArray(node.value)||!node.value.length||node.value.some(r=>!Array.isArray(r)||!r.length)||
      new Set(node.value.map(r=>r.length)).size!==1||node.value.some(r=>r.some(c=>!['string','number','boolean'].includes(typeof c))))
    return fail('RENDER_TABLE_INVALID');
   const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
   parts.push('<table><tbody>'+node.value.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table>');
  }else if(node.role==='official_figure'||(node.role==='official_table'&&node.type==='image')){
   if(typeof node.value!=='string')return fail('INLINE_IMAGE_REFERENCE_MISSING');
   const queryAt=node.value.indexOf('?');
   const imagePath=queryAt<0?node.value:node.value.slice(0,queryAt);
   if(!isUsablePng(node.value))
    return fail('INLINE_IMAGE_REFERENCE_INVALID');
   // Conversation/message IDs are assigned by the host chat UI and cannot be
   // known by the assistant before it emits this answer. Plain sandbox PNG
   // references are valid; if either optional context parameter is supplied,
   // require the complete pair and reject templates/placeholders.
   if(queryAt>=0){
    const params=new URLSearchParams(node.value.slice(queryAt+1));
    const conversationId=params.get('_chatgptios_conversationID');
    const messageId=params.get('_chatgptios_messageID');
    if(Boolean(conversationId)!==Boolean(messageId)||
       [conversationId,messageId].some(v=>v&&/(この会話|この回答|実際の|placeholder|undefined)/i.test(v)))
     return fail('INLINE_IMAGE_CONTEXT_INVALID');
   }
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
