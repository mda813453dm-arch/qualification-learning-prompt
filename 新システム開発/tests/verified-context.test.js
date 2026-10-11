import test from "node:test";
import assert from "node:assert/strict";
import { createVerifiedContextAdapter } from "../src/verified-context.js";
import { createStudyService } from "../src/study-service.js";
import { createMemorySessionStore } from "../src/session-store.js";

function setup() {
  const service = createStudyService(createMemorySessionStore());
  return createVerifiedContextAdapter({
    service,
    verify: async context => context?.serverIdentity ?? null
  });
}
test("検証済みの識別情報から開始・復帰", async () => {
  const adapter = setup();
  const ctx = { serverIdentity: { verified: true, subject: "a" } };
  await adapter.start(ctx, "宅建");
  await adapter.message(ctx, "復習したい");
  assert.equal((await adapter.get(ctx)).mode, "review");
});
test("未検証の入力は拒否", async () => {
  const adapter = setup();
  await assert.rejects(adapter.start({ userId: "a" }, "宅建"), /IDENTITY_NOT_VERIFIED/);
  await assert.rejects(adapter.get({ serverIdentity: { subject: "a" } }), /IDENTITY_NOT_VERIFIED/);
});
test("利用者ごとに状態を分離", async () => {
  const adapter = setup();
  const a = { serverIdentity: { verified: true, subject: "a" } };
  const b = { serverIdentity: { verified: true, subject: "b" } };
  await adapter.start(a, "宅建");
  await adapter.start(b, "測量士補");
  assert.equal((await adapter.get(a)).qualification, "宅建");
  assert.equal((await adapter.get(b)).qualification, "測量士補");
});
