import {compileChatInlinePayload} from './chat-inline-render-adapter.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const mk=(id,blocks)=>({status:'ready',id,packetHash:'h-'+id,contentBlocks:blocks.map((b,i)=>({order:i,...b}))});
const asset=(id,q)=>({questionId:q,verified:true,mime:'image/png',inlineRef:'inline-'+id,sha256:'sha-'+id});
const tail=[{type:'choices',value:['1','2','3','4','5']},{type:'instruction',value:'番号で答えてください。'}];
const cases=[
 ['q6',[{type:'question_number',value:'■2025年度 午前の部 問6'},{type:'text',value:'本文'},{type:'figure',assetId:'fig6'},{type:'table',value:[['1','110.40','170.72']]},...tail]],
 ['multi',[{type:'question_number',value:'Q'},{type:'text',value:'本文'},{type:'figure',assetId:'a'},{type:'text',value:'続き'},{type:'figure',assetId:'b'},...tail]],
 ['page-span',[{type:'question_number',value:'Q'},{type:'text',value:'1ページ目本文'},{type:'figure',assetId:'p1'},{type:'text',value:'2ページ目本文'},...tail]]
];
for(const [id,blocks] of cases){
 const q=mk(id,blocks), reg={resolve:x=>asset(x,id)}, p=compileChatInlinePayload(q,reg);
 ok(p.status==='ready',id); ok(p.nodes.at(-1).role==='instruction',id+' complete');
}
const q=mk('fail',[{type:'question_number',value:'Q'},{type:'text',value:'本文'},{type:'figure',assetId:'missing'},...tail]);
ok(compileChatInlinePayload(q,{resolve:()=>null}).status==='blocked','missing asset must fail closed');
console.log('PASS phase4 final patterns');
