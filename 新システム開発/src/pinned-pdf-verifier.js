import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const SURVEYOR_2025_UPLOADED_PDF_PINS=Object.freeze({
 question:'928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c',
 answer:'3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad'
});
export function verifyPinnedPdfBytes(questionBytes,answerBytes,pins=SURVEYOR_2025_UPLOADED_PDF_PINS){
 for(const [kind,bytes] of [['question',questionBytes],['answer',answerBytes]]){
  if(!Buffer.isBuffer(bytes)||bytes.length<5||bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('NOT_PDF:'+kind);
  const actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==pins[kind])throw new Error('PDF_HASH_MISMATCH:'+kind);
 }
 return Object.freeze({sourceType:'uploaded_pinned_pdf',questionSha256:pins.question,answerSha256:pins.answer,officialProvenanceVerified:false,visualCompletenessVerified:false});
}
export function verifyPinnedPdfPaths(questionPath,answerPath,pins){
 return verifyPinnedPdfBytes(readFileSync(questionPath),readFileSync(answerPath),pins);
}
