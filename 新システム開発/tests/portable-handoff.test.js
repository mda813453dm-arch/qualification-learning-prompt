import test from 'node:test';
import assert from 'node:assert/strict';
import {exportHandoff,importHandoff} from '../src/portable-handoff.js';
test('round trip retains non-sensitive state only',()=>{
 const token=exportHandoff({qualification:'土地家屋調査士',mode:'review',history:[{text:'private'}],pendingQuestion:{answer:3}}, {weakTopics:['不動産登記法']});
 const restored=importHandoff(token);
 assert.equal(restored.qualification,'土地家屋調査士');
 assert.deepEqual(restored.weakTopics,['不動産登記法']);
 assert.equal(restored.pendingQuestion,null);
 assert.deepEqual(restored.history,[]);
 assert.equal(token.includes('private'),false);
});
test('tampering is rejected',()=>{
 const token=exportHandoff({qualification:'宅建',mode:'conversation'});
 const obj=JSON.parse(token);obj.payload.qualification='別資格';
 assert.throws(()=>importHandoff(JSON.stringify(obj)),/CHECKSUM_MISMATCH/);
});
test('forged verification state is rejected',()=>{
 const obj=JSON.parse(exportHandoff({qualification:'宅建'}));
 obj.payload.officialVerified=true;
 assert.throws(()=>importHandoff(JSON.stringify(obj)),/INVALID_HANDOFF/);
});
test('malformed or oversized input fails closed',()=>{
 assert.throws(()=>importHandoff('invalid'),/INVALID_HANDOFF/);
 assert.throws(()=>exportHandoff({qualification:'宅建'}, {note:'x'.repeat(1001)}),/INVALID_HANDOFF/);
});
