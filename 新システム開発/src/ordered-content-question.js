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
