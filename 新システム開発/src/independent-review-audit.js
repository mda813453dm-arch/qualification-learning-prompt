import {validatePythonPdfHandoff} from './python-pdf-handoff.js';

/** Static completeness audit only. Never approves questions for publication. */
export function auditExtractedQuestions(handoff) {
 const validated=validatePythonPdfHandoff(handoff);
 if(!validated.ok)return {ok:false,reason:validated.reason,reviews:[]};
 const reviews=validated.questions.map(q=>{
  const checks={};
  checks.fiveStatementLabels=['ア','イ','ウ','エ','オ'].every(c=>new RegExp('^\\s*'+c+'[ \\t]+','m').test(q.rawSpan));
  checks.oneFiveChoiceLine=(q.rawSpan.match(/^\s*1\s+[アイウエオ]{2}\s+2\s+[アイウエオ]{2}\s+3\s+[アイウエオ]{2}\s+4\s+[アイウエオ]{2}\s+5\s+[アイウエオ]{2}\s*$/gm)||[]).length===1;
  checks.questionHeading=new RegExp('^\\s*第\\s*'+q.number+'\\s*問(?=\\s|$)','m').test(q.rawSpan);
  checks.noExplicitVisualReference=!/(?:図\s*[0-9０-９]+|下図|次の図|別紙|下表|表\s*[0-9０-９])/.test(q.rawSpan);
  return {number:q.number,page:q.page,staticChecks:checks,staticChecksPass:Object.values(checks).every(Boolean),independentContentReview:'PENDING',visualReview:'PENDING',answerCellReview:'PENDING',publishable:false};
 });
 return {ok:true,total:reviews.length,staticPass:reviews.filter(r=>r.staticChecksPass).length,publishable:0,reviews};
}
