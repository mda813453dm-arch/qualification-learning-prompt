/**
 * 公式正解表を事前固定し、回答後は再検索せず即時採点する。
 * answerMap はコード側で検証済みデータのみ渡す。
 */
export function createAnswerJudge({qualification,year,section,answerMap,sourceSha256}){
 if(!qualification||!Number.isInteger(year)||!section||!sourceSha256||!/^[a-f0-9]{64}$/.test(sourceSha256))throw new Error('ANSWER_SOURCE_INVALID');
 if(!answerMap||typeof answerMap!=='object')throw new Error('ANSWER_MAP_INVALID');
 const fixed=Object.freeze({...answerMap});
 return Object.freeze({
  judge(questionNumber,input){
   const expected=fixed[questionNumber];
   if(!Number.isInteger(expected))return {status:'unavailable',reason:'ANSWER_NOT_PINNED'};
   const n=Number(String(input).trim());
   if(!Number.isInteger(n)||n<1||n>5)return {status:'invalid',reason:'ANSWER_INPUT_INVALID'};
   return Object.freeze({status:'graded',questionNumber,correct:n===expected,selected:n,correctAnswer:expected,sourceSha256});
  }
 });
}
