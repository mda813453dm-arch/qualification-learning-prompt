/**
 * AIの権限をルーティングだけに制限するガード。
 * AIは renderer / grader / state transition を直接実装・代替してはならない。
 */
const ROUTES=Object.freeze(['question','grade','review','explain','status']);
export function routeUserIntent(intent){
 if(!ROUTES.includes(intent?.type))return Object.freeze({ok:false,reason:'UNKNOWN_INTENT'});
 return Object.freeze({ok:true,program:intent.type,payload:Object.freeze({...intent.payload})});
}
export function enforceProgramOnly(action){
 const forbidden=new Set(['manual_question_render','manual_image_emit','manual_grade','manual_next_question','manual_source_research_after_pin']);
 if(forbidden.has(action))throw new Error('AI_ACTION_FORBIDDEN:'+action);
 return true;
}
export function requireExecutableRenderer(renderer){
 if(!renderer||renderer.verified!==true||renderer.singlePayload!==true)
   return Object.freeze({ok:false,reason:'VERIFIED_RENDERER_REQUIRED'});
 return Object.freeze({ok:true});
}
