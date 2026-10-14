/**
 * Static runtime contract for ordinary AI apps.
 * Generated packet files are immutable snapshots. The manifest itself contains
 * no question text; it only tells clients which verified packets actually exist.
 */
export function validateStaticPacketManifest(manifest) {
  if(!manifest || manifest.schemaVersion!==1 || !Array.isArray(manifest.entries))
    return Object.freeze({status:"unavailable",reason:"MANIFEST_SCHEMA_INVALID"});
  const seen=new Set();
  for(const e of manifest.entries){
    if(!e || typeof e.qualificationId!=="string" || typeof e.fieldId!=="string" ||
       typeof e.packetUrl!=="string" || !e.packetUrl.startsWith("https://raw.githubusercontent.com/") ||
       !Number.isInteger(e.packetCount) || e.packetCount<1 ||
       e.verificationStatus!=="verified_official" ||
       typeof e.generatedFromSha256!=="string" || !/^[a-f0-9]{64}$/.test(e.generatedFromSha256))
      return Object.freeze({status:"unavailable",reason:"MANIFEST_ENTRY_INVALID"});
    const key=`${e.qualificationId}:${e.fieldId}:${e.year??"any"}`;
    if(seen.has(key)) return Object.freeze({status:"unavailable",reason:"MANIFEST_DUPLICATE"});
    seen.add(key);
  }
  return Object.freeze({status:"ready",entries:Object.freeze([...manifest.entries])});
}

export function selectStaticPacketEntry(manifest,{qualificationId,fieldId,minPackets=1}={}){
  const v=validateStaticPacketManifest(manifest);
  if(v.status!=="ready") return v;
  const candidates=v.entries.filter(e=>e.qualificationId===qualificationId&&e.fieldId===fieldId&&e.packetCount>=minPackets)
    .sort((a,b)=>(b.year??0)-(a.year??0));
  return candidates.length
    ? Object.freeze({status:"ready",entry:candidates[0]})
    : Object.freeze({status:"unavailable",reason:"STATIC_VERIFIED_PACKET_NOT_FOUND"});
}
