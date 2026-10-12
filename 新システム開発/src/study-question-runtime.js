/**
 * AI判断を排除する実行状態機械。
 * AIに許可する操作は currentView() と submitAnswer() の結果表示だけ。
 * 問題選択・順序・図表・正解・次問遷移はコードが決定する。
 */
export function createStudyRuntime({packets,startNumber=1}){
 if(!Array.isArray(packets)||!packets.length)throw new Error('PACKETS_REQUIRED');
 const byNo=new Map();
 for(const p of packets){
  if(!p||p.status!=='ready'||byNo.has(p.number))throw new Error('PACKET_SET_INVALID');
  byNo.set(p.number,p);
 }
 const order=[...byNo.keys()].sort((a,b)=>a-b);
 let index=order.indexOf(startNumber);
 if(index<0)throw new Error('START_NOT_FOUND');
 let phase='awaiting_answer';
 const view=p=>Object.freeze({
   type:'question',number:p.number,
   blocks:Object.freeze(p.display.map(x=>Object.freeze({...x}))),
   instruction:'番号で答えてください。'
 });
 return Object.freeze({
  currentView(){
   if(phase!=='awaiting_answer')return Object.freeze({type:'no_question',reason:'ANSWER_REQUIRED_OR_FINISHED'});
   return view(byNo.get(order[index]));
  },
  submitAnswer(input){
   if(phase!=='awaiting_answer')return Object.freeze({type:'rejected',reason:'NOT_AWAITING_ANSWER'});
   const p=byNo.get(order[index]),n=Number(String(input).trim());
   if(!Number.isInteger(n)||n<1||n>5)return Object.freeze({type:'rejected',reason:'ANSWER_INPUT_INVALID'});
   const result=Object.freeze({type:'grade',number:p.number,selected:n,correct:n===p.answer.number,correctAnswer:p.answer.number});
   index++;
   phase=index<order.length?'awaiting_answer':'finished';
   return Object.freeze({result,next:phase==='finished'?Object.freeze({type:'finished'}):view(byNo.get(order[index]))});
  },
  state(){return Object.freeze({phase,currentNumber:phase==='awaiting_answer'?order[index]:null});}
 });
}

/**
 * UIはこの命令列以外を出題領域に追加してはいけない。
 * 正解は question view に含めない。
 */
export function toRenderCommands(view){
 if(!view||view.type!=='question')throw new Error('QUESTION_VIEW_REQUIRED');
 const cmds=[];
 for(const b of view.blocks){
  if(b.kind==='number')cmds.push(Object.freeze({op:'TEXT',value:`■問${b.value}`}));
  else if(b.kind==='stem')cmds.push(Object.freeze({op:'TEXT',value:b.value}));
  else if(b.kind==='figure')cmds.push(Object.freeze({op:'IMAGE',value:b.value}));
  else if(b.kind==='table')cmds.push(Object.freeze({op:'TABLE',value:b.value}));
  else if(b.kind==='choices')cmds.push(Object.freeze({op:'CHOICES',value:b.value}));
  else throw new Error('UNKNOWN_BLOCK_KIND');
 }
 cmds.push(Object.freeze({op:'TEXT',value:view.instruction}));
 return Object.freeze(cmds);
}
