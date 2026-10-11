import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemorySessionStore} from '../src/session-store.js';
import {createStudyService} from '../src/study-service.js';
import {exportHandoff,importHandoff} from '../src/portable-handoff.js';

test('対話→過去問要求→詳しい解説→復習→中断→別チャット再開',async()=>{
 const service=createStudyService(createMemorySessionStore());
 await service.start('test-user','土地家屋調査士');
 const practice=await service.message('test-user','過去問を出して');
 assert.equal(practice.action,'request_verified_question');
 assert.equal(practice.session.pendingQuestion,null);
 const explanation=await service.message('test-user','不動産登記法を詳しく説明して');
 assert.equal(explanation.action,'explain');
 const review=await service.message('test-user','弱点を復習したい');
 assert.equal(review.action,'review');
 const stop=await service.message('test-user','今日はここまで');
 assert.equal(stop.action,'pause');
 const handoff=exportHandoff(await service.get('test-user'),{weakTopics:['不動産登記法'],note:'次回は復習から'});
 const restored=importHandoff(handoff);
 assert.equal(restored.qualification,'土地家屋調査士');
 assert.equal(restored.mode,'paused');
 assert.equal(restored.pendingQuestion,null);
 const another=createStudyService(createMemorySessionStore());
 await another.start('test-user',restored.qualification);
 const next=await another.message('test-user','弱点を復習したい');
 assert.equal(next.action,'review');
});
test('話題変更と資格変更は利用者の確定まで元の資格を維持',async()=>{
 const service=createStudyService(createMemorySessionStore());
 await service.start('test-user','宅建');
 const switching=await service.message('test-user','土地家屋調査士に切り替えて');
 assert.equal(switching.action,'resolve_qualification');
 assert.equal((await service.get('test-user')).qualification,'宅建');
 await service.confirmQualification('test-user','土地家屋調査士');
 assert.equal((await service.get('test-user')).qualification,'土地家屋調査士');
});
test('AIへの過去問要求は未検証の問題・正答を出題しない',async()=>{
 const service=createStudyService(createMemorySessionStore());
 await service.start('test-user','通関士');
 const result=await service.message('test-user','過去問を出して');
 assert.equal(result.action,'request_verified_question');
 assert.equal(result.session.pendingQuestion,null);
});
test('チャットをまたぐ引き継ぎは回答履歴と公式検証を復元しない',()=>{
 const exported=exportHandoff({qualification:'測量士補',mode:'review',history:[{text:'secret'}],pendingQuestion:{officialVerified:true,answer:2}});
 const imported=importHandoff(exported);
 assert.equal(imported.pendingQuestion,null);
 assert.deepEqual(imported.history,[]);
 assert.equal(exported.includes('secret'),false);
 assert.equal(exported.includes('officialVerified'),false);
});
