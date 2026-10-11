import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrincipalFactory,scopedStudyStore} from '../src/secure-session-boundary.js';
const valid={verified:true,issuerVerified:true,audienceVerified:true,expiryVerified:true,subject:'user-A'};
const fromBearer=createPrincipalFactory(async token=>token==='valid-token'?valid:null);
test('rejects forged objects and headers',()=>{
 assert.throws(()=>scopedStudyStore({}, {...valid,userId:'victim'}),/AUTHENTICATION_REQUIRED/);
 assert.throws(()=>scopedStudyStore({}, {userId:'user-A'}),/AUTHENTICATION_REQUIRED/);
});
test('rejects invalid token and missing claims',async()=>{
 await assert.rejects(fromBearer('invalid'),/AUTHENTICATION_REQUIRED/);
 for(const key of ['verified','issuerVerified','audienceVerified','expiryVerified']) {
  const bad=createPrincipalFactory(async()=>({...valid,[key]:false}));
  await assert.rejects(bad('token'),/AUTHENTICATION_REQUIRED/);
 }
});
test('rejects missing DB',async()=>{
 const principal=await fromBearer('valid-token');
 assert.throws(()=>scopedStudyStore(null,principal),/STORE_UNAVAILABLE/);
});
test('scopes read and write by user',async()=>{
 const calls=[];
 const db={prepare(sql){return {bind(...args){calls.push({sql,args});return {async first(){return null},async run(){return {meta:{changes:0}}}}}}}};
 const store=scopedStudyStore(db,await fromBearer('valid-token'));
 await assert.rejects(store.load('other-session'),/FORBIDDEN/);
 await assert.rejects(store.save('other-session',{stage:1}),/FORBIDDEN/);
 assert.equal(calls.length,2);
 assert.equal(calls[0].args.at(-1),'user-A');
 assert.equal(calls[1].args.at(-1),'user-A');
});
