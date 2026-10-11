import {createHash} from 'node:crypto';
import {OFFICIAL_PDF_PINS} from './official-pdf-pins.js';
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
/**
 * Validates a Python-generated JSON handoff against pinned PDF hashes.
 * This does not replace PDF byte verification, source provenance or visual checks.
 */
export function validatePythonPdfHandoff(data) {
 const fail=reason=>({ok:false,reason});
 if(!data||data.schema!=='surveyor_2025_afternoon_v1'||data.registryKey!=='土地家屋調査士:2025:午後')return fail('HANDOFF_SCHEMA_INVALID');
 const pin=OFFICIAL_PDF_PINS[data.registryKey];
 if(!pin||data.questionPdfSha256!==pin.questionSha256||data.answerPdfSha256!==pin.answerSha256)return fail('PDF_PIN_MISMATCH');
 if(!Array.isArray(data.questions)||data.questions.length!==20)return fail('QUESTION_COUNT_INVALID');
 const normalized=[];
 for(let i=0;i<20;i++){
  const q=data.questions[i];
  if(!q||q.number!==i+1||!Number.isInteger(q.page)||q.page<1)return fail('QUESTION_ORDER_INVALID');
  if(typeof q.rawSpan!=='string'||!q.rawSpan.trim()||q.spanSha256!==hash(q.rawSpan))return fail('SPAN_HASH_INVALID');
  if(!Array.isArray(q.choices)||q.choices.length!==5||q.choices.some(x=>typeof x!=='string'||!x.trim()))return fail('CHOICES_INVALID');
  if(!Number.isInteger(q.answerNumber)||q.answerNumber<1||q.answerNumber>5)return fail('ANSWER_INVALID');
  normalized.push(Object.freeze({number:q.number,page:q.page,rawSpan:q.rawSpan,choices:Object.freeze([...q.choices]),answerNumber:q.answerNumber}));
 }
 return {ok:true,questions:Object.freeze(normalized),visualCompletenessVerified:false};
}
