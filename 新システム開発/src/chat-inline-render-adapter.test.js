import {compileChatInlinePayload,verifyChatInlineReceipt,renderChatInlineMarkdown} from './chat-inline-render-adapter.js';
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

const iosFigure='sandbox:/mnt/data/official-q3.png?_chatgptios_conversationID=6acb6ae2-3a40-83ee-9d31-fe1181310e46&_chatgptios_messageID=dcd9c58a-39fa-4f0e-a3ee-b2cd9e558b34';
const markdownPayload={status:'ready',questionId:'q3',packetHash:'q3hash',nodes:[
 {role:'question_number',value:'■2025年度 問3'},
 {role:'body',value:'問題文の前半'},
 {role:'official_figure',value:iosFigure},
 {role:'body',value:'問題文の後半'},
 {role:'choices',value:['選択肢A','選択肢B']},
 {role:'instruction',value:'番号で答えてください。'}
]};
const markdownResult=renderChatInlineMarkdown(markdownPayload);
ok(markdownResult.status==='ready','inline markdown payload ready');
const imageMarkdown='![公式図]('+iosFigure+')';
ok(markdownResult.markdown.includes(imageMarkdown),'figure is emitted as an actual Markdown image link');
ok(markdownResult.markdown.includes(String.fromCharCode(10)+String.fromCharCode(10)+imageMarkdown),'Markdown blocks are separated with real line breaks');
ok(markdownResult.markdown.indexOf('問題文の前半')<markdownResult.markdown.indexOf(imageMarkdown)&&
 markdownResult.markdown.indexOf(imageMarkdown)<markdownResult.markdown.indexOf('問題文の後半')&&
 markdownResult.markdown.indexOf('問題文の後半')<markdownResult.markdown.indexOf('選択肢A'),
 'image stays between its adjacent stem segments and before choices');
ok(markdownResult.markdown.endsWith('番号で答えてください。'),'complete message ends with answer instruction');
ok(renderChatInlineMarkdown({...markdownPayload,nodes:markdownPayload.nodes.map(n=>n.role==='official_figure'?{...n,value:'inline-not-a-url'}:n)}).reason==='INLINE_IMAGE_REFERENCE_INVALID',
 'placeholder text is rejected instead of silently replacing the figure');
ok(renderChatInlineMarkdown({...markdownPayload,nodes:markdownPayload.nodes.map(n=>n.role==='official_figure'?{...n,value:'sandbox:/mnt/data/no-context.png'}:n)}).reason==='INLINE_IMAGE_CONTEXT_MISSING',
 'iOS image reference without required source message context is rejected');
console.log('PASS chat-inline-render-adapter markdown serialization and iOS figure embedding');
