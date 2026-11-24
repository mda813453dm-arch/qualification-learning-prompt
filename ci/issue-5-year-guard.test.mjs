import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const mod = await import(pathToFileURL(resolve(process.argv.slice(2)[0] ?? process.env.ISSUE5_WIDGET)).href);
const html = mod.widgetHtml();
const start = html.indexOf('  function descriptiveSupportedYear');
const end = html.indexOf('  // 年度の判定結果に対応', start);
assert.ok(start > 0 && end > start);
const parse = runInNewContext(html.slice(start,end) + '\ndescriptiveTopicYearInfo');
const pair = topic => { const {year,issue}=parse(topic);return [year,issue]; };
for(const [topic, expected] of [
  ['2100年度 午後の部 第21問',[2100,'unsupported']],
  ['1899年度 午後の部 第21問',[1899,'unsupported']],
  ['０２２２年度 午後の部 第21問',[222,'unsupported']],
  ['10000年度 午後の部 第21問',[null,'unreadable']],
  ['2025年度かR8年度 午後の部 第21問',[null,'ambiguous']],
  ['2025年度（R7年度） 午後の部 第21問',[2025,null]],
  ['2022年度 午後の部 第21問（築26年の建物）',[2022,null]],
  ['午後の部 第21問（築 26 年の建物）',[null,null]],
  ['2025年度か26年度 午後の部 第21問',[null,'unreadable']],
  ['令和100年度 午後の部 第21問',[2118,'unsupported']],
  ['昭和50年度 午後の部 第21問',[null,'unreadable']],
  ['令和8年度 午後の部 第21問',[2026,'unsupported']],
  ['２０２６年度 午後の部 第21問',[2026,'unsupported']],
  ['平成18年度 午後の部 第21問',[2006,'unsupported']],
  ['2025年度と2026年度 午後の部 第21問',[null,'ambiguous']]
]) test(topic, () => assert.deepEqual(pair(topic),expected));
