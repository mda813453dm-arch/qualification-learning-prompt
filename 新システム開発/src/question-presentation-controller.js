/**
 * 問5でiPhone実機合格した形式を唯一の正式レンダリング契約として固定する。
 * 1 question = 1 atomic render plan.
 * 呼出側は plan.events を先頭から同期的に処理し、途中で別メッセージを挿入してはならない。
 */
export function buildQuestionPresentation({
  year, section, number, stem, inlineImage=null, imageRequired=false,
  supplemental=[], choices, instruction='番号で答えてください。'
}) {
  const fail=reason=>Object.freeze({status:'unavailable',reason,events:Object.freeze([])});
  if(!Number.isInteger(number)||number<1)return fail('QUESTION_NUMBER_INVALID');
  if(typeof stem!=='string'||!stem.trim())return fail('QUESTION_TEXT_MISSING');
  if(!Array.isArray(choices)||choices.length!==5||choices.some(x=>typeof x!=='string'||!x.trim()))return fail('CHOICES_INVALID');
  if(imageRequired){
    if(!inlineImage||inlineImage.kind!=='inline_image'||typeof inlineImage.assetId!=='string'||!inlineImage.assetId.trim())return fail('INLINE_IMAGE_REQUIRED');
    if(inlineImage.questionNumber!==number)return fail('INLINE_IMAGE_QUESTION_MISMATCH');
  }
  const events=[
    Object.freeze({kind:'question_header',text:`■${year}年度 ${section} 問${number}`}),
    Object.freeze({kind:'question_text',text:stem.trim()})
  ];
  if(imageRequired) events.push(
    Object.freeze({kind:'figure_label',text:'【図】'}),
    Object.freeze({...inlineImage,kind:'inline_image'})
  );
  for(const item of supplemental){
    if(!item||!['table','text'].includes(item.kind))return fail('SUPPLEMENTAL_INVALID');
    events.push(Object.freeze({...item}));
  }
  events.push(
    Object.freeze({kind:'choices',items:Object.freeze([...choices])}),
    Object.freeze({kind:'instruction',text:instruction})
  );
  const plan=Object.freeze({status:'question',atomic:true,number,events:Object.freeze(events)});
  const check=assertPresentationOrder(plan);
  return check.ok?plan:fail(check.reason);
}

export function assertPresentationOrder(plan){
  if(!plan||plan.status!=='question'||plan.atomic!==true||!Array.isArray(plan.events))return {ok:false,reason:'PRESENTATION_INVALID'};
  const k=plan.events.map(x=>x.kind);
  if(k[0]!=='question_header'||k[1]!=='question_text')return {ok:false,reason:'HEADER_TEXT_ORDER_INVALID'};
  const f=k.indexOf('figure_label'),i=k.indexOf('inline_image'),c=k.indexOf('choices'),z=k.indexOf('instruction');
  if((f<0)!==(i<0))return {ok:false,reason:'FIGURE_PAIR_INVALID'};
  if(f>=0&&(f!==2||i!==3||c<=i))return {ok:false,reason:'FIGURE_POSITION_INVALID'};
  if(c<2||z!==k.length-1||z<=c)return {ok:false,reason:'CHOICE_INSTRUCTION_ORDER_INVALID'};
  return {ok:true};
}

/**
 * UIアダプタ。emitText/emitImageは同一のChatGPT出力コンテナへ順番に追加する実装を渡す。
 * 画像を別メッセージとして先出しするアダプタは禁止。
 */
export async function renderAtomically(plan,{emitText,emitImage,emitTable}){
  const checked=assertPresentationOrder(plan);
  if(!checked.ok)throw new Error(checked.reason);
  if(typeof emitText!=='function'||typeof emitImage!=='function')throw new Error('RENDER_ADAPTER_INVALID');
  for(const e of plan.events){
    if(e.kind==='inline_image') await emitImage(e);
    else if(e.kind==='table'){
      if(typeof emitTable!=='function')throw new Error('TABLE_RENDERER_REQUIRED');
      await emitTable(e);
    } else if(e.kind==='choices') await emitText({kind:'choices',text:e.items.map((x,n)=>`${n+1}：${x}`).join('\n')});
    else await emitText(e);
  }
  return {ok:true,number:plan.number};
}
