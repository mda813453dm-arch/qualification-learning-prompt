import {compileChatInlinePayload,verifyChatInlineReceipt} from './chat-inline-render-adapter.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const asset=(id,q='q')=>({questionId:q,verified:true,mime:'image/png',inlineRef:'inline-'+id,sha256:'sha-'+id});
const registry={resolve:id=>asset(id)};
const packet=(id,blocks)=>({status:'ready',id,packetHash:'hash-'+id,contentBlocks:blocks.map((b,i)=>({order:i,...b}))});
const end=[{type:'choices',value:['1','2','3','4','5']},{type:'instruction',value:'番号で答えてください。'}];
const cases=[
 ['no-figure',[{type:'question_number',value:'Q'},{type:'text',value:'stem'},...end],'question_number>body>choices>instruction'],
 ['one-figure',[{type:'question_number',value:'Q'},{type:'text',value:'stem'},{type:'figure',assetId:'f1'},...end],'question_number>body>official_figure>choices>instruction'],
 ['two-figures',[{type:'question_number',value:'Q'},{type:'figure',assetId:'f1'},{type:'figure',assetId:'f2'},...end],'question_number>official_figure>official_figure>choices>instruction'],
 ['figure-text-figure',[{type:'question_number',value:'Q'},{type:'figure',assetId:'f1'},{type:'text',value:'middle'},{type:'figure',assetId:'f2'},...end],'question_number>official_figure>body>official_figure>choices>instruction'],
 ['table-only',[{type:'question_number',value:'Q'},{type:'text',value:'stem'},{type:'table',value:[['A','B'],['1','2']]},...end],'question_number>body>official_table>choices>instruction'],
 ['figure-table',[{type:'question_number',value:'Q'},{type:'figure',assetId:'f1'},{type:'table',value:[['A','B']]},...end],'question_number>official_figure>official_table>choices>instruction']
];
let n=0;
for(const [id,blocks,sig] of cases){
 const p=compileChatInlinePayload(packet(id,blocks),{resolve:x=>asset(x,id)});
 ok(p.status==='ready',id+' ready'); ok(p.signature===sig,id+' order'); n+=2;
}
const missing=packet('missing',[{type:'question_number',value:'Q'},{type:'figure',assetId:'none'},...end]);
ok(compileChatInlinePayload(missing,{resolve:()=>null}).status==='blocked','missing asset');n++;
const wrong=packet('right',[{type:'question_number',value:'Q'},{type:'figure',assetId:'f1'},...end]);
ok(compileChatInlinePayload(wrong,{resolve:()=>asset('f1','other')}).status==='blocked','wrong binding');n++;
const p=compileChatInlinePayload(packet('receipt',[{type:'question_number',value:'Q'},...end]),registry);
ok(!verifyChatInlineReceipt(p,{complete:true,questionId:'receipt',packetHash:'hash-receipt',signature:'wrong',nodeCount:p.nodes.length}).ok,'wrong receipt order');n++;
console.log('PASS chat-inline-render-adapter '+n+' checks');
