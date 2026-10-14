import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUALIFICATION_MASTER } from "../src/qualification-master.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const reportPath=path.join(root,"年度更新チェック結果.md");
const now=new Date().toISOString();
const records=Object.values(QUALIFICATION_MASTER);
const results=[];

for(const q of records){
  if(!q.pastQuestionsUrl){results.push({name:q.name,status:"NO_SOURCE",http:null,url:""});continue;}
  try{
    const res=await fetch(q.pastQuestionsUrl,{redirect:"follow",headers:{"user-agent":"qualification-learning-system/1.0"}});
    results.push({name:q.name,status:res.ok?"REACHABLE":"HTTP_ERROR",http:res.status,url:q.pastQuestionsUrl});
  }catch(e){results.push({name:q.name,status:"FETCH_ERROR",http:null,url:q.pastQuestionsUrl});}
}
const ok=results.filter(x=>x.status==="REACHABLE").length;
const bad=results.length-ok;
let md=`# 年度更新チェック結果\n\n実行日時: ${now}\n\n対象資格: ${results.length}\n\n参照先到達: ${ok}\n\n要確認: ${bad}\n\n> この処理は登録済み公式参照先の到達性を確認します。新年度PDFのURLを推測・自動登録しません。\n\n| 資格 | 状態 | HTTP | 参照先 |\n|---|---|---:|---|\n`;
for(const r of results) md+=`| ${r.name.replaceAll("|","\\|")} | ${r.status} | ${r.http??""} | ${r.url? `[確認](${r.url})`:""} |\n`;
fs.writeFileSync(reportPath,md,"utf8");
console.log(JSON.stringify({status:"completed",checked:results.length,reachable:ok,needsReview:bad,report:path.basename(reportPath)}));
if(results.length!==103) process.exit(2);
