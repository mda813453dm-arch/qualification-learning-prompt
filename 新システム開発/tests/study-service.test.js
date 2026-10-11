import test from "node:test";
import assert from "node:assert/strict";
import { createMemorySessionStore } from "../src/session-store.js";
import { createStudyService } from "../src/study-service.js";
test("外部サービスから学習開始・更新・読み出し", async () => {
  const service = createStudyService(createMemorySessionStore());
  await service.start("verified-a", "宅建");
  const result = await service.message("verified-a", "復習したい");
  assert.equal(result.action, "review");
  assert.equal((await service.get("verified-a")).mode, "review");
});
test("別ユーザーの状態を読み出さない", async () => {
  const service = createStudyService(createMemorySessionStore());
  await service.start("verified-a", "宅建");
  assert.equal(await service.get("verified-b"), null);
  assert.equal((await service.message("verified-b", "過去問を出して")).action, "start_required");
});
test("本人識別なしでは操作不可", async () => {
  const service = createStudyService(createMemorySessionStore());
  await assert.rejects(service.start("", "宅建"), /AUTHENTICATED_USER_REQUIRED/);
  await assert.rejects(service.get(""), /AUTHENTICATED_USER_REQUIRED/);
  await assert.rejects(service.message("", "復習"), /AUTHENTICATED_USER_REQUIRED/);
});
test("資格変更は確定API経由", async () => {
  const service = createStudyService(createMemorySessionStore());
  await service.start("verified-a", "宅建");
  const pending = await service.message("verified-a", "通関士に切り替えて");
  assert.equal(pending.action, "resolve_qualification");
  assert.equal((await service.get("verified-a")).qualification, "宅建");
  await service.confirmQualification("verified-a", "通関士");
  assert.equal((await service.get("verified-a")).qualification, "通関士");
});
test("未実装の公式採点を勝手に行わない", async () => {
  const service = createStudyService(createMemorySessionStore());
  await service.start("verified-a", "宅建");
  const result = await service.message("verified-a", "過去問を出して");
  assert.equal(result.action, "request_verified_question");
  assert.equal(result.session.pendingQuestion, null);
});
