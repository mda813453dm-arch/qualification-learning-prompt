import test from "node:test";
import assert from "node:assert/strict";
import { calculateRetentionWindow, classifyPastQuestionRows } from "./past-question-retention.js";

test("latest year plus previous nine years are retained",()=>assert.deepEqual(calculateRetentionWindow(2026),{latestYear:2026,oldestYear:2017,retentionYears:10}));
test("new year shifts the ten-year window",()=>assert.deepEqual(calculateRetentionWindow(2027),{latestYear:2027,oldestYear:2018,retentionYears:10}));
test("unpublished placeholder does not advance latest published year",()=>{
 const r=classifyPastQuestionRows([{year:2027,url:""},{year:2026,url:"q26"},{year:2017,url:"q17"},{year:2016,url:"q16"}]);
 assert.deepEqual(r.window,{latestYear:2026,oldestYear:2017,retentionYears:10});
 assert.deepEqual(r.active.map(x=>x.year),[2026,2017]);
});
