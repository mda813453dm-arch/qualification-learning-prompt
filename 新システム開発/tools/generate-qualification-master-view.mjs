import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUALIFICATION_MASTER } from "../src/qualification-master.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"資格マスタ閲覧表_103資格.md");
const priority=new Map([
["FP技能検定1級","最優先"],["FP技能検定2級","最優先"],["FP技能検定3級","最優先"],["ITパスポート試験","最優先"],["宅地建物取引士","最優先"],
["基本情報技術者試験","高"],["日商簿記検定試験","高"],["行政書士","高"],["社会保険労務士","高"],["第二種電気工事士","高"],["応用情報技術者試験","高"],["保育士","高"],["介護福祉士","高"],["中小企業診断士","高"],["司法書士","高"],["土地家屋調査士","高"],["通関士","高"],["測量士補","高"]
]);
const rank=v=>v==="最優先"?0:v==="高"?1:2;
const esc=v=>String(v??"").replaceAll("|","\\|").replace(/[\r\n]+/g," ");
const records=Object.values(QUALIFICATION_MASTER).sort((a,b)=>rank(priority.get(a.name))-rank(priority.get(b.name))||a.name.localeCompare(b.name,"ja"));
if(records.length!==103) throw new Error(`MASTER_COUNT_MISMATCH:${records.length}`);
const exemption=q=>q.exemption?.status==="verified_present"?(q.exemption.name??"制度あり（検証済み）"):q.exemption?.status==="verified_absent"?"制度なし（検証済み）":q.exemption?.officialEvidenceOfScheme??"未確認";
const verification=q=>q.exemption?.status==="verified_present"&&q.exemption?.scopeStatus==="verified"?"検証済み":q.exemption?.status==="verified_absent"?"検証済み":"未確認・自動適用禁止";
let md="# 資格マスタ閲覧表（全103資格）\n\n> この表は資格マスタから自動生成します。直接編集しないでください。\n\n";
md+="| 優先度 | 資格名 | 分野 | 資格種別 | 実施団体 | 免除制度 | 検証状態 | 公式過去問等 |\n|---|---|---|---|---|---|---|---|\n";
for(const q of records) md+=`| ${priority.get(q.name)??"通常"} | ${esc(q.name)} | ${esc(q.group)} | ${esc(q.type)} | ${esc(q.authority)} | ${esc(exemption(q))} | ${verification(q)} | ${q.pastQuestionsUrl?`[参照先](${q.pastQuestionsUrl})`:"未登録"} |\n`;
fs.writeFileSync(output,md,"utf8");
console.log(JSON.stringify({status:"generated",count:records.length,output:path.relative(root,output)}));
