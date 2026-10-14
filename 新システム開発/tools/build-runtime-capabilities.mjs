import fs from "node:fs";
import path from "node:path";
import { QUALIFICATION_CATALOG } from "../src/qualification-catalog.js";
const root=process.cwd();
const catalogText=fs.readFileSync(path.join(root,"src","qualification-catalog.js"),"utf8");
const ids=[...catalogText.matchAll(/id:\s*["'](q\d{3})["']/g)].map(x=>x[1]);
if(ids.length!==103) throw new Error(`CATALOG_COUNT_INVALID:${ids.length}`);
const manifest=JSON.parse(fs.readFileSync(path.join(root,"data","runtime-packets","manifest.json"),"utf8"));
const byQ=new Map();
for(const e of manifest.entries??[]){
 if(e.verificationStatus!=="verified_official") continue;
 const arr=byQ.get(e.qualificationId)??[];arr.push({fieldId:e.fieldId,year:e.year,packetCount:e.packetCount,packetUrl:e.packetUrl});byQ.set(e.qualificationId,arr);
}
const qualifications=ids.map(qualificationId=>({
 qualificationId,
 officialPracticeRuntime:byQ.has(qualificationId)?"static_verified_packets_available":"not_yet_available",
 verifiedPacketSets:byQ.get(qualificationId)??[]
}));
const out={schemaVersion:1,qualificationCount:ids.length,qualifications};
fs.writeFileSync(path.join(root,"data","runtime-packets","capabilities.json"),JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({status:"ready",qualificationCount:ids.length,available:[...byQ.keys()].length}));
