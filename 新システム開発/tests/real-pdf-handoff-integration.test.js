import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {validatePythonPdfHandoff} from '../src/python-pdf-handoff.js';
import {createHandoffQuizSession} from '../src/handoff-quiz-session.js';
const q=process.env.SURVEYOR_QUESTION_PDF,a=process.env.SURVEYOR_ANSWER_PDF;
const skip=!(q&&a);
function readReal(){return JSON.parse(execFileSync('python3',['integration/export_verified_spans.py',q,a],{encoding:'utf8',maxBuffer:8388608,timeout:30000}));}
test('実PDFの20問をPythonからJavaScriptへ受渡し',{skip},()=>{const v=validatePythonPdfHandoff(readReal());assert.equal(v.ok,true,v.reason);assert.equal(v.questions.length,20)});
test('実PDFの未審査問題は出題も採点も不可',{skip},()=>{const quiz=createHandoffQuizSession();assert.equal(quiz.select(readReal(),1).reason,'INDEPENDENT_CONTENT_REVIEW_REQUIRED');assert.throws(()=>quiz.submit(1),/NO_VERIFIED_ACTIVE_QUESTION/)});
test('実PDF原文の改変を拒否',{skip},()=>{const d=readReal();d.questions[0].rawSpan+='改変';assert.equal(validatePythonPdfHandoff(d).reason,'SPAN_HASH_INVALID')});
test('正答PDFのハッシュ改変を拒否',{skip},()=>{const d=readReal();d.answerPdfSha256='0'.repeat(64);assert.equal(validatePythonPdfHandoff(d).reason,'PDF_PIN_MISMATCH')});
