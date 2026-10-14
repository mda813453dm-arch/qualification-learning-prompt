import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {OFFICIAL_PDF_PINS} from "../src/official-pdf-pins.js";
const pin=OFFICIAL_PDF_PINS["q038:2025:午後"];
if(!pin) throw new Error("PIN_NOT_FOUND");
async function get(url,expected,out){
 const res=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:"follow"});
 if(!res.ok) throw new Error(`OFFICIAL_PDF_HTTP_${res.status}`);
 const b=Buffer.from(await res.arrayBuffer());
 if(b.subarray(0,5).toString("ascii")!=="%PDF-") throw new Error("PDF_SIGNATURE_INVALID");
 const h=createHash("sha256").update(b).digest("hex");
 if(h!==expected) throw new Error(`SHA256_MISMATCH:${h}`);
 await writeFile(out,b);return {bytes:b.length,sha256:h,url};
}
const tmp=process.env.RUNNER_TEMP||"/tmp";
const question=await get(pin.questionPdfUrl,pin.questionSha256,`${tmp}/land-surveyor-2025-pm-question.pdf`);
const answer=await get(pin.answerPdfUrl,pin.answerSha256,`${tmp}/land-surveyor-2025-pm-answer.pdf`);
console.log(JSON.stringify({status:"verified",qualificationId:"q038",question,answer}));
