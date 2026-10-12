import {createHash} from 'node:crypto';
import {SURVEY_ASSISTANT_VISUAL_CASES} from './survey-assistant-visual-cases.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=reason=>({status:'unavailable',reason});
/** Preflight only. Expected hash and review evidence MUST come from trusted code,
 * not from users or AI. Does not authorize public quiz delivery.
 */
export function prepareVisualQuestionBundle({caseRecord,questionPdfBytes,expectedPdfSha256,verified}={}){
 if(!SURVEY_ASSISTANT_VISUAL_CASES.includes(caseRecord))return fail('UNKNOWN_OFFICIAL_QUESTION');
 if(!Buffer.isBuffer(questionPdfBytes)||questionPdfBytes.subarray(0,5).toString()!=='%PDF-')return fail('QUESTION_PDF_BYTES_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(expectedPdfSha256||'')||hash(questionPdfBytes)!==expectedPdfSha256)return fail('PDF_PIN_MISMATCH');
 if(!verified||verified.questionNumber!==caseRecord.questionNumber||verified.pdfPage!==caseRecord.pdfPage)return fail('QUESTION_PAGE_IDENTITY_MISMATCH');
 if(verified.questionTextVerified!==true||typeof verified.questionText!=='string'||!verified.questionText.trim())return fail('QUESTION_TEXT_UNVERIFIED');
 if(!Array.isArray(verified.choices)||verified.choices.length!==5||verified.choices.some(x=>typeof x!=='string'||!x.trim()))return fail('CHOICES_UNVERIFIED');
 const png=verified.pagePng;
 if(!Buffer.isBuffer(png)||png.length<16||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return fail('PAGE_IMAGE_MISSING');
 if(verified.figureVerified!==true||verified.tableVerified!==true||verified.visualPageReviewed!==true)return fail('VISUAL_CONTENT_UNVERIFIED');
 if(verified.answerPdfVerified!==true||verified.answerNumber!==caseRecord.answerNumber||verified.answerQuestionNumber!==caseRecord.questionNumber)return fail('ANSWER_IDENTITY_UNVERIFIED');
 return {status:'preview',questionNumber:caseRecord.questionNumber,pdfPage:caseRecord.pdfPage,questionText:verified.questionText,choices:[...verified.choices],pagePng:Buffer.from(png),pagePngSha256:hash(png),answerNumber:verified.answerNumber,visualCompletenessVerified:true,mobileRenderingVerified:false,publishable:false};
}
