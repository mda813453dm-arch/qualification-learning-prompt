import test from "node:test";
import assert from "node:assert/strict";
import { verifiedPrincipal, scopedStudyStore } from "../src/secure-session-boundary.js";
const valid = {verified:true,issuerVerified:true,audienceVerified:true,expiryVerified:true,subject:"user-A"};
test("rejects spoofed header and unverified principal",()=>{
 assert.throws(()=>verifiedPrincipal({subject:"user-A",headers:{"oai-authenticated-user-id":"user-A"}}),/AUTHENTICATION_REQUIRED/);
 for(const field of ["verified","issuerVerified","audienceVerified","expiryVerified"]) {
  assert.throws(()=>verifiedPrincipal({...valid,[field]:false}),/AUTHENTICATION_REQUIRED/);
 }
});
test("rejects missing DB",()=>assert.throws(()=>scopedStudyStore(null,verifiedPrincipal(valid)),/STORE_UNAVAILABLE/));
test("scopes read and write by verified user",async()=>{
 const calls=[];const db={prepare(sql){return {bind(...args){calls.push({sql,args});return {async first(){return null},async run(){return {meta:{changes:0}}}}}}}};
 const store=scopedStudyStore(db,verifiedPrincipal(valid));
 await assert.rejects(store.load("other-session"),/FORBIDDEN/);
 await assert.rejects(store.save("other-session",{stage:1}),/FORBIDDEN/);
 assert.equal(calls.length,2);
 assert.equal(calls[0].args.at(-1),"user-A");
 assert.equal(calls[1].args.at(-1),"user-A");
});
