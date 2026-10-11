import {createHash} from 'node:crypto';
import {OFFICIAL_PDF_PINS} from './official-pdf-pins.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
/**
 * Server-owned PDF byte binding. A caller-supplied text hash is never authority.
 * extractText must be an internal deterministic PDF parser.
 */
export function createPdfByteEvidenceGate({extractText,pins=OFFICIAL_PDF_PINS}={}) {
 if(typeof extractText!=='function')throw new Error('TRUSTED_PDF_PARSER_REQUIRED');
 return async function verify({registryKey,questionPdfBytes,answerPdfBytes,rawSpan,answerEvidence}={}) {
  const fail=reason=>({ok:false,reason});
  const pin=pins[registryKey];
  if(!pin)return fail('UNKNOWN_OFFICIAL_PDF_PAIR');
  if(!Buffer.isBuffer(questionPdfBytes)||!Buffer.isBuffer(answerPdfBytes))return fail('PDF_BYTES_REQUIRED');
  if(questionPdfBytes.subarray(0,5).toString()!=='%PDF-'||answerPdfBytes.subarray(0,5).toString()!=='%PDF-')return fail('INVALID_PDF_BYTES');
  if(hash(questionPdfBytes)!==pin.questionSha256||hash(answerPdfBytes)!==pin.answerSha256)return fail('PINNED_PDF_HASH_MISMATCH');
  let qText,aText;
  try {
   qText=await extractText(questionPdfBytes,'question');
   aText=await extractText(answerPdfBytes,'answer');
  }catch{return fail('PDF_TEXT_EXTRACTION_FAILED');}
  if(typeof qText!=='string'||typeof aText!=='string'||typeof rawSpan!=='string'||typeof answerEvidence!=='string')return fail('EXTRACTION_EVIDENCE_REQUIRED');
  if(!rawSpan.trim()||!qText.includes(rawSpan))return fail('SPAN_NOT_IN_PINNED_PDF');
  if(!answerEvidence.trim()||!aText.includes(answerEvidence))return fail('ANSWER_NOT_IN_PINNED_PDF');
  return {ok:true,questionPdfSha256:pin.questionSha256,answerPdfSha256:pin.answerSha256,source:'PINNED_PDF_BYTES',visualCompletenessVerified:false};
 };
}
