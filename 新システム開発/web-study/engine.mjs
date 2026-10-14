/** Deterministic mobile learning core. No model responses or AI instructions are inputs. */
export const ROOT = 'https://raw.githubusercontent.com/mda813453dm-arch/qualification-learning-prompt/ai-learning-system/新システム開発/data/runtime-packets/';
export const QUALIFICATIONS = Object.freeze({
  q038: {name:'土地家屋調査士', exemption:true},
  q041: {name:'宅地建物取引士', exemption:true},
  q063: {name:'測量士補', exemption:false}
});
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const secureUrl = (url, prefix=ROOT) => typeof url === 'string' && url.startsWith(prefix) && !url.includes('#') && !url.includes('?') && !url.includes('..');
const hex256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function listAvailable(capabilities, manifest) {
  assert(capabilities?.schemaVersion===1 && Array.isArray(capabilities.qualifications),'INVALID_CAPABILITIES');
  assert(manifest?.schemaVersion===1 && Array.isArray(manifest.entries),'INVALID_MANIFEST');
  return capabilities.qualifications.filter(c=> c.officialPracticeRuntime==='static_verified_packets_available' &&
    QUALIFICATIONS[c.qualificationId] && manifest.entries.some(e=>e.qualificationId===c.qualificationId && e.verificationStatus==='verified_official' && secureUrl(e.packetUrl,ROOT+'verified/')))
    .map(c=>({id:c.qualificationId,name:QUALIFICATIONS[c.qualificationId].name}));
}
export function selectEntry(manifest, qualificationId, fieldId=null) {
  const items=manifest?.entries?.filter(e=>e.qualificationId===qualificationId && e.verificationStatus==='verified_official' &&
    Number.isInteger(e.packetCount) && e.packetCount>0 && secureUrl(e.packetUrl,ROOT+'verified/') && typeof e.fieldId==='string' && Number.isInteger(e.year));
  assert(items?.length,'VERIFIED_PACKETS_NOT_AVAILABLE');
  const ordered=[...items].sort((a,b)=>a.fieldId.localeCompare(b.fieldId)||b.year-a.year);
  return (fieldId && ordered.find(e=>e.fieldId===fieldId)) || ordered[0];
}
export function checkPacketSet(set,entry) {
  assert(set?.schemaVersion===1 && set.verificationStatus==='verified_official' && set.qualificationId===entry.qualificationId &&
    set.fieldId===entry.fieldId && set.year===entry.year && Array.isArray(set.packets) && set.packets.length===entry.packetCount,
    'INVALID_PACKET_SET');
  const ids=new Set();
  for(const p of set.packets){
    assert(p.sourceMode==='static_verified_official_packet' && p.packetStatus==='verified_official' && p.fieldId===entry.fieldId &&
      p.year===entry.year && typeof p.questionId==='string' && !ids.has(p.questionId) && Number.isInteger(p.questionNumber) &&
      typeof p.stem==='string' && p.stem.trim() && Array.isArray(p.choices) && p.choices.length>=2 && p.choices.length<=10 &&
      p.choices.every(s=>typeof s==='string' && !!s.trim()) && Number.isInteger(p.correctAnswer) &&
      p.correctAnswer>=1 && p.correctAnswer<=p.choices.length, 'INCOMPLETE_QUESTION');
    ids.add(p.questionId);
    assert(p.verification?.questionText==='official_pdf_checked' && p.verification?.choices==='official_pdf_checked' &&
      p.verification?.answer==='same_year_official_answer_checked' && p.verification?.field==='verified' &&
      ['question_level_pdf_graphics_checked','question_level_review_checked'].includes(p.verification?.visual), 'UNVERIFIED_QUESTION');
    assert(hex256(p.questionPdfSha256) && hex256(p.answerPdfSha256) && /^https:\/\//.test(p.questionPdfUrl) &&
      /^https:\/\//.test(p.answerPdfUrl), 'MISSING_OFFICIAL_EVIDENCE');
    assert(typeof p.diagramRequired==='boolean','DIAGRAM_STATUS_REQUIRED');
    if(p.diagramRequired){
      assert(Array.isArray(p.diagramAssets) && p.diagramAssets.length>0, 'MISSING_OFFICIAL_IMAGE');
      assert(p.diagramAssets.every(a=>secureUrl(a.url,ROOT+'assets/') && hex256(a.sha256) && Number.isInteger(a.sourcePdfPage) && a.sourcePdfPage>0 && a.kind==='official_question_page'), 'UNTRUSTED_IMAGE');
    }
    // Text placeholder is only legal when an entire official question page image is supplied.
    if(p.stem.includes('公式問題本文・図表はdiagramAssets')) assert(p.diagramRequired && p.diagramAssets.length,'PLACEHOLDER_WITHOUT_IMAGE');
  }
  return Object.freeze([...set.packets].sort((a,b)=>a.questionNumber-b.questionNumber));
}
export function buildVisibleQuestion(p, verifiedImages) {
  assert(Array.isArray(verifiedImages) && (!p.diagramRequired || verifiedImages.length===p.diagramAssets.length), 'IMAGE_NOT_VERIFIED');
  assert(!verifiedImages.some(x=>typeof x!=='string'||!x.startsWith('blob:')), 'IMAGE_NOT_VERIFIED');
  const placeholder=p.stem.includes('公式問題本文・図表はdiagramAssets');
  assert(!placeholder || (p.diagramRequired && verifiedImages.length>0),'MISSING_QUESTION_TEXT');
  return Object.freeze({questionId:p.questionId,year:p.year,number:p.questionNumber,section:p.section,
    stem:placeholder?'':p.stem,images:Object.freeze([...verifiedImages]),choices:Object.freeze([...p.choices]),
    instruction:'番号で答えてください。'});
}
export function createSession({now=()=>Date.now()}={}) {
  let state=Object.freeze({phase:'SELECT_QUALIFICATION',qualificationId:null,stage:null,exemption:null,startedAt:null,
    questionIndex:0,questionId:null,selected:null,graded:null,history:[],packets:[],visual:null,wrongStreak:0});
  const result=()=>state;
  function transition(action, payload={}){
    const s=state, fail=(code)=>({ok:false,code,state:s});
    const commit=(phase,changes={})=>{state=Object.freeze({...s,...changes,phase});return {ok:true,state};};
    if(action==='QUALIFY' && s.phase==='SELECT_QUALIFICATION' && QUALIFICATIONS[payload.id])return commit('OVERVIEW',{qualificationId:payload.id});
    if(action==='OVERVIEW_ACK' && s.phase==='OVERVIEW')return commit(QUALIFICATIONS[s.qualificationId].exemption?'EXEMPTION':'STAGE');
    if(action==='SET_EXEMPTION' && s.phase==='EXEMPTION' && [1,2].includes(payload.value))return commit('STAGE',{exemption:payload.value===1});
    if(action==='SET_STAGE' && s.phase==='STAGE' && Number.isInteger(payload.value) && payload.value>=1 && payload.value<=4)return commit('PLAN',{stage:payload.value});
    if(action==='APPROVE_PLAN' && s.phase==='PLAN')return commit('MODE',{startedAt:now()});
    if(action==='SET_MODE' && s.phase==='MODE' && payload.mode==='PRACTICE')return commit('LOADING');
    if(action==='PREPARE' && s.phase==='LOADING' && payload.packets?.length && Number.isInteger(payload.index) && payload.index>=0 && payload.index<payload.packets.length)
      return commit('VERIFYING_IMAGE',{packets:payload.packets,questionIndex:payload.index,questionId:payload.packets[payload.index].questionId,visual:null,selected:null,graded:null});
    if(action==='DISPLAY_VERIFIED' && s.phase==='VERIFYING_IMAGE' && payload.question?.questionId===s.questionId &&
      payload.question?.choices?.length===s.packets[s.questionIndex].choices.length &&
      payload.question.instruction==='番号で答えてください。')return commit('ANSWER_WAIT',{visual:payload.question});
    if(action==='ANSWER' && s.phase==='ANSWER_WAIT'){
      const n=Number(payload.value),p=s.packets[s.questionIndex];
      if(!Number.isInteger(n)||n<1||n>p.choices.length)return fail('INVALID_ANSWER');
      const correct=n===p.correctAnswer;const grade=Object.freeze({selected:n,correct,correctAnswer:p.correctAnswer,answerPdfUrl:p.answerPdfUrl,questionId:p.questionId});
      return commit('GRADED',{selected:n,graded:grade,wrongStreak:correct?0:s.wrongStreak+1,history:[...s.history,grade]});
    }
    if(action==='NEXT' && s.phase==='GRADED'){
      if(s.wrongStreak>=3)return commit('REVIEW_BLOCKED');
      if(s.questionIndex+1>=s.packets.length)return commit('FINISHED');
      return commit('LOADING',{questionIndex:s.questionIndex+1});
    }
    if(action==='END' && ['MODE','LOADING','VERIFYING_IMAGE','ANSWER_WAIT','GRADED','REVIEW_BLOCKED','FINISHED'].includes(s.phase))return commit('FINISHED',{endedAt:now()});
    if(action==='FAIL' && ['LOADING','VERIFYING_IMAGE'].includes(s.phase))return commit('FAILED',{failureCode:payload.code||'UNVERIFIED_QUESTION'});
    return fail('TRANSITION_FORBIDDEN');
  }
  return Object.freeze({state:result,dispatch:transition});
}
export async function verifyPngBytes(bytes,expectedSha,subtle=globalThis.crypto?.subtle){
  assert(bytes instanceof ArrayBuffer && hex256(expectedSha) && subtle?.digest,'HASH_VERIFICATION_UNAVAILABLE');
  const h=[...new Uint8Array(await subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  assert(h===expectedSha,'IMAGE_SHA256_MISMATCH');
  const a=new Uint8Array(bytes);assert(a.length>8 && [137,80,78,71,13,10,26,10].every((x,i)=>a[i]===x),'IMAGE_NOT_PNG');
  return true;
}