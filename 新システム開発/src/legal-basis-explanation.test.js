import {createHash} from 'node:crypto';
import {createInlineStudyFlow} from './deterministic-inline-study-flow.js';
import {compileLegalBasisExplanation,resolveExplanationPolicy} from './legal-basis-explanation.js';
const ok=(v,m)=>{if(!v)throw new Error(m);};
const throws=async(fn,expected,m)=>{let e=null;try{await fn();}catch(x){e=x;}ok(e!==null,m+': did not block');ok(e.message===expected,m+': '+e?.message);};
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const sourceText='仮想法第1条 仮想的な条文本文';
const basis={lawName:'仮想法',provision:'第1条',effectiveDate:'2025-04-01',officialUrl:'https://elaws.e-gov.go.jp/document?lawid=0000000000000',sourceText,excerpt:'仮想的な条文本文',sourceSha256:hash(sourceText)};
const explanation={questionId:'q2',packetHash:'p2',text:'この選択肢は条文の要件を満たします。',legalBasis:[basis]};
const trustedVerifier=(item,context)=>({verified:true,questionId:context.questionId,packetHash:context.packetHash,officialUrl:item.officialUrl,effectiveDate:item.effectiveDate,sourceSha256:hash(item.sourceText),revisionId:'mock-revision'});
const c=await compileLegalBasisExplanation(explanation,{questionId:'q2',packetHash:'p2',verifyOfficialSource:trustedVerifier});
ok((await compileLegalBasisExplanation(explanation,{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_SOURCE_NOT_VERIFIED','trusted source retrieval evidence required');
ok((await compileLegalBasisExplanation(explanation,{questionId:'q2',packetHash:'p2',verifyOfficialSource:()=>false})).reason==='LEGAL_SOURCE_NOT_VERIFIED','failed official retrieval verification blocks');
ok(c.ok&&c.displayText.includes('■法的根拠')&&c.displayText.includes('仮想法 第1条')&&c.displayText.includes(basis.excerpt)&&c.displayText.includes(basis.officialUrl),'根拠欄と引用を表示');
ok((await compileLegalBasisExplanation('本文だけ',{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_EXPLANATION_REQUIRED','平文拒否');
ok((await compileLegalBasisExplanation({...explanation,legalBasis:[]},{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_BASIS_MISSING','根拠なし拒否');
ok((await compileLegalBasisExplanation({...explanation,legalBasis:[{...basis,effectiveDate:undefined}]},{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_CITATION_INCOMPLETE','適用時点なし拒否');
ok(c.displayText.includes('適用時点：2025-04-01'),'適用時点を表示');
ok((await compileLegalBasisExplanation({...explanation,packetHash:'other'},{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_EXPLANATION_BINDING_MISMATCH','別問根拠拒否');
ok((await compileLegalBasisExplanation({...explanation,legalBasis:[{...basis,officialUrl:'https://example.com'}]},{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_SOURCE_NOT_OFFICIAL','非公式URL拒否');
ok((await compileLegalBasisExplanation({...explanation,legalBasis:[{...basis,excerpt:'ない条文'}]},{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_EXCERPT_NOT_VERIFIED','原文にない引用拒否');
ok((await compileLegalBasisExplanation({...explanation,legalBasis:[{...basis,sourceSha256:'0'.repeat(64)}]},{questionId:'q2',packetHash:'p2'})).reason==='LEGAL_SOURCE_HASH_MISMATCH','hash不一致拒否');
await throws(()=>resolveExplanationPolicy('takken',{status:'ready',id:'q2',number:2},{status:'ready',id:'q2',number:2,packetHash:'p2'}),'LEGAL_BASIS_POLICY_UNBOUND','宅建の方針未固定');
await throws(()=>resolveExplanationPolicy('land-surveyor',{id:'q2',subjectArea:'law'},{id:'q2'}),'LEGAL_BASIS_POLICY_UNBOUND','土地家屋調査士の法令問題の方針未固定');
ok(resolveExplanationPolicy('land-surveyor',{id:'q2',subjectArea:'law',explanationPolicy:'legal_basis_required'},{id:'q2',explanationPolicy:'legal_basis_required'})==='legal_basis_required','法令問題で根拠必須');
ok(resolveExplanationPolicy('surveying-engineer',{id:'q2'},{id:'q2'})==='general','測量一般問題');

const studyPlan={status:'approved',qualificationId:'land-surveyor',sha256:'a'.repeat(64),itemIds:['property-rights']};
const registry={resolve:id=>id==='f2'?{questionId:'q2',verified:true,mime:'image/png',inlineRef:'inline-f2',sha256:'fig'}:id==='f3'?{questionId:'q3',verified:true,mime:'image/png',inlineRef:'inline-f3',sha256:'fig3'}:null};
const flow=createInlineStudyFlow(registry,{verifyOfficialSource:trustedVerifier,studyPlan});
const question={status:'ready',id:'q2',number:2,subjectArea:'law',explanationPolicy:'legal_basis_required',studyUnitId:'property-rights',studyPlanSha256:studyPlan.sha256};
const packet={status:'ready',id:'q2',number:2,packetHash:'p2',explanationPolicy:'legal_basis_required',studyUnitId:'property-rights',studyPlanSha256:studyPlan.sha256,answer:{value:4},contentBlocks:[
 {order:0,type:'question_number',value:'Q2'},{order:1,type:'text',value:'stem'},{order:2,type:'figure',assetId:'f2'},
 {order:3,type:'choices',value:['1','2','3','4','5']},{order:4,type:'instruction',value:'番号で答えてください。'}]};
const payload=flow.prepare({qualificationId:'land-surveyor',source:{problemSha256:'p',answerSha256:'a'},question,assets:[{assetId:'f2',sha256:'fig',sourcePage:2}],packet});
flow.rendered({complete:true,questionId:'q2',packetHash:'p2',signature:payload.signature,nodeCount:payload.nodes.length});
const nextPacket={status:'ready',id:'q3',number:3,packetHash:'p3',studyUnitId:'property-rights',studyPlanSha256:studyPlan.sha256,answer:{value:2},contentBlocks:[
 {order:0,type:'question_number',value:'Q3'},{order:1,type:'text',value:'stem3'},{order:2,type:'figure',assetId:'f3'},
 {order:3,type:'choices',value:['1','2','3','4','5']},{order:4,type:'instruction',value:'番号で答えてください。'}]};
flow.prefetchNext(3,{question:{status:'ready',id:'q3',number:3,studyUnitId:'property-rights',studyPlanSha256:studyPlan.sha256},packet:nextPacket,assets:[{assetId:'f3',sha256:'fig3',sourcePage:3}]});
flow.answer(4);
await throws(()=>flow.explain('根拠なし解説'),'LEGAL_EXPLANATION_REQUIRED','法律解説は根拠必須');
const graded=await flow.explain(explanation);
ok(graded.phase==='EXPLAINED'&&graded.explanation.includes('■法的根拠')&&graded.explanation.includes(basis.officialUrl),'根拠付きで解説確定');
const next=flow.commitPrefetchedNext();
ok(next.state.question.id==='q3'&&next.payload.status==='ready','次問へ進行');
console.log('PASS legal basis explanation is mandatory and packet-bound');
