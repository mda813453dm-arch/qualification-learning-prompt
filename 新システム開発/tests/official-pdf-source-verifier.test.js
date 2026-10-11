import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOfficialPdfSourceVerifier} from '../src/official-pdf-source-verifier.js';
const q=Buffer.from('%PDF-1.7\nquestion'),a=Buffer.from('%PDF-1.7\nanswer');
const sha=b=>createHash('sha256').update(b).digest('hex');
const proof={sourceType:'official_pdf_pair',questionPdfUrl:'https://www.moj.go.jp/q.pdf',answerPdfUrl:'https://www.moj.go.jp/a.pdf',questionSha256:sha(q),answerSha256:sha(a)};
const mock=(responseFn)=>async(url)=>responseFn(url);
const response=b=>({ok:true,status:200,redirected:false,headers:{get:()=>String(b.length)},arrayBuffer:async()=>b});
test('許可された公式ドメインの2 PDFを取得しハッシュ照合',async()=>{
 let calls=0;const verifier=createOfficialPdfSourceVerifier({fetchImpl:mock(url=>{calls++;return response(url.endsWith('/q.pdf')?q:a);})});
 assert.equal(await verifier(proof),true);assert.equal(calls,2);
});
test('自己申告のハッシュが異なると拒否',async()=>{
 const verifier=createOfficialPdfSourceVerifier({fetchImpl:mock(url=>response(url.endsWith('/q.pdf')?q:a))});
 assert.equal(await verifier({...proof,answerSha256:'0'.repeat(64)}),false);
});
test('外部ドメイン・偽装サブドメインを拒否',async()=>{
 const verifier=createOfficialPdfSourceVerifier({fetchImpl:async()=>{throw Error('must not fetch');}});
 assert.equal(await verifier({...proof,questionPdfUrl:'https://www.moj.go.jp.evil.example/q.pdf'}),false);
});
test('リダイレクト・非PDF・過大ファイルを拒否',async()=>{
 const verifier=createOfficialPdfSourceVerifier({fetchImpl:mock(()=>({...response(q),redirected:true}))});
 assert.equal(await verifier(proof),false);
 const invalid=createOfficialPdfSourceVerifier({fetchImpl:mock(()=>response(Buffer.from('notpdf')))});
 assert.equal(await invalid(proof),false);
 const oversized=createOfficialPdfSourceVerifier({maxBytes:6,fetchImpl:mock(()=>response(q))});
 assert.equal(await oversized(proof),false);
});
test('取得失敗時は拒否',async()=>{
 const verifier=createOfficialPdfSourceVerifier({fetchImpl:async()=>{throw Error('network');}});
 assert.equal(await verifier(proof),false);
});

test('ストリームで上限を超えた場合は途中で拒否',async()=>{
 let chunks=0;
 const verifier=createOfficialPdfSourceVerifier({maxBytes:10,fetchImpl:async()=>({ok:true,status:200,redirected:false,headers:{get:()=>null},body:{getReader:()=>({read:async()=>{chunks++;return {done:false,value:Buffer.alloc(6)}},releaseLock:()=>{}})}})});
 assert.equal(await verifier(proof),false);
 assert.equal(chunks,2);
});
