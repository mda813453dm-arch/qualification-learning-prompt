import assert from "node:assert/strict";
import {validateOfficialSourceAdapter,buildVerifiedPacketWithAdapter} from "./official-source-adapter-contract.js";
const H="a".repeat(64);
const adapter={schemaVersion:1,adapterId:"fixture",qualificationId:"fixture-q",authority:"official",
 officialEntryUrl:"https://official.example/past",supportedYears:[2025],
 discoverDocuments:async()=>({status:"ready",question:{url:"https://official.example/q.pdf"},answer:{url:"https://official.example/a.pdf"}}),
 downloadAndVerify:async()=>({status:"verified",sha256:H,bytes:new Uint8Array([1])}),
 extractQuestion:async()=>({status:"ready",stem:"official stem",choices:["A","B","C","D"],diagramRequired:false,diagramAssets:[],evidence:{page:1}}),
 classifyField:async()=>({status:"verified",fieldId:"law",unitId:"u1",evidence:{method:"approved-map"}}),
 verifyAnswer:async()=>({status:"verified",correctAnswer:2,evidence:{page:2,cell:"Q1"}})};
assert.equal(validateOfficialSourceAdapter(adapter).status,"ready");
const ok=await buildVerifiedPacketWithAdapter(adapter,{year:2025,questionNumber:1,requestedFieldId:"law"});
assert.equal(ok.status,"ready");assert.equal(ok.packet.correctAnswer,2);assert.equal(ok.packet.packetStatus,"verified_official");
assert.equal((await buildVerifiedPacketWithAdapter(adapter,{year:2025,questionNumber:1,requestedFieldId:"other"})).reason,"FIELD_VERIFICATION_FAILED");
const bad={...adapter,verifyAnswer:async()=>({status:"unverified",correctAnswer:2})};
assert.equal((await buildVerifiedPacketWithAdapter(bad,{year:2025,questionNumber:1,requestedFieldId:"law"})).reason,"ANSWER_VERIFICATION_FAILED");
const fig={...adapter,extractQuestion:async()=>({status:"ready",stem:"s",choices:["a","b"],diagramRequired:true,diagramAssets:[]})};
assert.equal((await buildVerifiedPacketWithAdapter(fig,{year:2025,questionNumber:1,requestedFieldId:"law"})).reason,"QUESTION_EXTRACTION_INCOMPLETE");
console.log("official-source-adapter-contract: PASS");
