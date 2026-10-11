import {createGuardedPracticeController} from './guarded-practice-controller.js';
import {createOfficialPdfSourceVerifier} from './official-pdf-source-verifier.js';
import {createPinnedOfficialVerifier} from './official-pdf-pins.js';
import {verifyQuestionSpan} from './verified-span-gate.js';

/** Public entry. Internal extractor must provide evidence derived from the pinned PDFs. */
export function createOfficialPracticeEntry({retrieveAndVerify,adapters}) {
 if(typeof retrieveAndVerify!=='function')throw new Error('INTERNAL_RETRIEVER_REQUIRED');
 const verifyOfficialSource=createPinnedOfficialVerifier({
  verifyOfficialSource:createOfficialPdfSourceVerifier()
 });
 const checkedRetrieve=async(candidate,adapterList)=>{
  const result=await retrieveAndVerify(candidate,adapterList);
  if(!result||result.status!=='verified')return result;
  const span=result.spanEvidence;
  if(!span||!result.question||!result.answer)return {status:'unavailable',reason:'ORIGINAL_TEXT_EVIDENCE_REQUIRED'};
  const checked=verifyQuestionSpan({
   rawSpan:span.rawSpan,
   expectedSpanSha256:span.expectedSpanSha256,
   questionText:result.question.text,
   choices:result.question.choices?.map(x=>x?.text),
   correctChoice:result.answer.number,
   expectedAnswer:span.expectedAnswer
  });
  if(!checked.ok)return {status:'unavailable',reason:checked.reason};
  return result;
 };
 return createGuardedPracticeController({retrieveAndVerify:checkedRetrieve,adapters,verifyOfficialSource});
}
