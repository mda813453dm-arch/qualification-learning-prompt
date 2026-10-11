import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyQuestionSpan} from '../src/verified-span-gate.js';
const text='第2問 正しい組合せを選べ。\nア 民法上の事項。\nイ 不動産登記法の事項。\n1 アウ 2 アオ 3 イウ 4 イエ 5 エオ\n';
const choices=['アウ','アオ','イウ','イエ','エオ'];
const sha=createHash('sha256').update(text).digest('hex');
const record={rawSpan:text,expectedSpanSha256:sha,questionText:'第2問 正しい組合せを選べ。',choices,correctChoice:5,expectedAnswer:5};
test('完全一致のテキストのみを許可',()=>assert.equal(verifyQuestionSpan(record).ok,true));
test('問題本文改ざんを拒否',()=>assert.equal(verifyQuestionSpan({...record,questionText:'別の問題'}).reason,'QUESTION_TEXT_NOT_IN_SPAN'));
test('抽出テキストの改ざんを拒否',()=>assert.equal(verifyQuestionSpan({...record,rawSpan:text+'改ざん'}).reason,'TEXT_SPAN_HASH_MISMATCH'));
test('選択肢入れ替えを拒否',()=>assert.equal(verifyQuestionSpan({...record,choices:[...choices].reverse()}).reason,'CHOICES_NOT_MATCHED'));
test('正答のすり替えを拒否',()=>assert.equal(verifyQuestionSpan({...record,correctChoice:1}).reason,'ANSWER_MISMATCH'));
test('図表を含むとき視覚照合なしでは拒否',()=>{
 const s=text+'図1参照';const h=createHash('sha256').update(s).digest('hex');
 assert.equal(verifyQuestionSpan({...record,rawSpan:s,expectedSpanSha256:h}).reason,'VISUAL_EVIDENCE_REQUIRED');
});
