/**
 * 資格・年度・問題形式に依存しない正式問題モデル。
 * assets は出現順。choice / numeric / text / multiChoice に対応。
 * AIは内容・順序を変更しない。
 */
export function buildUniversalQuestion(q){
 const fail=reason=>Object.freeze({status:'blocked',reason});
 if(!q||typeof q.qualification!=='string'||!q.qualification.trim())return fail('QUALIFICATION_MISSING');
 if(!q.exam||!q.questionId||typeof q.stem!=='string'||!q.stem.trim())return fail('QUESTION_CORE_INVALID');
 if(!Array.isArray(q.assets))return fail('ASSETS_INVALID');
 for(const [i,a] of q.assets.entries()){
   if(!a||!['figure','table','formula','text'].includes(a.kind)||a.order!==i)return fail('ASSET_ORDER_INVALID');
   if(a.kind==='figure'&&(!a.assetId||a.questionId!==q.questionId))return fail('FIGURE_BINDING_INVALID');
 }
 const t=q.response?.type;
 if(!['choice','multiChoice','numeric','text'].includes(t))return fail('RESPONSE_TYPE_INVALID');
 if(t==='choice'&&(!Array.isArray(q.response.options)||q.response.options.length<2))return fail('OPTIONS_INVALID');
 if(!q.answer||q.answer.value===undefined||!q.answer.sourceSha256)return fail('ANSWER_NOT_PINNED');
 return Object.freeze({status:'ready',...q,assets:Object.freeze(q.assets.map(Object.freeze)),response:Object.freeze({...q.response}),answer:Object.freeze({...q.answer})});
}
export function publicQuestion(q){
 if(!q||q.status!=='ready')throw new Error('QUESTION_NOT_READY');
 return Object.freeze({qualification:q.qualification,exam:q.exam,questionId:q.questionId,stem:q.stem,assets:q.assets,response:q.response});
}
export function gradeUniversal(q,input){
 if(!q||q.status!=='ready')return {status:'blocked',reason:'QUESTION_NOT_READY'};
 const t=q.response.type;
 if(t==='choice'){
   const n=Number(String(input).trim());
   if(!Number.isInteger(n)||n<1||n>q.response.options.length)return {status:'invalid'};
   return Object.freeze({status:'graded',correct:n===q.answer.value,selected:n,correctAnswer:q.answer.value});
 }
 if(t==='multiChoice'){
   const got=[...new Set(Array.isArray(input)?input:[])].sort();
   const ans=[...q.answer.value].sort();
   return Object.freeze({status:'graded',correct:JSON.stringify(got)===JSON.stringify(ans),selected:got,correctAnswer:ans});
 }
 if(t==='numeric'){
   const n=Number(input); if(!Number.isFinite(n))return {status:'invalid'};
   const tol=q.answer.tolerance??0; return Object.freeze({status:'graded',correct:Math.abs(n-q.answer.value)<=tol,selected:n,correctAnswer:q.answer.value});
 }
 const s=String(input).trim(); if(!s)return {status:'invalid'};
 return Object.freeze({status:'graded',correct:s===String(q.answer.value),selected:s,correctAnswer:q.answer.value});
}
