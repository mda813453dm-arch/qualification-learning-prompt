import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { QUALIFICATION_MASTER } from "../src/qualification-master.js";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const table=path.join(root,"資格マスタ閲覧表_103資格.md");
if(Object.keys(QUALIFICATION_MASTER).length!==103) throw new Error("master must contain 103 qualifications");
const before=fs.existsSync(table)?fs.readFileSync(table,"utf8"):"";
execFileSync(process.execPath,[path.join(root,"tools/generate-qualification-master-view.mjs")],{stdio:"inherit"});
const after=fs.readFileSync(table,"utf8");
if(process.argv.includes("--check")&&before!==after){fs.writeFileSync(table,before,"utf8");throw new Error("qualification master view is stale; run node tools/generate-qualification-master-view.mjs");}
console.log(JSON.stringify({status:"synced",count:103}));
