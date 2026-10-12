import {createHash} from 'node:crypto';
import {isLegalQualification} from './legal-basis-explanation.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=reason=>({ok:false,reason});
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
export function validateQuestionBundle(b,m){
 if(!b||!m||b.schema!=='official-question-bundle-v1')return fail('SCHEMA_INVALID');
 if(b.key!==m.key||!/^.+:\d{4}:.+:\d+$/.test(b.key??''))return fail('QUESTION_ID_MISMATCH');
 if(typeof b.studyUnitId!=='string'||!b.studyUnitId||b.studyUnitId!==m.studyUnitId)return fail('STUDY_UNIT_MISMATCH');
 if(!/^[a-f0-9]{64}$/.test(b.studyPlanSha256||'')||b.studyPlanSha256!==m.studyPlanSha256)return fail('STUDY_PLAN_BINDING_MISMATCH');
 if(b.source?.questionPdfSha256!==m.questionPdfSha256||b.source?.answerPdfSha256!==m.answerPdfSha256)return fail('SOURCE_MISMATCH');
 if(!Array.isArray(b.source.pages)||b.source.pages.join(',')!==m.pages?.join(','))return fail('PAGE_BOUNDARY_MISMATCH');
 if(typeof b.body!=='string'||sha(b.body)!==m.bodySha256)return fail('BODY_MISMATCH');
 if(!Array.isArray(b.choices)||b.choices.length!==m.choiceSha256?.length||b.choices.some((x,i)=>sha(x)!==m.choiceSha256[i]))return fail('CHOICE_MISMATCH');
 if(b.answer?.number!==m.answerNumber||b.answer?.evidenceSha256!==m.answerEvidenceSha256)return fail('ANSWER_MISMATCH');
 if(!Array.isArray(b.assets)||b.assets.length!==m.assets?.length)return fail('ASSET_COUNT_MISMATCH');
 const seen=new Set();
 for(let i=0;i<b.assets.length;i++){
  const a=b.assets[i],t=m.assets[i];
  if(!a||!t||seen.has(a.id)||a.id!==t.id||a.kind!==t.kind||!['figure','table','formula','other'].includes(a.kind))return fail('ASSET_ID_OR_KIND_MISMATCH');
  seen.add(a.id);
  if(a.page!==t.page||!b.source.pages.includes(a.page)||a.sha256!==t.sha256||! /^[a-f0-9]{64}$/.test(a.sha256??''))return fail('ASSET_SOURCE_MISMATCH');
  if(!a.crop||!['x0','y0','x1','y1'].every(k=>Number.isFinite(a.crop[k])&&a.crop[k]===t.crop?.[k])||a.crop.x0>=a.crop.x1||a.crop.y0>=a.crop.y1)return fail('ASSET_CROP_MISMATCH');
 }
 let contentBlocks,expectedLayout;
 if(b.contentBlocks!==undefined){
  if(!Array.isArray(b.contentBlocks)||!Array.isArray(m.contentBlockSha256)||b.contentBlocks.length!==m.contentBlockSha256.length)
   return fail('CONTENT_BLOCK_EVIDENCE_REQUIRED');
  const byId=new Map(b.assets.map(a=>[a.id,a])),used=new Set(),hashes=[],tokens=[],texts=[];
  contentBlocks=[];
  for(const block of b.contentBlocks){
   if(block?.type==='text'&&typeof block.value==='string'&&block.value.trim()){
    hashes.push(sha(block.value));tokens.push('text:'+texts.length);texts.push(block.value);
    contentBlocks.push({type:'text',value:block.value});
   }else if(['figure','table','formula','other'].includes(block?.type)&&typeof block.assetId==='string'){
    const asset=byId.get(block.assetId);
    if(!asset||used.has(block.assetId)||asset.kind!==block.type)return fail('CONTENT_BLOCK_ASSET_INVALID');
    used.add(block.assetId);hashes.push(sha(block.type+':'+block.assetId));tokens.push(block.type+':'+block.assetId);
    contentBlocks.push({type:block.type,assetId:block.assetId});
   }else return fail('CONTENT_BLOCK_INVALID');
  }
  if(used.size!==b.assets.length||texts.join('')!==b.body)return fail('CONTENT_BLOCK_SEQUENCE_INCOMPLETE');
  if(!same(hashes,m.contentBlockSha256))return fail('CONTENT_BLOCK_HASH_MISMATCH');
  expectedLayout=[...tokens,'choices','answer-control'];
  if(!same(b.layout,expectedLayout))return fail('LAYOUT_MISMATCH');
 }else{
  expectedLayout=['body',...b.assets.map(a=>a.id),'choices','answer-control'];
  if(!same(b.layout,expectedLayout))return fail('LAYOUT_MISMATCH');
  contentBlocks=[{type:'text',value:b.body},...b.assets.map(a=>({type:a.kind==='table'?'table':a.kind==='formula'?'formula':'figure',assetId:a.id}))];
 }
 if(m.reviewStatus!=='approved'||m.allVisualsAccountedFor!==true||m.answerCellChecked!==true||m.textChecked!==true||m.displayChecked!==true)return fail('REVIEW_INCOMPLETE');
 const qualification=String(b.qualification||b.key.split(':')[0]).trim();
 const subjectArea=b.subjectArea||'general';
 const bp=b.explanationPolicy??null,mp=m.explanationPolicy??null;
 const legal=isLegalQualification(qualification)||subjectArea==='law'||bp==='legal_basis_required'||mp==='legal_basis_required';
 if(legal){
  if(subjectArea!=='law'||bp!=='legal_basis_required'||mp!=='legal_basis_required')return fail('LEGAL_BASIS_POLICY_UNBOUND');
 }else if(bp!==mp||(bp!==null&&bp!=='general')||(mp!==null&&mp!=='general'))return fail('EXPLANATION_POLICY_MISMATCH');
 return {ok:true,key:b.key,qualification,subjectArea,studyUnitId:b.studyUnitId,studyPlanSha256:b.studyPlanSha256,explanationPolicy:legal?'legal_basis_required':(bp||'general'),layout:[...b.layout],contentBlocks,assets:b.assets.map(a=>({...a})),body:b.body,choices:[...b.choices]};
}
