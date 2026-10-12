import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value,'utf8').digest('hex');
const LEGAL_QUALIFICATIONS=new Set(['宅建','宅建士','宅地建物取引士','takken','real-estate-transaction-agent','司法書士','行政書士','社会保険労務士','弁護士','司法試験','shihoshoshi','gyoseishoshi']);
export function isLegalQualification(value){
 const normalized=String(value??'').trim().toLowerCase();
 return LEGAL_QUALIFICATIONS.has(normalized);
}
function officialUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='go.jp'||u.hostname.endsWith('.go.jp'));}catch{return false;}}
export function resolveExplanationPolicy(qualificationId,question,packet){
 const id=String(qualificationId??question?.qualification??'').trim().toLowerCase();
 const name=String(question?.qualification??qualificationId??'').trim();
 const legalExam=isLegalQualification(id)||isLegalQualification(name);
 const legalTopic=question?.subjectArea==='law'||packet?.subjectArea==='law';
 const requested=question?.explanationPolicy==='legal_basis_required'||packet?.explanationPolicy==='legal_basis_required';
 const isLaw=legalExam||legalTopic||requested;
 const qp=question?.explanationPolicy??null, pp=packet?.explanationPolicy??null;
 if(isLaw){if(qp!=='legal_basis_required'||pp!=='legal_basis_required')throw new Error('LEGAL_BASIS_POLICY_UNBOUND');return 'legal_basis_required';}
 if(qp!==pp)throw new Error('EXPLANATION_POLICY_MISMATCH');
 if(qp!==null&&qp!=='general')throw new Error('EXPLANATION_POLICY_INVALID');
 return 'general';
}
export function compileLegalBasisExplanation(explanation,{questionId,packetHash}){
 const fail=reason=>Object.freeze({ok:false,reason});
 if(!explanation||typeof explanation!=='object'||Array.isArray(explanation))return fail('LEGAL_EXPLANATION_REQUIRED');
 if(explanation.questionId!==questionId||explanation.packetHash!==packetHash)return fail('LEGAL_EXPLANATION_BINDING_MISMATCH');
 if(typeof explanation.text!=='string'||!explanation.text.trim())return fail('EXPLANATION_TEXT_MISSING');
 if(!Array.isArray(explanation.legalBasis)||explanation.legalBasis.length===0)return fail('LEGAL_BASIS_MISSING');
 const citations=[];
 for(const item of explanation.legalBasis){
  if(!item||typeof item.lawName!=='string'||!item.lawName.trim()||typeof item.provision!=='string'||!item.provision.trim()||typeof item.effectiveDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.effectiveDate))return fail('LEGAL_CITATION_INCOMPLETE');
  if(!officialUrl(item.officialUrl))return fail('LEGAL_SOURCE_NOT_OFFICIAL');
  if(typeof item.sourceText!=='string'||!item.sourceText.trim()||typeof item.excerpt!=='string'||!item.excerpt.trim()||!item.sourceText.includes(item.excerpt))return fail('LEGAL_EXCERPT_NOT_VERIFIED');
  const sourceSha256=digest(item.sourceText);
  if(item.sourceSha256!==sourceSha256)return fail('LEGAL_SOURCE_HASH_MISMATCH');
  citations.push(Object.freeze({lawName:item.lawName.trim(),provision:item.provision.trim(),effectiveDate:item.effectiveDate,officialUrl:item.officialUrl,excerpt:item.excerpt.trim(),sourceSha256}));
 }
 const basis=citations.map(c=>'・'+c.lawName+' '+c.provision+'\n  '+c.excerpt+'\n  '+c.officialUrl).join('\n');
 return Object.freeze({ok:true,displayText:explanation.text.trim()+'\n\n■法的根拠\n'+basis,legalBasis:Object.freeze(citations)});
}
