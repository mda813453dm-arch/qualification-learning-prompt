import {extractPdfPageText} from "./pdfjs-page-text-extractor.js";
import {segmentQuestionCandidates,assessSegmentationCandidate} from "./generic-pdf-question-segmenter.js";
export async function extractQuestionCandidatesFromPdf(bytes,{expectedChoiceCount=null,questionPatterns,choicePattern}={}){
 const extracted=await extractPdfPageText(bytes);if(extracted.status!=="ready")return extracted;
 const candidates=segmentQuestionCandidates(extracted.pages,{questionPatterns,choicePattern});
 return Object.freeze({status:"ready",pageCount:extracted.pageCount,candidates:Object.freeze(candidates.map(candidate=>Object.freeze({
  candidate,assessment:assessSegmentationCandidate(candidate,{expectedChoiceCount}),
  promotionBlocked: candidate.diagramReferenceCandidate===true ? "DIAGRAM_ASSET_VERIFICATION_REQUIRED" : null
 })))});
}
