import {createHash} from 'node:crypto';
import {isLegalQualification} from './legal-basis-explanation.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
const fail=reason=>({ok:false,reason});
export function validateQuestionBundle(b,m){
 if(!b||!m||b.schema!=='official-question-bundle-v1')return fail('SCHEMA_INVALID');
 if(b.key!==m.key||!/^.+:\\d{4}:.+:\\d+$/.test(b.key??''))return fail('QUESTION_ID_MISMATCH');
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
 const expected=['body',...b.assets.map(a=>a.id),'choices','answer-control'];
 if(!Array.isArray(b.layout)||b.layout.join('|')!==expected.join('|'))return fail('LAYOUT_MISMATCH');
 if(m.reviewStatus!=='approved'||m.allVisualsAccountedFor!==true||m.answerCellChecked!==true||m.textChecked!==true||m.displayChecked!==true)return fail('REVIEW_INCOMPLETE');
 const qualification=String(b.qualification||b.key.split(':')[0]).trim();
 const subjectArea=b.subjectArea||'general';
 const bp=b.explanationPolicy??null, mp=m.explanationPolicy??null;
 const legal=isLegalQualification(qualification)||subjectArea==='law'||bp==='legal_basis_required'||mp==='legal_basis_required';
 if(legal){
  if(subjectArea!=='law'||bp!=='legal_basis_required'||mp!=='legal_basis_required')return fail('LEGAL_BASIS_POLICY_UNBOUND');
 }else if(bp!==mp||(bp!==null&&bp!=='general')||(mp!==null&&mp!=='general'))return fail('EXPLANATION_POLICY_MISMATCH');
 return {ok:true,key:b.key,qualification,subjectArea,explanationPolicy:legal?'legal_basis_required':(bp||'general'),layout:[...expected],assets:b.assets.map(a=>({...a})),body:b.body,choices:[...b.choices]};
}
