import {createHash} from 'node:crypto';

const ORIGIN='https://laws.e-gov.go.jp';
const digest=value=>createHash('sha256').update(value,'utf8').digest('hex');
const normalize=value=>String(value??'').normalize('NFKC').replace(/[ \t\r\n　]+/g,' ').trim();
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function htmlText(html){
 return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/[ \t\r\n　]+/g,' ').trim();
}
function fail(reason){throw new Error(reason);}

/**
 * Server-side verifier for a citation bound to the official e-Gov law page.
 * The requested URL is constructed here; caller supplied hosts, redirects and
 * revision IDs are never fetched. occasion_date pins the official historical view.
 */
export function createEgovLawSourceVerifier({fetchImpl=globalThis.fetch,timeoutMs=15000,maxBytes=8_000_000}={}){
 if(typeof fetchImpl!=='function')throw new Error('EGOV_FETCH_REQUIRED');
 return async function verifyOfficialSource(item,context={}){
  if(!item||typeof item!=='object'||!context.questionId||!context.packetHash)fail('EGOV_CITATION_CONTEXT_REQUIRED');
  if(typeof item.lawId!=='string'||!/^[0-9A-Z]{10,30}$/.test(item.lawId))fail('EGOV_LAW_ID_INVALID');
  if(!validDate(item.effectiveDate))fail('EGOV_EFFECTIVE_DATE_INVALID');
  if(typeof item.lawName!=='string'||!item.lawName.trim()||typeof item.provision!=='string'||!item.provision.trim()||
     typeof item.articleTitle!=='string'||!item.articleTitle.trim())fail('EGOV_CITATION_FIELDS_REQUIRED');
  const ymd=item.effectiveDate.replace(/-/g,'');
  const url=new URL('/law/'+encodeURIComponent(item.lawId),ORIGIN);
  url.searchParams.set('occasion_date',ymd);
  const expectedUrl=url.toString();
  if(item.officialUrl!==expectedUrl)fail('EGOV_OFFICIAL_URL_MISMATCH');
  let response;
  try{
   response=await fetchImpl(expectedUrl,{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(timeoutMs)});
  }catch{fail('EGOV_FETCH_FAILED');}
  if(!response||response.status!==200||response.url!==expectedUrl)fail('EGOV_RESPONSE_NOT_CANONICAL');
  if(!/text\/html/i.test(response.headers?.get?.('content-type')||''))fail('EGOV_CONTENT_TYPE_INVALID');
  let html;
  try{html=await response.text();}catch{fail('EGOV_BODY_READ_FAILED');}
  if(typeof html!=='string'||html.length===0||html.length>maxBytes)fail('EGOV_BODY_SIZE_INVALID');
  const text=normalize(htmlText(html));
  if(!text.includes(normalize(item.lawName)))fail('EGOV_LAW_NAME_NOT_FOUND');
  if(!text.includes(normalize(item.provision)))fail('EGOV_PROVISION_NOT_FOUND');
  const revisionMatch=text.match(/Law RevisionID\s*[:：]\s*([0-9A-Z_]+)/i);
  if(!revisionMatch)fail('EGOV_REVISION_ID_MISSING');
  const revisionId=revisionMatch[1];
  if(!revisionId.startsWith(item.lawId+'_'))fail('EGOV_REVISION_LAW_MISMATCH');
  const revisionDate=revisionId.slice(item.lawId.length+1,item.lawId.length+9);
  if(!/^\d{8}$/.test(revisionDate)||revisionDate>ymd)fail('EGOV_REVISION_DATE_INVALID');
  if(item.revisionId&&item.revisionId!==revisionId)fail('EGOV_REVISION_ID_MISMATCH');
  const sourceText=normalize(item.sourceText),excerpt=normalize(item.excerpt),articleTitle=normalize(item.articleTitle);
  if(!sourceText||!excerpt||!sourceText.includes(excerpt))fail('EGOV_EXCERPT_INVALID');
  const sourceIndex=text.lastIndexOf(sourceText);
  const titleIndex=sourceIndex<0?-1:text.lastIndexOf(articleTitle,sourceIndex);
  if(sourceIndex<0||titleIndex<0)fail('EGOV_CITATION_TEXT_NOT_IN_OFFICIAL_ARTICLE');
  const sourceSha256=digest(item.sourceText);
  if(item.sourceSha256!==sourceSha256||context.sourceSha256!==sourceSha256)fail('EGOV_SOURCE_HASH_MISMATCH');
  return Object.freeze({verified:true,questionId:context.questionId,packetHash:context.packetHash,
   officialUrl:expectedUrl,effectiveDate:item.effectiveDate,revisionId,sourceSha256});
 };
}
