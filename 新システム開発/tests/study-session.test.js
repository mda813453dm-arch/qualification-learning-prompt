import test from "node:test";
import assert from "node:assert/strict";
import { createSession, applyUserMessage, setQualification } from "../src/study-session.js";
test("演習から解説への割り込み", () => {
  const a = applyUserMessage(createSession("宅建"), "過去問を出して");
  assert.equal(a.action, "request_verified_question");
  const b = applyUserMessage(a.session, "その前に抵当権を詳しく説明して");
  assert.equal(b.action, "explain");
  assert.equal(b.session.mode, "conversation");
});
test("資格変更は自動確定しない", () => {
  const a = applyUserMessage(createSession("宅建"), "測量士補に切り替えて");
  assert.equal(a.action, "resolve_qualification");
  assert.equal(a.session.qualification, "宅建");
  assert.equal(setQualification(a.session, "測量士補").qualification, "測量士補");
});
test("復習・中断・曖昧な相談", () => {
  let s = createSession("通関士");
  const a = applyUserMessage(s, "間違えたところを復習したい");
  assert.equal(a.action, "review");
  const b = applyUserMessage(a.session, "今日は10分しかない");
  assert.equal(b.action, "interpret_in_context");
  const c = applyUserMessage(b.session, "今日はここまで");
  assert.equal(c.session.mode, "paused");
});
test("公式採点を実行する権限を持たない", () => {
  const r = applyUserMessage(createSession(), "過去問を出して");
  assert.equal(r.action, "request_verified_question");
  assert.equal(r.session.pendingQuestion, null);
});
test("入力セッションを破壊しない", () => {
  const original = createSession("宅建");
  applyUserMessage(original, "復習したい");
  assert.deepEqual(original.history, []);
});
