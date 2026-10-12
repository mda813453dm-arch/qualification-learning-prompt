/** 可変長contentBlocksを唯一の表示正本にする汎用問題形式 */
export function makeOrderedQuestion({id,qualification,exam,contentBlocks,answer}){
 const bad=reason=>Object.freeze({status:'blocked',reason});
 if(!id||!qualification||!exam||!Array.isArray(contentBlocks)||!contentBlocks.length)return bad('CORE_INVALID');
 const allowed=new Set(['question_number','text','figure','table','formula','choices','instruction']);
 for(let i=0;i<contentBlocks.length;i++){
  const b=contentBlocks[i];
  if(!b||b.order!==i||!allowed.has(b.type))return bad('BLOCK_INVALID');
  if(b.type==='figure'&&(!b.assetId||b.questionId!==id))return bad('FIGURE_BINDING_INVALID');
 }
 if(contentBlocks[0].type!=='question_number')return bad('QUESTION_NUMBER_MUST_BE_FIRST');
 if(!contentBlocks.some(b=>b.type==='text'))return bad('QUESTION_TEXT_MISSING');
 if(!contentBlocks.some(b=>b.type==='choices'))return bad('CHOICES_MISSING');
 if(!answer||answer.value===undefined||!answer.sourceSha256)return bad('ANSWER_NOT_PINNED');
 return Object.freeze({status:'ready',id,qualification,exam,contentBlocks:Object.freeze(contentBlocks.map(Object.freeze)),answer:Object.freeze({...answer})});
}
export function displayBlocks(q){
 if(!q||q.status!=='ready')throw new Error('QUESTION_NOT_READY');
 return q.contentBlocks; // AIはこの順序を変更・補完・省略してはならない
}
export function gradeOrdered(q,input){
 if(!q||q.status!=='ready')return {status:'blocked'};
 const n=Number(String(input).trim());
 if(!Number.isInteger(n))return {status:'invalid'};
 return Object.freeze({status:'graded',correct:n===q.answer.value,selected:n,correctAnswer:q.answer.value});
}


/**
 * 表示前の完全性ゲート。
 * 配列長だけでなく、必須要素の存在・個数・順序・問ID一致を検証する。
 * 1項目でも欠ければ renderer に渡さない。
 */
export function validateDisplayArray(q){
 if(!q||q.status!=='ready')return Object.freeze({ok:false,reason:'QUESTION_NOT_READY'});
 const b=q.contentBlocks, types=b.map(x=>x.type);
 const counts=Object.freeze(Object.fromEntries([...new Set(types)].map(t=>[t,types.filter(x=>x===t).length])));
 const required=['question_number','text','choices','instruction'];
 for(const t of required) if(!types.includes(t)) return Object.freeze({ok:false,reason:'REQUIRED_BLOCK_MISSING',missing:t,length:b.length,counts});
 if(types[0]!=='question_number')return Object.freeze({ok:false,reason:'QUESTION_NUMBER_NOT_FIRST',length:b.length,counts});
 if(types.at(-1)!=='instruction')return Object.freeze({ok:false,reason:'INSTRUCTION_NOT_LAST',length:b.length,counts});
 if(counts.question_number!==1||counts.choices!==1||counts.instruction!==1)return Object.freeze({ok:false,reason:'BLOCK_CARDINALITY_INVALID',length:b.length,counts});
 for(let i=0;i<b.length;i++){
   if(b[i].order!==i)return Object.freeze({ok:false,reason:'ORDER_INDEX_MISMATCH',index:i,length:b.length,counts});
   if(b[i].questionId && b[i].questionId!==q.id)return Object.freeze({ok:false,reason:'QUESTION_ID_MISMATCH',index:i,length:b.length,counts});
 }
 const firstText=types.indexOf('text'), firstVisual=Math.min(...['figure','table'].map(t=>{const i=types.indexOf(t);return i<0?Infinity:i}));
 if(firstText<0||firstText>firstVisual)return Object.freeze({ok:false,reason:'QUESTION_TEXT_POSITION_INVALID',length:b.length,counts});
 return Object.freeze({ok:true,length:b.length,counts,signature:types.join('>')});
}
export function getVerifiedDisplayArray(q){
 const audit=validateDisplayArray(q);
 if(!audit.ok)throw new Error('DISPLAY_ARRAY_REJECTED:'+audit.reason);
 return Object.freeze({audit,blocks:q.contentBlocks});
}
