import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPinnedPdfBytes,verifyPinnedPdfPaths,SURVEYOR_2025_UPLOADED_PDF_PINS} from '../src/pinned-pdf-verifier.js';
const q=Buffer.from('%PDF-1.4\nquestion'),a=Buffer.from('%PDF-1.4\nanswer');
const sha=b=>createHash('sha256').update(b).digest('hex');
const pins={question:sha(q),answer:sha(a)};
test('固定済みPDFバイトだけを受け入れ公式性は未検証と明記',()=>{
 const result=verifyPinnedPdfBytes(q,a,pins);
 assert.equal(result.sourceType,'uploaded_pinned_pdf');
 assert.equal(result.officialProvenanceVerified,false);
 assert.equal(result.visualCompletenessVerified,false);
});
test('問題PDFの1バイト変更を拒否',()=>assert.throws(()=>verifyPinnedPdfBytes(Buffer.concat([q,Buffer.from('x')]),a,pins),/PDF_HASH_MISMATCH:question/));
test('正答PDFの1バイト変更を拒否',()=>assert.throws(()=>verifyPinnedPdfBytes(q,Buffer.concat([a,Buffer.from('x')]),pins),/PDF_HASH_MISMATCH:answer/));
test('PDFではないデータを拒否',()=>assert.throws(()=>verifyPinnedPdfBytes(Buffer.from('plain text'),a,pins),/NOT_PDF:question/));
test('実アップロードPDFを指定できる場合のみ固定ハッシュを検証',t=>{
 const qp=process.env.SURVEYOR_QUESTION_PDF,ap=process.env.SURVEYOR_ANSWER_PDF;
 if(!qp||!ap){t.skip('アップロードPDFはGitHubに公開しない');return;}
 const r=verifyPinnedPdfPaths(qp,ap,SURVEYOR_2025_UPLOADED_PDF_PINS);
 assert.equal(r.officialProvenanceVerified,false);
});
