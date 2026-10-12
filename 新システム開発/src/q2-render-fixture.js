/**
 * 問2は汎用レンダラー検証fixture。専用レンダラーではない。
 * 実表示は renderer.render(question) の1呼出だけ許可する。
 */
export const q2Acceptance = Object.freeze({
 id:'2025-land-surveyor-morning-q2',
 requiredVisible:['question_number','question_text','figure','statements','choices','instruction'],
 forbid:['manual_question_render','manual_image_emit','split_message_render'],
 expectedOrder:['question_number','question_text','figure','statements','choices','instruction'],
 grading:'pinned_answer_only'
});
export function canRunQ2(renderer){
 const caps=renderer?.capabilities??{};
 const missing=[];
 for(const c of ['singleQuestionUnit','inlineOfficialImage','orderedBlocks','completionReceipt']) if(caps[c]!==true) missing.push(c);
 return Object.freeze({ok:missing.length===0,missing});
}
export async function runQ2(renderer,question){
 const gate=canRunQ2(renderer);
 if(!gate.ok)return Object.freeze({ok:false,reason:'RENDERER_CAPABILITY_MISSING',missing:gate.missing});
 if(typeof renderer.render!=='function')return Object.freeze({ok:false,reason:'RENDER_METHOD_MISSING'});
 const receipt=await renderer.render(question);
 if(!receipt||receipt.complete!==true)return Object.freeze({ok:false,reason:'INCOMPLETE_RENDER'});
 if(JSON.stringify(receipt.visible)!==JSON.stringify(q2Acceptance.expectedOrder))return Object.freeze({ok:false,reason:'VISIBLE_ORDER_MISMATCH'});
 return Object.freeze({ok:true,receipt});
}
