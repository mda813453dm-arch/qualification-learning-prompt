import test from "node:test";
import assert from "node:assert/strict";
import { createMemorySessionStore } from "../src/session-store.js";
import { applyUserMessage } from "../src/study-session.js";
test("保存してから別の呼び出しで復帰できる", async () => {
  const store = createMemorySessionStore();
  const original = await store.start("user-a", "宅建");
  const updated = applyUserMessage(original, "復習したい").session;
  await store.save("user-a", updated);
  const restored = await store.load("user-a");
  assert.equal(restored.qualification, "宅建");
  assert.equal(restored.mode, "review");
  assert.equal(restored.history.length, 1);
});
test("ユーザー間で保存情報が混ざらない", async () => {
  const store = createMemorySessionStore();
  await store.start("user-a", "宅建");
  await store.start("user-b", "通関士");
  assert.equal((await store.load("user-a")).qualification, "宅建");
  assert.equal((await store.load("user-b")).qualification, "通関士");
});
test("読み出し後の変更は保存済み情報を壊さない", async () => {
  const store = createMemorySessionStore();
  await store.start("user-a", "宅建");
  const copy = await store.load("user-a");
  copy.history.push({ role: "user", text: "改ざん" });
  assert.equal((await store.load("user-a")).history.length, 0);
});
test("不正なユーザーIDを拒否", async () => {
  const store = createMemorySessionStore();
  await assert.rejects(store.start(""), /USER_ID_REQUIRED/);
  await assert.rejects(store.load(" "), /USER_ID_REQUIRED/);
});
