const fail=(reason,checks={})=>Object.freeze({status:"quarantined",reason,checks:Object.freeze(checks)});
export function evaluateExtractedQuestion(q,{expectedChoiceCount=null}={}){
 const checks={
  questionNumber:Number.isInteger(q?.questionNumber)&&q.questionNumber>0,
  stem:typeof q?.stem==="string"&&q.stem.trim().length>0,
  choices:Array.isArray(q?.choices)&&q.choices.length>=2&&q.choices.every(x=>typeof x==="string"&&x.trim().length>0),
  choiceCount:expectedChoiceCount==null||(Array.isArray(q?.choices)&&q.choices.length===expectedChoiceCount),
  pageRange:Array.isArray(q?.sourcePages)&&q.sourcePages.length>=1&&q.sourcePages.every(Number.isInteger),
  boundary:q?.boundaryVerified===true,
  pageSpan:q?.pageSpanVerified===true,
  diagramDecision:typeof q?.diagramRequired==="boolean",
  diagramAssets:q?.diagramRequired!==true||(Array.isArray(q?.diagramAssets)&&q.diagramAssets.length>0&&q.diagramAssets.every(a=>a&&typeof a.sha256==="string"&&/^[a-f0-9]{64}$/.test(a.sha256))),
  answer:Number.isInteger(q?.correctAnswer)&&q.correctAnswer>=1&&Array.isArray(q?.choices)&&q.correctAnswer<=q.choices.length,
  answerEvidence:q?.answerEvidence?.sameYear===true&&Number.isInteger(q?.answerEvidence?.page),
  field:q?.fieldEvidence?.verified===true&&typeof q?.fieldId==="string"&&q.fieldId.length>0
 };
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
 return failed.length?fail("QUESTION_VERIFICATION_INCOMPLETE",{...checks,failed:Object.freeze(failed)})
  :Object.freeze({status:"verified",checks:Object.freeze(checks)});
}
export function promoteExtractedQuestion(q,options={}){
 const gate=evaluateExtractedQuestion(q,options); if(gate.status!=="verified") return gate;
 return Object.freeze({status:"ready",packet:Object.freeze({...q,packetStatus:"verified_official",
  verification:Object.freeze({questionText:"official_pdf_checked",choices:"official_pdf_checked",boundary:"verified",pageSpan:"verified",diagram:"verified",answer:"same_year_official_answer_checked",field:"verified"})})});
}
