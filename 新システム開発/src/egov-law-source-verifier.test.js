import {createHash} from 'node:crypto';
import {createEgovLawSourceVerifier} from './egov-law-source-verifier.js';
const ok=(v,m)=>{if(!v)throw new Error(m);};
const rejects=async(fn,expected,m)=>{let e;try{await fn();}catch(x){e=x;}ok(e?.message===expected,m+': '+e?.message);};
const lawId='405AC0000000088';
const effectiveDate='2025-04-01';
const officialUrl='https://laws.e-gov.go.jp/law/405AC0000000088?occasion_date=20250401';
const sourceText='行政運営における公正の確保と透明性';
const sourceSha256=createHash('sha256').update(sourceText,'utf8').digest('hex');
const item={lawId,lawName:'行政手続法',provision:'第一条',articleTitle:'目的等',articleElement:'MainProvision-Article_1',effectiveDate,officialUrl,
 sourceText,excerpt:sourceText,sourceSha256};
const context={questionId:'takken:2025:1',packetHash:'packet-hash',sourceSha256};
const apiResponse={law_info:{law_title:'行政手続法'},revision_info:{law_revision_id:'405AC0000000088_20240926_506AC0000000065'},
 law_full_text:{Article:{ArticleTitle:'第一条',ArticleCaption:'目的等',Paragraph:[{ParagraphNum:'1',ParagraphSentence:[{Sentence:'行政運営における公正の確保と透明性'}]}]}}};
const apiUrl='https://laws.e-gov.go.jp/api/2/law_data/405AC0000000088?asof=2025-04-01&elm=MainProvision-Article_1&response_format=json&law_full_text_format=json&json_format=light';
let requested='';
const verifier=createEgovLawSourceVerifier({fetchImpl:async(url,options)=>{
 requested=url;ok(options.redirect==='manual','redirect must be rejected');
 return {status:200,url,headers:{get:()=> 'application/json; charset=utf-8'},text:async()=>JSON.stringify(apiResponse)};
}});
const receipt=await verifier(item,context);
ok(requested===apiUrl,'date and article are pinned in official API request');
ok(receipt.verified&&receipt.questionId===context.questionId&&receipt.packetHash===context.packetHash,'source receipt bound to question packet');
ok(receipt.revisionId==='405AC0000000088_20240926_506AC0000000065','official revision ID pinned');
ok(receipt.sourceSha256===sourceSha256,'source hash pinned');
const redirectVerifier=createEgovLawSourceVerifier({fetchImpl:async url=>({status:200,url:'https://evil.example/law',headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(apiResponse)})});
await rejects(()=>redirectVerifier(item,context),'EGOV_RESPONSE_NOT_CANONICAL','redirect rejected');
const invalidDateVerifier=createEgovLawSourceVerifier({fetchImpl:async()=>{throw new Error('should not fetch');}});
await rejects(()=>invalidDateVerifier({...item,effectiveDate:'2025-02-30'},context),'EGOV_EFFECTIVE_DATE_INVALID','invalid date rejected before fetch');
const wrongArticleVerifier=createEgovLawSourceVerifier({fetchImpl:async url=>({status:200,url,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({...apiResponse,law_full_text:{Article:{ArticleTitle:'第二条',ArticleCaption:'定義'}}})})});
await rejects(()=>wrongArticleVerifier(item,context),'EGOV_PROVISION_NOT_FOUND','article mismatch rejected');
console.log('PASS e-Gov law source verifier: 5 checks');
