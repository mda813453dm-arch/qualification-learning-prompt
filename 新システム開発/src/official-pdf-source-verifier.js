import {createHash} from 'node:crypto';
const HOSTS=new Set(['www.moj.go.jp','www.retio.or.jp','www.customs.go.jp','www.gsi.go.jp']);
function officialUrl(raw){
 if(typeof raw!=='string')return null;
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname)||u.hash)return null;
  return u;
 }catch{return null;}
}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
/** Fetch actual PDFs from allowlisted government / exam body hosts. Reject redirects, errors and mismatches. */
export function createOfficialPdfSourceVerifier({fetchImpl=globalThis.fetch,maxBytes=25_000_000}={}){
 if(typeof fetchImpl!=='function')throw new Error('FETCH_REQUIRED');
 return async function verifyOfficialSource(evidence){
  if(!evidence||evidence.sourceType!=='official_pdf_pair')return false;
  const q=officialUrl(evidence.questionPdfUrl),a=officialUrl(evidence.answerPdfUrl);
  if(!q||!a||q.href===a.href)return false;
  if(!/^[a-f0-9]{64}$/.test(evidence.questionSha256)||!/^[a-f0-9]{64}$/.test(evidence.answerSha256))return false;
  for(const [url,expected] of [[q,evidence.questionSha256],[a,evidence.answerSha256]]){
   let response;
   try{response=await fetchImpl(url.href,{redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return false;}
   if(!response||response.ok!==true||response.status!==200||response.redirected===true)return false;
   const length=Number(response.headers?.get?.('content-length'));
   if(Number.isFinite(length)&&length>maxBytes)return false;
   let bytes;
   try{bytes=Buffer.from(await response.arrayBuffer());}catch{return false;}
   if(bytes.length<5||bytes.length>maxBytes||bytes.subarray(0,5).toString()!=='%PDF-')return false;
   if(sha256(bytes)!==expected)return false;
  }
  return true;
 };
}
