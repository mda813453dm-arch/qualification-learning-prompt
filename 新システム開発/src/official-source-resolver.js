import { QUALIFICATION_CATALOG } from "./qualification-catalog.js";

const HTTPS = /^https:\/\//i;
const unavailable = (reason, extra={}) => Object.freeze({status:"unavailable",reason,...extra});
function hostOf(url){try{return new URL(url).hostname.toLowerCase();}catch{return null;}}
function sameOrSubdomain(host,allowed){return host===allowed||host?.endsWith("."+allowed);}
function allowedOfficialHosts(entry){
 const h=hostOf(entry?.officialEntryUrl); return h?[h]:[];
}
function sectionMatches(d,expectedSection){
 return !expectedSection || d.section===expectedSection;
}

function normalizeName(v="") {
  return String(v).normalize("NFKC").replace(/\s+/g,"").trim().toLowerCase();
}

/**
 * Qualification-neutral entry resolver for all catalogued qualifications.
 * It resolves an official ENTRY, not a question packet.
 * A reachable/listed URL must never be treated as successful extraction.
 */
export function resolveOfficialSourceEntry({qualificationId=null, qualificationName=null}={}) {
  const key=normalizeName(qualificationName);
  const row=QUALIFICATION_CATALOG.find(q =>
    (qualificationId && q.id===qualificationId) ||
    (!qualificationId && key && [q.name,...(q.aliases??[])].some(x=>normalizeName(x)===key))
  );
  if(!row) return unavailable("QUALIFICATION_NOT_REGISTERED");
  if(!row.pastQuestionsUrl || !HTTPS.test(row.pastQuestionsUrl))
    return unavailable("OFFICIAL_ENTRY_NOT_REGISTERED",{qualificationId:row.id,qualificationName:row.name});
  return Object.freeze({
    status:"ready",
    qualificationId:row.id,
    qualificationName:row.name,
    authority:row.authority??null,
    officialEntryUrl:row.pastQuestionsUrl,
    sourceStatus:row.sourceStatus??"unknown",
    sourcePath:row.sourcePath??null
  });
}

/**
 * Generic recovery plan when a stored PDF URL moves.
 * The adapter is responsible for fetching pages; this function only validates
 * evidence and prevents silent promotion of unrelated/non-official URLs.
 */
export async function rediscoverOfficialDocuments({
  entry,
  discoverFromEntry,
  expectedYear=null,
  expectedQualificationName=null
}={}) {
  if(!entry || entry.status!=="ready" || typeof discoverFromEntry!=="function")
    return unavailable("REDISCOVERY_INPUT_INVALID");
  let result;
  try {
    result=await discoverFromEntry({
      url:entry.officialEntryUrl,
      qualificationId:entry.qualificationId,
      qualificationName:entry.qualificationName,
      authority:entry.authority,
      expectedYear
    });
  } catch {
    return unavailable("OFFICIAL_ENTRY_FETCH_FAILED");
  }
  if(!result || result.status!=="ready" || !Array.isArray(result.documents))
    return unavailable("OFFICIAL_DOCUMENT_DISCOVERY_FAILED");

  const qName=normalizeName(expectedQualificationName||entry.qualificationName);
  const docs=result.documents.filter(d =>
    d && HTTPS.test(d.url||"") &&
    ["question","answer"].includes(d.kind) &&
    (!expectedYear || d.year===expectedYear) &&
    normalizeName(d.qualificationName||entry.qualificationName)===qName &&
    d.authorityConfirmed===true &&
    d.officialHostConfirmed===true
  );
  const years=[...new Set(docs.map(d=>d.year).filter(Number.isInteger))].sort((a,b)=>b-a);
  const completeYears=years.filter(y =>
    docs.some(d=>d.year===y&&d.kind==="question") &&
    docs.some(d=>d.year===y&&d.kind==="answer")
  );
  if(!completeYears.length)
    return unavailable("QUESTION_ANSWER_PAIR_NOT_FOUND",{documents:Object.freeze(docs)});
  return Object.freeze({
    status:"ready",
    qualificationId:entry.qualificationId,
    officialEntryUrl:entry.officialEntryUrl,
    completeYears:Object.freeze(completeYears),
    documents:Object.freeze(docs)
  });
}

/**
 * Runtime decision shared by every qualification.
 * Preverified packets are preferred. Live PDF ingestion is the second path.
 * There is no implicit AI-created fallback.
 */
export function chooseOfficialQuestionPath({
  preverifiedPacketCount=0,
  requestedSetSize=3,
  officialEntryAvailable=false,
  runtimePdfAdapterAvailable=false
}={}) {
  if(Number.isInteger(preverifiedPacketCount) && preverifiedPacketCount>=requestedSetSize)
    return Object.freeze({status:"ready",path:"preverified_packet"});
  if(officialEntryAvailable && runtimePdfAdapterAvailable)
    return Object.freeze({status:"ready",path:"runtime_official_pdf"});
  return unavailable("OFFICIAL_RUNTIME_NOT_READY",{
    missing:Object.freeze([
      ...(officialEntryAvailable?[]:["official_entry"]),
      ...(runtimePdfAdapterAvailable?[]:["runtime_pdf_adapter"]),
      ...(preverifiedPacketCount>=requestedSetSize?[]:["preverified_packets"])
    ])
  });
}
