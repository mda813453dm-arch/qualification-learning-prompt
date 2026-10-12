import {createHash} from 'node:crypto';

const ORIGIN='https://laws.e-gov.go.jp';
const API_ORIGIN=ORIGIN+'/api/2';
const digest=value=>createHash('sha256').update(value,'utf8').digest('hex');
const normalize=value=>String(value??'').normalize('NFKC').replace(/[ \\t\\r\\n　]+/g,' ').trim();
function validDate(value){
 if(typeof value!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function fail(reason){throw new Error(reason);}
function flattenStrings(value,out=[]){
 if(typeof value==='string')out.push(value);
 else if(Array.isArray(value))for(const child of value)flattenStrings(child,out);
 else if(value&&typeof value==='object')for(const child of Object.values(value))flattenStrings(child,out);
 return out;
}

/**
 * Fetches only the specified article from the official e-Gov Law API v2.
 * The asof date pins the applicable historical text; no caller-controlled host,
 * redirects, or returned revision identifiers are used to construct the request.
 */
export function createEgovLawSourceVerifier({fetchImpl=globalThis.fetch,timeoutMs=15000,maxBytes=8_000_000}={}){
 if(typeof fetchImpl!=='function')throw new Error('EGOV_FETCH_REQUIRED');
 return async function verifyOfficialSource(item,context={}){
  if(!item||typeof item!=='object'||!context.questionId||!context.packetHash)fail('EGOV_CITATION_CONTEXT_REQUIRED');
  if(typeof item.lawId!=='string'||!/^[0-9A-Z]{10,30}$/.test(item.lawId))fail('EGOV_LAW_ID_INVALID');
  if(!validDate(item.effectiveDate))fail('EGOV_EFFECTIVE_DATE_INVALID');
  if(typeof item.lawName!=='string'||!item.lawName.trim()||typeof item.provision!=='string'||!item.provision.trim()||
     typeof item.articleTitle!=='string'||!item.articleTitle.trim())fail('EGOV_CITATION_FIELDS_REQUIRED');
  if(typeof item.articleElement!=='string'||!/^MainProvision-Article_\\d+(?:_\\d+)?$/.test(item.articleElement))fail('EGOV_ARTICLE_ELEMENT_INVALID');
  const ymd=item.effectiveDate.replace(/-/g,'');
  const pageUrl=new URL('/law/'+encodeURIComponent(item.lawId),ORIGIN);
  pageUrl.searchParams.set('occasion_date',ymd);
  if(item.officialUrl!==pageUrl.toString())fail('EGOV_OFFICIAL_URL_MISMATCH');
  const apiUrl=new URL('/api/2/law_data/'+encodeURIComponent(item.lawId),ORIGIN);
  apiUrl.searchParams.set('asof',item.effectiveDate);
  apiUrl.searchParams.set('elm',item.articleElement);
  apiUrl.searchParams.set('response_format','json');
  apiUrl.searchParams.set('law_full_text_format','json');
  apiUrl.searchParams.set('json_format','light');
  const expectedApiUrl=apiUrl.toString();
  let response;
  try{
   response=await fetchImpl(expectedApiUrl,{redirect:'manual',headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  }catch{fail('EGOV_FETCH_FAILED');}
  if(!response||response.status!==200||response.url!==expectedApiUrl)fail('EGOV_RESPONSE_NOT_CANONICAL');
  if(!/application\\/json/i.test(response.headers?.get?.('content-type')||''))fail('EGOV_CONTENT_TYPE_INVALID');
  let raw;
  try{raw=await response.text();}catch{fail('EGOV_BODY_READ_FAILED');}
  if(typeof raw!=='string'||raw.length===0||Buffer.byteLength(raw,'utf8')>maxBytes)fail('EGOV_BODY_SIZE_INVALID');
  let data;
  try{data=JSON.parse(raw);}catch{fail('EGOV_JSON_INVALID');}
  const strings=flattenStrings(data);
  const text=normalize(strings.join(' '));
  if(!text.includes(normalize(item.lawName)))fail('EGOV_LAW_NAME_NOT_FOUND');
  if(!text.includes(normalize(item.provision)))fail('EGOV_PROVISION_NOT_FOUND');
  const revisionId=data?.revision_info?.law_revision_id;
  if(typeof revisionId!=='string')fail('EGOV_REVISION_ID_MISSING');
  if(!revisionId.startsWith(item.lawId+'_'))fail('EGOV_REVISION_LAW_MISMATCH');
  const revisionDate=revisionId.slice(item.lawId.length+1,item.lawId.length+9);
  if(!/^\\d{8}$/.test(revisionDate)||revisionDate>ymd)fail('EGOV_REVISION_DATE_INVALID');
  if(item.revisionId&&item.revisionId!==revisionId)fail('EGOV_REVISION_ID_MISMATCH');
  const sourceText=normalize(item.sourceText),excerpt=normalize(item.excerpt);
  if(!sourceText||!excerpt||!sourceText.includes(excerpt))fail('EGOV_EXCERPT_INVALID');
  if(!text.includes(normalize(item.articleTitle)))fail('EGOV_ARTICLE_TITLE_NOT_IN_OFFICIAL_ARTICLE');
  if(!text.includes(sourceText))fail('EGOV_CITATION_TEXT_NOT_IN_OFFICIAL_ARTICLE');
  const sourceSha256=digest(item.sourceText);
  if(item.sourceSha256!==sourceSha256||context.sourceSha256!==sourceSha256)fail('EGOV_SOURCE_HASH_MISMATCH');
  return Object.freeze({verified:true,questionId:context.questionId,packetHash:context.packetHash,
   officialUrl:pageUrl.toString(),effectiveDate:item.effectiveDate,revisionId,sourceSha256});
 };
}
