import test from "node:test";
import assert from "node:assert/strict";
import { QUALIFICATION_MASTER } from "../src/qualification-master.js";
test("annual update runner has exactly 103 registered sources",()=>{
 assert.equal(Object.keys(QUALIFICATION_MASTER).length,103);
 for(const q of Object.values(QUALIFICATION_MASTER)) assert.ok(q.pastQuestionsUrl,q.name);
});
