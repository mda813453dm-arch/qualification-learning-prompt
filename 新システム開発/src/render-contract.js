/**
 * UI非依存の厳格レンダリング契約。
 * 重要: IMAGEを別メッセージへ送る実装は adapter capability 検査で拒否する。
 * inlineMixedContent=true を保証できるUIだけが図付き問題を描画できる。
 */
export function compileRenderContract(packet,capabilities={}){
 const fail=reason=>Object.freeze({status:'blocked',reason,commands:Object.freeze([])});
 if(!packet||packet.status!=='ready')return fail('PACKET_NOT_READY');
 const hasFigure=packet.display.some(x=>x.kind==='figure');
 if(hasFigure && capabilities.inlineMixedContent!==true)return fail('INLINE_MIXED_CONTENT_UNSUPPORTED');
 const commands=[];
 for(const b of packet.display){
   if(b.kind==='number')commands.push({op:'TEXT',slot:'header',value:b.value});
   else if(b.kind==='stem')commands.push({op:'TEXT',slot:'stem',value:b.value});
   else if(b.kind==='figure')commands.push({op:'IMAGE',slot:'figure',value:b.value});
   else if(b.kind==='table')commands.push({op:'TABLE',slot:'table',value:b.value});
   else if(b.kind==='choices')commands.push({op:'CHOICES',slot:'choices',value:b.value});
   else return fail('UNKNOWN_BLOCK_KIND');
 }
 commands.push({op:'TEXT',slot:'instruction',value:'番号で答えてください。'});
 const slots=commands.map(x=>x.slot);
 const expected=['header','stem',...(hasFigure?['figure']:[]),...(packet.display.some(x=>x.kind==='table')?['table']:[]),'choices','instruction'];
 if(slots.join('|')!==expected.join('|'))return fail('SLOT_ORDER_INVALID');
 return Object.freeze({status:'ready',atomic:true,questionNumber:packet.number,commands:Object.freeze(commands.map(Object.freeze))});
}

export async function commitAtomicRender(contract,adapter){
 if(!contract||contract.status!=='ready'||contract.atomic!==true)throw new Error('CONTRACT_NOT_READY');
 if(!adapter||adapter.inlineMixedContent!==true||typeof adapter.commit!=='function')throw new Error('INLINE_ADAPTER_REQUIRED');
 // adapter.commit は命令列全体を1回で受け取る。個別emitは禁止。
 const receipt=await adapter.commit(contract.commands);
 if(!receipt||receipt.atomic!==true||receipt.questionNumber!==contract.questionNumber||receipt.orderHash!==orderHash(contract.commands))
   throw new Error('RENDER_RECEIPT_INVALID');
 return Object.freeze({ok:true,receipt});
}

export function orderHash(commands){
 return commands.map(x=>x.op+':'+x.slot).join('>');
}
