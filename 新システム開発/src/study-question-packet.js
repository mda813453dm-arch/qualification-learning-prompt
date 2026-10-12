/**
 * AIに判断させない学習出題パケット。
 * プログラムが「問番号・問題文・図・表・選択肢・正解」を一括で返す。
 * AIは packet を順番通り表示し、judge() を呼ぶだけ。
 */
export function createStudyQuestionPacket({
 qualification,year,section,number,stem,figure=null,table=null,choices,
 answer,questionSourceSha256,answerSourceSha256
}){
 const bad=r=>Object.freeze({status:'unavailable',reason:r});
 if(!qualification||!Number.isInteger(year)||!section||!Number.isInteger(number)||number<1)return bad('IDENTITY_INVALID');
 if(typeof stem!=='string'||!stem.trim())return bad('STEM_MISSING');
 if(!Array.isArray(choices)||choices.length!==5||choices.some(x=>typeof x!=='string'||!x.trim()))return bad('CHOICES_INVALID');
 if(!Number.isInteger(answer)||answer<1||answer>5)return bad('ANSWER_INVALID');
 if(!/^[a-f0-9]{64}$/.test(questionSourceSha256??'')||!/^[a-f0-9]{64}$/.test(answerSourceSha256??''))return bad('SOURCE_HASH_INVALID');
 if(figure && (figure.questionNumber!==number||!figure.assetId))return bad('FIGURE_INVALID');
 if(table && table.questionNumber!==number)return bad('TABLE_INVALID');
 const display=Object.freeze([
   Object.freeze({kind:'number',value:number}),
   Object.freeze({kind:'stem',value:stem.trim()}),
   ...(figure?[Object.freeze({kind:'figure',value:Object.freeze({...figure})})]:[]),
   ...(table?[Object.freeze({kind:'table',value:Object.freeze({...table})})]:[]),
   Object.freeze({kind:'choices',value:Object.freeze([...choices])})
 ]);
 return Object.freeze({
  status:'ready',qualification,year,section,number,display,
  answer:Object.freeze({number:answer,sourceSha256:answerSourceSha256}),
  source:Object.freeze({questionSha256:questionSourceSha256,answerSha256:answerSourceSha256})
 });
}
export function judgeStudyAnswer(packet,input){
 if(!packet||packet.status!=='ready')return {status:'unavailable',reason:'PACKET_NOT_READY'};
 const n=Number(String(input).trim());
 if(!Number.isInteger(n)||n<1||n>5)return {status:'invalid',reason:'ANSWER_INPUT_INVALID'};
 return Object.freeze({status:'graded',questionNumber:packet.number,selected:n,correct:n===packet.answer.number,correctAnswer:packet.answer.number});
}
export function assertCompletePacket(packet,{figureRequired=false,tableRequired=false}={}){
 if(!packet||packet.status!=='ready')return {ok:false,reason:'PACKET_NOT_READY'};
 const k=packet.display.map(x=>x.kind);
 const expected=['number','stem',...(figureRequired?['figure']:[]),...(tableRequired?['table']:[]),'choices'];
 if(k.join('|')!==expected.join('|'))return {ok:false,reason:'DISPLAY_CONTRACT_MISMATCH'};
 return {ok:true};
}
