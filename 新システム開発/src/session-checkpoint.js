/** Portable deterministic session checkpoint. Host must persist exported JSON. */
export const CHECKPOINT_VERSION=1;
export function exportCheckpoint({qualificationId,topicId,ledger=[],reviewItems=[],reviewQueue=null,returnContext=null,usedOfficialKeys=[],wait=null,questionPacket=null,at}){
 if(!qualificationId||!at||!Array.isArray(ledger)||!Array.isArray(reviewItems))throw Error('CHECKPOINT_REQUIRED_FIELDS');
 const state={version:CHECKPOINT_VERSION,qualificationId,topicId:topicId??null,ledger,reviewItems,reviewQueue,returnContext,usedOfficialKeys,wait,questionPacket,at};
 return JSON.stringify(state);
}
export function restoreCheckpoint(json){
 let d;try{d=JSON.parse(json)}catch{throw Error('CHECKPOINT_JSON_INVALID')}
 if(d?.version!==CHECKPOINT_VERSION||!d.qualificationId||!Array.isArray(d.ledger)||!Array.isArray(d.reviewItems)||!Array.isArray(d.usedOfficialKeys)||!d.at)throw Error('CHECKPOINT_SCHEMA_INVALID');
 if(d.wait==='answer'&&(!d.questionPacket||d.questionPacket.status!=='ready'||!d.questionPacket.packetHash))throw Error('ANSWER_WAIT_PACKET_REQUIRED');
 const ids=new Set();
 for(const e of d.ledger){if(!e.attemptId||ids.has(e.attemptId))throw Error('LEDGER_DUPLICATE_ATTEMPT');ids.add(e.attemptId);}
 return Object.freeze(d);
}
