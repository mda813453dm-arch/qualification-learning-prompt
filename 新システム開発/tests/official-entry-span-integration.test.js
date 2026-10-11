import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOfficialPracticeEntry} from '../src/official-practice-entry.js';
const rawSpan='第2問 正しい組合せを選べ。\n1 アウ 2 アオ 3 イウ 4 イエ 5 エオ\n';
const hash=s=>createHash('sha256').update(s).digest('hex');
const q='https://www.moj.go.jp/content/001450011.pdf',a='https://www.moj.go.jp/content/001450015.pdf';
const base={status:'verified',key:{qualification:'土地家屋調査士'},provenance:{sourceType:'official_pdf_pair',registryKey:'土地家屋調査士:2025:午後',questionPdfUrl:q,answerPdfUrl:a,questionSha256:'0'.repeat(64),answerSha256:'0'.repeat(64)},question:{id:2,year:2025,section:'午後',text:'第2問 正しい組合せを選べ。',choices:['アウ','アオ','イウ','イエ','エオ'].map(text=>({text})),source:{official:true,url:q}},answer:{questionId:2,year:2025,section:'午後',number:5,page:1,evidence:'問2=5',source:{official:true,url:a}},spanEvidence:{rawSpan,expectedSpanSha256:hash(rawSpan),expectedAnswer:5}};
const make=fn=>createOfficialPracticeEntry({retrieveAndVerify:fn,adapters:[]});
test('原文証拠が欠落したら出題・採点を拒否',async()=>{
 const c=make(async()=>({...structuredClone(base),spanEvidence:null}));
 assert.equal((await c.request('s',{})).reason,'ORIGINAL_TEXT_EVIDENCE_REQUIRED');
 assert.throws(()=>c.submit('s',5),/NO_VERIFIED_ACTIVE_QUESTION/);
});
test('選択肢の順序を入れ替えたら拒否',async()=>{
 const c=make(async()=>({...structuredClone(base),question:{...base.question,choices:[...base.question.choices].reverse()}}));
 assert.equal((await c.request('s',{})).reason,'CHOICES_NOT_MATCHED');
});
test('正答をすり替えたら拒否',async()=>{
 const c=make(async()=>({...structuredClone(base),answer:{...base.answer,number:2}}));
 assert.equal((await c.request('s',{})).reason,'ANSWER_MISMATCH');
});
test('図表を含む問題は視覚確認なしで出題しない',async()=>{
 const span=rawSpan+'図1参照';
 const c=make(async()=>({...structuredClone(base),spanEvidence:{...base.spanEvidence,rawSpan:span,expectedSpanSha256:hash(span)}}));
 assert.equal((await c.request('s',{})).reason,'VISUAL_EVIDENCE_REQUIRED');
});
test('原文一致後も固定PDFハッシュが異なれば出題しない',async()=>{
 const c=make(async()=>structuredClone(base));
 assert.equal((await c.request('s',{})).status,'unavailable');
 assert.throws(()=>c.submit('s',5),/NO_VERIFIED_ACTIVE_QUESTION/);
});
