/** GSI 2026 survey-assistant visual regression cases, reviewed via official PDF page images.
 * Evidence of page rendering is not evidence of live PDF-byte retrieval or mobile display.
 */
export const SURVEY_ASSISTANT_VISUAL_CASES=Object.freeze([
 Object.freeze({qualification:'測量士補',year:2026,questionNumber:7,pdfPage:9,figure:'図7',table:'表7',answerNumber:4,questionPdfUrl:'https://www.gsi.go.jp/common/000278974.pdf',answerPdfUrl:'https://www.gsi.go.jp/common/000278975.pdf',pageImageReviewed:true,questionTextVerified:false,pdfBytesVerified:false,mobileRenderingVerified:false,publishable:false}),
 Object.freeze({qualification:'測量士補',year:2026,questionNumber:27,pdfPage:29,figure:'図27',table:'表27',answerNumber:1,questionPdfUrl:'https://www.gsi.go.jp/common/000278974.pdf',answerPdfUrl:'https://www.gsi.go.jp/common/000278975.pdf',pageImageReviewed:true,questionTextVerified:false,pdfBytesVerified:false,mobileRenderingVerified:false,publishable:false})
]);
export function evaluateVisualCase(caseRecord,{questionPdfSha256,figureRendered,tableRendered,choicesRendered,answerBound}={}){
 if(!SURVEY_ASSISTANT_VISUAL_CASES.includes(caseRecord))return {status:'unavailable',reason:'UNRECOGNIZED_TEST_CASE'};
 if(!/^[0-9a-f]{64}$/.test(questionPdfSha256||''))return {status:'unavailable',reason:'PDF_BYTES_NOT_VERIFIED'};
 if(figureRendered!==true||tableRendered!==true||choicesRendered!==true)return {status:'unavailable',reason:'VISUAL_CONTENT_NOT_VERIFIED'};
 if(answerBound!==true)return {status:'unavailable',reason:'ANSWER_BINDING_NOT_VERIFIED'};
 return {status:'pending',reason:'TRUSTED_PDF_HASH_AND_MOBILE_REVIEW_REQUIRED'};
}
