const HASH=/^[a-f0-9]{64}$/;
const HTTPS=/^https:\/\//i;
const fail=(reason,extra={})=>Object.freeze({status:"unavailable",reason,...extra});

export function validateOfficialSourceAdapter(adapter){
  if(!adapter||adapter.schemaVersion!==1||typeof adapter.adapterId!=="string"||!adapter.adapterId||
     typeof adapter.qualificationId!=="string"||!adapter.qualificationId||
     typeof adapter.authority!=="string"||!adapter.authority||
     typeof adapter.officialEntryUrl!=="string"||!HTTPS.test(adapter.officialEntryUrl)||
     !Array.isArray(adapter.supportedYears)||!adapter.supportedYears.every(Number.isInteger)||
     typeof adapter.discoverDocuments!=="function"||
     typeof adapter.downloadAndVerify!=="function"||
     typeof adapter.extractQuestion!=="function"||
     typeof adapter.verifyAnswer!=="function"||
     typeof adapter.classifyField!=="function")
    return fail("ADAPTER_CONTRACT_INVALID");
  return Object.freeze({status:"ready",adapterId:adapter.adapterId});
}

export async function buildVerifiedPacketWithAdapter(adapter,{year,questionNumber,requestedFieldId}={}){
  const v=validateOfficialSourceAdapter(adapter); if(v.status!=="ready") return v;
  if(!Number.isInteger(year)||!Number.isInteger(questionNumber)||typeof requestedFieldId!=="string")
    return fail("REQUEST_INVALID");
  if(!adapter.supportedYears.includes(year)) return fail("YEAR_NOT_SUPPORTED");

  const docs=await adapter.discoverDocuments({year});
  if(!docs||docs.status!=="ready"||!docs.question||!docs.answer) return fail("OFFICIAL_DOCUMENT_PAIR_NOT_FOUND");
  const [questionFile,answerFile]=await Promise.all([
    adapter.downloadAndVerify({kind:"question",document:docs.question,year}),
    adapter.downloadAndVerify({kind:"answer",document:docs.answer,year})
  ]);
  if(questionFile?.status!=="verified"||answerFile?.status!=="verified") return fail("OFFICIAL_DOCUMENT_VERIFICATION_FAILED");
  if(!HASH.test(questionFile.sha256||"")||!HASH.test(answerFile.sha256||"")) return fail("OFFICIAL_DOCUMENT_HASH_INVALID");

  const q=await adapter.extractQuestion({file:questionFile,questionNumber,year});
  if(!q||q.status!=="ready"||typeof q.stem!=="string"||!q.stem.trim()||
     !Array.isArray(q.choices)||q.choices.length<2||q.choices.some(x=>typeof x!=="string"||!x.trim())||
     typeof q.diagramRequired!=="boolean"||(q.diagramRequired&&(!Array.isArray(q.diagramAssets)||!q.diagramAssets.length)))
    return fail("QUESTION_EXTRACTION_INCOMPLETE");

  const cls=await adapter.classifyField({year,questionNumber,stem:q.stem,choices:q.choices});
  if(!cls||cls.status!=="verified"||cls.fieldId!==requestedFieldId) return fail("FIELD_VERIFICATION_FAILED");

  const ans=await adapter.verifyAnswer({file:answerFile,year,questionNumber});
  if(!ans||ans.status!=="verified"||!Number.isInteger(ans.correctAnswer)||
     ans.correctAnswer<1||ans.correctAnswer>q.choices.length) return fail("ANSWER_VERIFICATION_FAILED");

  return Object.freeze({status:"ready",packet:Object.freeze({
    sourceMode:"generated_verified_official_packet",qualificationId:adapter.qualificationId,
    fieldId:cls.fieldId,unitId:cls.unitId??null,year,questionNumber,
    questionId:`${adapter.qualificationId}:${year}:${questionNumber}`,
    stem:q.stem,choices:Object.freeze([...q.choices]),correctAnswer:ans.correctAnswer,
    diagramRequired:q.diagramRequired,diagramAssets:Object.freeze([...(q.diagramAssets??[])]),
    questionPdfUrl:docs.question.url,answerPdfUrl:docs.answer.url,
    questionPdfSha256:questionFile.sha256,answerPdfSha256:answerFile.sha256,
    packetStatus:"verified_official",
    evidence:Object.freeze({question:q.evidence??null,answer:ans.evidence??null,field:cls.evidence??null}),
    verification:Object.freeze({questionText:"official_pdf_checked",choices:"official_pdf_checked",answer:"same_year_official_answer_checked",field:"verified"})
  })});
}
