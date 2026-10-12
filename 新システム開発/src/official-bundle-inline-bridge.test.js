import {createHash} from 'node:crypto';
import {bridgeOfficialBundleToInline,createOfficialQuestionBundleBuilder} from './official-bundle-inline-bridge.js';
const h=s=>createHash('sha256').update(s).digest('hex'), ok=(v,m)=>{if(!v)throw new Error(m)};
const key='土地家屋調査士:2025:午後:6',body='公式PDFから確定した問題本文',choices=['1','2','3','4','5'];
const assets=[{id:'fig6',kind:'figure',page:4,sha256:'a'.repeat(64),crop:{x0:1,y0:2,x1:3,y1:4}},{id:'tab6',kind:'table',page:4,sha256:'b'.repeat(64),crop:{x0:5,y0:6,x1:7,y1:8}}];
const studyUnitId='surveying:control-points',studyPlanSha256='c'.repeat(64);
const bundle={schema:'official-question-bundle-v1',key,studyUnitId,studyPlanSha256,displayNumber:'■2025年度 午後の部 問6',source:{questionPdfSha256:'qsha',answerPdfSha256:'asha',pages:[4]},body,choices,answer:{number:4,evidenceSha256:h('answer-cell')},assets,layout:['body','fig6','tab6','choices','answer-control'],packetHash:'packet6'};
const manifest={key,studyUnitId,studyPlanSha256,questionPdfSha256:'qsha',answerPdfSha256:'asha',pages:[4],bodySha256:h(body),choiceSha256:choices.map(h),answerNumber:4,answerEvidenceSha256:h('answer-cell'),assets,reviewStatus:'approved',allVisualsAccountedFor:true,answerCellChecked:true,textChecked:true,displayChecked:true};
const reg={resolve:id=>({questionId:key,verified:true,mime:'image/png',inlineRef:'inline-'+id,sha256:assets.find(x=>x.id===id)?.sha256})};
const p=bridgeOfficialBundleToInline(bundle,manifest,reg);
ok(p.status==='ready','bridge ready');ok(p.signature==='question_number>body>official_figure>official_table>choices>instruction','order');ok(p.packetHash==='packet6','packet binding');
ok(p.question.id===key&&p.question.number===6&&p.packet.id===key,'canonical question and packet returned');
ok(p.question.explanationPolicy==='general'&&p.packet.explanationPolicy==='general','ordinary surveying policy retained');
ok(p.question.studyUnitId===studyUnitId&&p.packet.studyPlanSha256===studyPlanSha256&&p.question.verifiedBundle===true,'approved unit and plan binding reaches flow');
const takken={...bundle,qualification:'宅建'};
const takkenManifest={...manifest};
ok(bridgeOfficialBundleToInline(takken,takkenManifest,reg).reason==='LEGAL_BASIS_POLICY_UNBOUND','legal qualification without policy blocked');
const lawBundle={...bundle,qualification:'宅建',subjectArea:'law',explanationPolicy:'legal_basis_required'};
const lawManifest={...manifest,explanationPolicy:'legal_basis_required'};
const law=bridgeOfficialBundleToInline(lawBundle,lawManifest,reg);
ok(law.status==='ready'&&law.question.subjectArea==='law'&&law.packet.explanationPolicy==='legal_basis_required','legal policy reaches canonical packet');
ok(bridgeOfficialBundleToInline(lawBundle,{...lawManifest,explanationPolicy:'general'},reg).reason==='LEGAL_BASIS_POLICY_UNBOUND','legal policy mismatch blocked');
const topicalLaw={...bundle,subjectArea:'law',explanationPolicy:'legal_basis_required'};
ok(bridgeOfficialBundleToInline(topicalLaw,lawManifest,reg).status==='ready','law topic requires explicit basis policy');
const bad={...manifest,textChecked:false};ok(bridgeOfficialBundleToInline(bundle,bad,reg).status==='blocked','unreviewed blocked');
const miss={resolve:id=>id==='fig6'?reg.resolve(id):null};ok(bridgeOfficialBundleToInline(bundle,manifest,miss).status==='blocked','missing visual blocked');

const fig7={id:'fig7',kind:'figure',page:4,sha256:'d'.repeat(64),crop:{x0:8,y0:9,x1:10,y1:11}};
const orderedAssets=[...assets,fig7];
const orderedBody='前半本文中間本文後半';
const orderedBlocks=[
 {type:'text',value:'前半本文'},
 {type:'figure',assetId:'fig6'},
 {type:'text',value:'中間本文'},
 {type:'figure',assetId:'fig7'},
 {type:'table',assetId:'tab6'},
 {type:'text',value:'後半'}
];
const blockHash=block=>h(block.type==='text'?block.value:block.type+':'+block.assetId);
const orderedLayout=['text:0','figure:fig6','text:1','figure:fig7','table:tab6','text:2','choices','answer-control'];
const orderedBundle={...bundle,body:orderedBody,assets:orderedAssets,contentBlocks:orderedBlocks,layout:orderedLayout};
const orderedManifest={...manifest,bodySha256:h(orderedBody),assets:structuredClone(orderedAssets),
 contentBlockSha256:orderedBlocks.map(blockHash)};
const orderedRegistry={resolve:id=>{
 const item=orderedAssets.find(x=>x.id===id);
 return item?{questionId:key,verified:true,mime:'image/png',inlineRef:'inline-'+id,sha256:item.sha256}:null;
}};
const ordered=bridgeOfficialBundleToInline(orderedBundle,orderedManifest,orderedRegistry);
ok(ordered.status==='ready','interleaved content block bundle accepted');
ok(ordered.packet.contentBlocks.map(x=>x.type+(x.assetId?':'+x.assetId:'')).join('|')===
 'question_number|text|figure:fig6|text|figure:fig7|table:tab6|text|choices|instruction',
 'text, multiple figures, and table retain exact source order');
ok(ordered.signature==='question_number>body>official_figure>body>official_figure>official_table>body>choices>instruction',
 'render signature preserves interleaved positions');
ok(bridgeOfficialBundleToInline(orderedBundle,{...orderedManifest,contentBlockSha256:[...orderedManifest.contentBlockSha256].reverse()},orderedRegistry).reason==='CONTENT_BLOCK_HASH_MISMATCH',
 'changed/reordered content block evidence is rejected');
ok(bridgeOfficialBundleToInline({...orderedBundle,contentBlocks:orderedBlocks.slice(0,-2)},{...orderedManifest,contentBlockSha256:orderedManifest.contentBlockSha256.slice(0,-2)},orderedRegistry).reason==='CONTENT_BLOCK_SEQUENCE_INCOMPLETE',
 'missing asset or text block is rejected');

const extraction={
 key:'測量士補:2025:午前:7',qualification:'測量士補',year:2025,section:'午前',number:7,
 studyUnitId:'surveying:control-points',studyPlanSha256:'c'.repeat(64),displayNumber:'■2025年度 午前の部 問7',
 questionPdfSha256:'q'.repeat(64),answerPdfSha256:'a'.repeat(64),pages:[4],
 stemText:'ABCD1234WXYZ',stemSha256:h('ABCD1234WXYZ'),
 choices:['選択肢1','選択肢2','選択肢3','選択肢4','選択肢5'],answerNumber:3,answerEvidenceSha256:h('公式正答行')
};
const builderAssets=[
 {id:'builder-fig',kind:'figure',page:4,sha256:'e'.repeat(64),crop:{x0:1,y0:1,x1:20,y1:20}},
 {id:'builder-tab',kind:'table',page:4,sha256:'f'.repeat(64),crop:{x0:21,y0:1,x1:40,y1:20}}
];
const layoutReview={
 status:'approved',key:extraction.key,questionPdfSha256:extraction.questionPdfSha256,
 answerPdfSha256:extraction.answerPdfSha256,stemSha256:extraction.stemSha256,pages:[4],
 answerEvidenceSha256:extraction.answerEvidenceSha256,assets:builderAssets,
 contentOrder:[
  {type:'text',startOffset:0,endOffset:4},
  {type:'figure',assetId:'builder-fig',atOffset:4},
  {type:'text',startOffset:4,endOffset:8},
  {type:'table',assetId:'builder-tab',atOffset:8},
  {type:'text',startOffset:8,endOffset:12}
 ],
 allVisualsAccountedFor:true,textChecked:true,displayChecked:true,answerCellChecked:true
};
const bundleBuilder=createOfficialQuestionBundleBuilder({
 verifyExtraction:value=>value===extraction,
 verifyLayoutReview:value=>value===layoutReview
});
const built=await bundleBuilder({extraction,layoutReview});
ok(built.status==='ready','verified extraction and reviewed layout create a bundle');
ok(Object.isFrozen(built.bundle.contentBlocks)&&Object.isFrozen(built.manifest.assets[0].crop),
 'bundle and manifest are deeply immutable');
const builtRegistry={resolve:id=>{
 const a=builderAssets.find(x=>x.id===id);
 return a?{questionId:extraction.key,verified:true,mime:'image/png',inlineRef:'inline-'+id,sha256:a.sha256}:null;
}};
const builtInline=bridgeOfficialBundleToInline(built.bundle,built.manifest,builtRegistry);
ok(builtInline.status==='ready','built bundle enters inline rendering gate');
ok(builtInline.signature==='question_number>body>official_figure>body>official_table>body>choices>instruction',
 'PDF text offsets and reviewed figure/table placements reach inline payload in order');
const deniedBuilder=createOfficialQuestionBundleBuilder({verifyExtraction:()=>false,verifyLayoutReview:()=>true});
ok((await deniedBuilder({extraction,layoutReview})).reason==='PINNED_EXTRACTION_NOT_VERIFIED',
 'unverified PDF extraction is blocked before bundle assembly');
const structuralBuilder=createOfficialQuestionBundleBuilder({verifyExtraction:()=>true,verifyLayoutReview:()=>true});
const gapReview={...layoutReview,contentOrder:[
 ...layoutReview.contentOrder.slice(0,2),
 {...layoutReview.contentOrder[2],startOffset:5}
]};
ok((await structuralBuilder({extraction,layoutReview:gapReview})).reason==='TEXT_SEGMENT_OFFSETS_INVALID',
 'text gaps cannot be hidden around a visual insertion');
const missingAssetReview={...layoutReview,contentOrder:layoutReview.contentOrder.filter(x=>x.assetId!=='builder-tab')};
ok((await structuralBuilder({extraction,layoutReview:missingAssetReview})).reason==='CONTENT_ORDER_INCOMPLETE',
 'unplaced official visual asset blocks bundle readiness');
console.log('PASS official bundle inline bridge: ordered interleaved text, multiple figures, and tables');

