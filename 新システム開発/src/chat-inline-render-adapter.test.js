import {compileChatInlinePayload,verifyChatInlineReceipt} from './chat-inline-render-adapter.js';
function ok(v,m){if(!v)throw new Error(m)}
const q={status:'ready',id:'q2',packetHash:'hash-q2',contentBlocks:[
 {order:0,type:'question_number',value:'Q2'},
 {order:1,type:'text',value:'stem'},
 {order:2,type:'figure',assetId:'fig2'},
 {order:3,type:'text',value:'statements'},
 {order:4,type:'choices',value:['1','2','3','4','5']},
 {order:5,type:'instruction',value:'番号で答えてください。'}
]};
const registry={resolve:id=>id==='fig2'?{questionId:'q2',verified:true,mime:'image/png',inlineRef:'verified-inline-ref',sha256:'figsha'}:null};
const p=compileChatInlinePayload(q,registry);
ok(p.status==='ready','payload');
ok(p.signature==='question_number>body>official_figure>body>choices>instruction','order');
ok(verifyChatInlineReceipt(p,{complete:true,questionId:'q2',packetHash:'hash-q2',signature:p.signature,nodeCount:6}).ok,'receipt');
const bad={...q,contentBlocks:q.contentBlocks.map(x=>x.type==='figure'?{...x,assetId:'missing'}:x)};
ok(compileChatInlinePayload(bad,registry).status==='blocked','missing asset');
ok(!verifyChatInlineReceipt(p,{complete:true,questionId:'q2',packetHash:'hash-q2',signature:'wrong',nodeCount:6}).ok,'wrong order');
console.log('PASS chat-inline-render-adapter 5 checks');
