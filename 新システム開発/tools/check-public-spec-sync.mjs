import { execFileSync } from "node:child_process";

const base = process.env.SPEC_SYNC_BASE || process.argv[2];
const head = process.env.SPEC_SYNC_HEAD || process.argv[3] || "HEAD";
if (!base) {
  console.error("SPEC_SYNC_BASE is required");
  process.exit(2);
}
const out = execFileSync("git", ["diff","--name-only",base,head], {encoding:"utf8"});
const changed = out.split(/\r?\n/).filter(Boolean);
const publicSpec = "新システム開発/資格学習システム_現行総合仕様書_20261014.md";
const ignored = [
  /^新システム開発\/.*\.test\.(?:js|mjs|cjs)$/,
  /^\.github\/workflows\//,
  /^新システム開発\/tools\//,
  /^新システム開発\/仕様書同期運用ルール\.md$/
];
const impact = changed.filter(p => {
  if (ignored.some(re => re.test(p))) return false;
  if (p === publicSpec) return false;
  if (p === "main/master_prompt.txt") return false;
  return p === "新システム開発/AIアプリ学習開始プロンプト_開発テスト版.md"
    || /^新システム開発\/src\//.test(p)
    || /^新システム開発\/.*(?:仕様|マスタ|プロンプト).*\.md$/.test(p);
});
if (impact.length && !changed.includes(publicSpec)) {
  console.error("PUBLIC_SPEC_SYNC_REQUIRED");
  console.error("仕様影響ファイル:");
  for (const p of impact) console.error(" - "+p);
  console.error("公開向け総合仕様書も同じ変更単位で更新してください: "+publicSpec);
  process.exit(1);
}
console.log(JSON.stringify({status:"ok", specificationImpact:impact, publicSpecUpdated:changed.includes(publicSpec)}));
