import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {selectEntry,checkPacketSet,listAvailable} from './engine.mjs';
const prefix=new URL('../data/runtime-packets/',import.meta.url);
const caps=JSON.parse(await readFile(new URL('capabilities.json',prefix)));
const manifest=JSON.parse(await readFile(new URL('manifest.json',prefix)));
const available=listAvailable(caps,manifest);
if(!available.length)throw Error('NO_AVAILABLE_QUALIFICATIONS');
let verified=0;
for(const q of available){
  const entries=manifest.entries.filter(x=>x.qualificationId===q.id&&x.verificationStatus==='verified_official');
  for(const e of entries){
    const name=new URL(e.packetUrl).pathname.split('/').pop();
    const set=JSON.parse(await readFile(new URL('verified/'+name,prefix)));
    const packets=checkPacketSet(set,e);
    for(const packet of packets){
      for(const image of packet.diagramAssets||[]){
        const r=await fetch(image.url,{redirect:'error',signal:AbortSignal.timeout(20000)});
        if(!r.ok)throw Error(`IMAGE_HTTP_${r.status}:${packet.questionId}`);
        const bytes=Buffer.from(await r.arrayBuffer());
        const h=createHash('sha256').update(bytes).digest('hex');
        if(h!==image.sha256)throw Error(`IMAGE_SHA256_MISMATCH:${packet.questionId}`);
        if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`NOT_PNG:${packet.questionId}`);
        verified++;
      }
    }
  }
}
console.log(JSON.stringify({status:'PASS',availableQualifications:available.length,verifiedImageAssets:verified}));