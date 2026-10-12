import {validatePythonPdfHandoff} from './python-pdf-handoff.js';

/**
 * Fail-closed handoff-to-grading session. Only questions independently approved
 * by code-owned review records can be shown. No approval records are shipped yet.
 * Never accept review records from HTTP requests, chat messages or model output.
 */
export function createHandoffQuizSession({reviewedQuestions=Object.freeze({})}={}) {
 let active=null;
 const select=(handoff,number)=>{
  active=null;
  const verified=validatePythonPdfHandoff(handoff);
  if(!verified.ok)return {status:'unavailable',reason:verified.reason};
  const question=verified.questions[number-1];
  if(!Number.isInteger(number)||number<1||number>20||!question||question.number!==number)return {status:'unavailable',reason:'QUESTION_NOT_FOUND'};
  const key=handoff.registryKey+':'+number;
  const review=reviewedQuestions[key];
  if(!review||review.spanSha256!==handoff.questions[number-1].spanSha256||review.answerNumber!==question.answerNumber||review.visualCompletenessVerified!==true)return {status:'unavailable',reason:'INDEPENDENT_CONTENT_REVIEW_REQUIRED'};
  active={key,answer:question.answerNumber,choices:question.choices};
  return {status:'question',key,text:question.rawSpan,choices:[...question.choices],instruction:'番号で答えてください'};
 };
 const submit=choice=>{
  if(!active)throw new Error('NO_VERIFIED_ACTIVE_QUESTION');
  if(!Number.isInteger(choice)||choice<1||choice>active.choices.length)throw new Error('INVALID_CHOICE');
  const {key,answer}=active;
  active=null;
  return {status:'graded',key,correct:choice===answer,correctChoice:answer};
 };
 return {select,submit,cancel(){active=null}};
}
