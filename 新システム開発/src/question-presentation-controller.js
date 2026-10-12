/**
 * 出題表示の順序をコードで固定する。
 * AI/呼出側は blocks の順序を変更してはならない。
 * 図が必要な問題で inlineImage が未準備なら fail-closed で出題しない。
 */
export function buildQuestionPresentation({
  year, section, number, stem, inlineImage=null, imageRequired=false,
  supplemental=[], choices, instruction='番号で答えてください。'
}) {
  const fail=reason=>Object.freeze({status:'unavailable',reason,blocks:Object.freeze([])});
  if(!Number.isInteger(number)||number<1)return fail('QUESTION_NUMBER_INVALID');
  if(typeof stem!=='string'||!stem.trim())return fail('QUESTION_TEXT_MISSING');
  if(!Array.isArray(choices)||choices.length!==5||choices.some(x=>typeof x!=='string'||!x.trim()))return fail('CHOICES_INVALID');
  if(imageRequired){
    if(!inlineImage||inlineImage.kind!=='inline_image'||typeof inlineImage.assetId!=='string'||!inlineImage.assetId.trim())return fail('INLINE_IMAGE_REQUIRED');
    if(inlineImage.questionNumber!==number)return fail('INLINE_IMAGE_QUESTION_MISMATCH');
  }
  const blocks=[
    Object.freeze({kind:'question_header',text:`■${year}年度 ${section} 問${number}`}),
    Object.freeze({kind:'question_text',text:stem.trim()})
  ];
  if(imageRequired)blocks.push(Object.freeze({kind:'figure_label',text:'【図】'}),Object.freeze({...inlineImage}));
  for(const item of supplemental){
    if(!item||!['table','text'].includes(item.kind))return fail('SUPPLEMENTAL_INVALID');
    blocks.push(Object.freeze({...item}));
  }
  blocks.push(Object.freeze({kind:'choices',items:Object.freeze([...choices])}),Object.freeze({kind:'instruction',text:instruction}));
  return Object.freeze({status:'question',number,blocks:Object.freeze(blocks)});
}

export function assertPresentationOrder(presentation){
  if(!presentation||presentation.status!=='question'||!Array.isArray(presentation.blocks))return {ok:false,reason:'PRESENTATION_INVALID'};
  const kinds=presentation.blocks.map(x=>x.kind);
  if(kinds[0]!=='question_header'||kinds[1]!=='question_text')return {ok:false,reason:'HEADER_TEXT_ORDER_INVALID'};
  const fig=kinds.indexOf('figure_label'),img=kinds.indexOf('inline_image'),choices=kinds.indexOf('choices'),instruction=kinds.indexOf('instruction');
  if(fig>=0&&(img!==fig+1||choices<=img))return {ok:false,reason:'FIGURE_POSITION_INVALID'};
  if(choices<2||instruction!==kinds.length-1||instruction<=choices)return {ok:false,reason:'CHOICE_INSTRUCTION_ORDER_INVALID'};
  return {ok:true};
}
