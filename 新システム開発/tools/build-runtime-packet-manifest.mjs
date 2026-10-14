import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const packetsDir=path.join(root,"data","runtime-packets","verified");
const out=path.join(root,"data","runtime-packets","manifest.generated.json");
const entries=[];
if(fs.existsSync(packetsDir)){
 for(const name of fs.readdirSync(packetsDir).filter(x=>x.endsWith(".json")).sort()){
  const full=path.join(packetsDir,name);
  const raw=fs.readFileSync(full);
  const d=JSON.parse(raw.toString("utf8"));
  if(d.verificationStatus!=="verified_official" || !Array.isArray(d.packets) || !d.packets.length)
    throw new Error(`UNVERIFIED_PACKET_FILE:${name}`);
  for(const q of d.packets){
    if(q.packetStatus!=="verified_official" ||
       q.verification?.questionText!=="official_pdf_checked" ||
       q.verification?.choices!=="official_pdf_checked" ||
       q.verification?.answer!=="same_year_official_answer_checked")
      throw new Error(`PACKET_EVIDENCE_INCOMPLETE:${name}`);
  }
  const sourceHash=crypto.createHash("sha256").update(raw).digest("hex");
  entries.push({
    qualificationId:d.qualificationId,fieldId:d.fieldId,year:d.year??d.packets[0]?.year??null,
    packetCount:d.packets.length,verificationStatus:"verified_official",
    generatedFromSha256:sourceHash,
    packetUrl:`https://raw.githubusercontent.com/mda813453dm-arch/qualification-learning-prompt/ai-learning-system/新システム開発/data/runtime-packets/verified/${encodeURIComponent(name)}`
  });
 }
}
fs.writeFileSync(out,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),entries},null,2)+"\n");
console.log(JSON.stringify({status:"ready",entries:entries.length,out}));
