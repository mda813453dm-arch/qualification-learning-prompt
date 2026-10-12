import {makeOrderedQuestion,validateDisplayArray} from './ordered-content-question.js';
import {compileChatInlinePayload} from './chat-inline-render-adapter.js';
const ok=(v,m)=>{if(!v)throw new Error(m)};
const q2=makeOrderedQuestion({
 id:'2025-land-surveyor-morning-q2',qualification:'土地家屋調査士',exam:'2025年度 午前の部',
 contentBlocks:[
  {order:0,type:'question_number',value:'■2025年度 午前の部 問2'},
  {order:1,type:'text',value:'問題本文',questionId:'2025-land-surveyor-morning-q2'},
  {order:2,type:'figure',assetId:'q2-official-figure',questionId:'2025-land-surveyor-morning-q2'},
  {order:3,type:'text',value:'ア〜オ',questionId:'2025-land-surveyor-morning-q2'},
  {order:4,type:'choices',value:['1 アウ','2 アエ','3 イウ','4 イオ','5 エオ'],questionId:'2025-land-surveyor-morning-q2'},
  {order:5,type:'instruction',value:'番号で答えてください。',questionId:'2025-land-surveyor-morning-q2'}],
 answer:{value:4,sourceSha256:'3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad'}
});
ok(q2.status==='ready','official q2 packet');
const audit=validateDisplayArray(q2);ok(audit.ok,'display audit');
const reg={resolve:id=>id==='q2-official-figure'?{questionId:q2.id,verified:true,mime:'image/png',inlineRef:'official-q2-inline',sha256:'verified-crop-sha'}:null};
const p=compileChatInlinePayload({...q2,packetHash:'official-q2-packet'},reg);
ok(p.status==='ready','inline payload');
ok(p.signature==='question_number>body>official_figure>body>choices>instruction','official order');
ok(p.nodes[2].assetId==='q2-official-figure','official figure binding');
ok(q2.answer.value===4,'pinned official answer');
console.log('PASS official question E2E fixture: 6 checks');
