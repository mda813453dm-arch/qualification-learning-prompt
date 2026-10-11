import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, INTENTS } from "../src/intent-router.js";
const cases = [
  ["過去問を5問解きたい", INTENTS.PRACTICE],
  ["抵当権を基礎から教えて", INTENTS.EXPLAIN],
  ["もっと簡単に説明して", INTENTS.EXPLAIN],
  ["さっき間違えたところを復習", INTENTS.REVIEW],
  ["測量士補に切り替えて", INTENTS.SWITCH],
  ["今日はここまで", INTENTS.STOP],
  ["抵当権とは？", INTENTS.QUESTION],
  ["今日は10分しかない", INTENTS.AMBIGUOUS],
  ["", INTENTS.AMBIGUOUS]
];
for (const [input, expected] of cases) test(JSON.stringify(input), () => {
  assert.equal(classifyIntent(input).intent, expected);
});
test("入力を変更しない", () => {
  const input = "過去問を5問解きたい";
  assert.equal(classifyIntent(input).intent, INTENTS.PRACTICE);
  assert.equal(input, "過去問を5問解きたい");
});
