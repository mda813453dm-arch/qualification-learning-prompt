import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
/** This gate certifies text-span identity only, never official provenance or visual completeness. */
export function verifyQuestionSpan({rawSpan,expectedSpanSha256,questionText,choices,correctChoice,expectedAnswer}={}) {
 const fail=reason=>({ok:false,reason});
 if(typeof rawSpan!=='string'||typeof expectedSpanSha256!=='string'||sha(rawSpan)!==expectedSpanSha256)return fail('TEXT_SPAN_HASH_MISMATCH');
 if(typeof questionText!=='string'||!questionText.trim()||!rawSpan.includes(questionText))return fail('QUESTION_TEXT_NOT_IN_SPAN');
 if(!Array.isArray(choices)||choices.length!==5||choices.some(x=>typeof x!=='string'||!x.trim()))return fail('CHOICES_INVALID');
 const line=rawSpan.match(/^\s*1\s+([アイウエオ]{2})\s+2\s+([アイウエオ]{2})\s+3\s+([イウエオア]{2})\s+4\s+([アイウエオ]{2})\s+5\s+([アイウエオ]{2})\s*$/m);
 if(!line||choices.some((x,i)=>x!==line[i+1]))return fail('CHOICES_NOT_MATCHED');
 if(!Number.isInteger(expectedAnswer)||correctChoice!==expectedAnswer)return fail('ANSWER_MISMATCH');
 if(/(?:図|表|下図|下表|別紙|次の図)/.test(rawSpan))return fail('VISUAL_EVIDENCE_REQUIRED');
 return {ok:true,level:'TEXT_ONLY_MATCH',visualCompletenessVerified:false};
}
