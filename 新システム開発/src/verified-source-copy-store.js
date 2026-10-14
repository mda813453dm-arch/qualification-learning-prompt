const HASH=/^[a-f0-9]{64}$/;
const fail=(reason,extra={})=>Object.freeze({status:"unavailable",reason,...extra});

export function validateSourceCopyRecord(record){
  if(!record||record.schemaVersion!==1||typeof record.registryKey!=="string"||
     !["question","answer"].includes(record.kind)||typeof record.officialUrl!=="string"||
     !record.officialUrl.startsWith("https://")||!HASH.test(record.expectedSha256||"")||
     typeof record.copyLocation!=="string"||!record.copyLocation)
    return fail("SOURCE_COPY_RECORD_INVALID");
  return Object.freeze({status:"ready"});
}

export async function loadVerifiedSourceCopy(record,{loadBytes,sha256}={}){
  const v=validateSourceCopyRecord(record); if(v.status!=="ready") return v;
  if(typeof loadBytes!=="function"||typeof sha256!=="function") return fail("SOURCE_COPY_IO_REQUIRED");
  let bytes;
  try{bytes=await loadBytes(record.copyLocation);}catch(error){
    return fail("SOURCE_COPY_LOAD_FAILED",{code:error?.code??error?.name??"ERROR"});
  }
  if(!bytes) return fail("SOURCE_COPY_EMPTY");
  const actual=await sha256(bytes);
  if(actual!==record.expectedSha256) return fail("SOURCE_COPY_HASH_MISMATCH",{actualSha256:actual});
  return Object.freeze({status:"verified",route:"repository_verified_copy",bytes,sha256:actual,
    registryKey:record.registryKey,kind:record.kind,officialUrl:record.officialUrl});
}

export function findSourceCopy(records,{registryKey,kind}={}){
  if(!Array.isArray(records)) return fail("SOURCE_COPY_MANIFEST_INVALID");
  const matches=records.filter(r=>r.registryKey===registryKey&&r.kind===kind&&validateSourceCopyRecord(r).status==="ready");
  return matches.length===1?Object.freeze({status:"ready",record:matches[0]}):fail(matches.length?"SOURCE_COPY_DUPLICATE":"SOURCE_COPY_NOT_FOUND");
}
