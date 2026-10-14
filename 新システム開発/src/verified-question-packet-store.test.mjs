import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  validateVerifiedQuestionPacketStore,
  resolveVerifiedPracticeSet,
  buildLearnerQuestion,
  gradeVerifiedQuestion
} from "./verified-question-packet-store.js";

const storePath = fileURLToPath(new URL("../data/verified-question-packets/q063/surveying-law-r4.json", import.meta.url));
const store = JSON.parse(fs.readFileSync(storePath, "utf8"));

const validation = validateVerifiedQuestionPacketStore(store);
assert.equal(validation.status, "ready");
assert.equal(validation.packetCount, 3);

const set = resolveVerifiedPracticeSet(store, {
  qualificationId: "q063",
  fieldId: "q063.surveying_law",
  recentQuestionIds: [],
  setSize: 3
});
assert.equal(set.status, "ready");
assert.equal(set.sourceMode, "preverified_official_packet");
assert.equal(set.packets.length, 3);
assert.deepEqual(set.packets.map(x => x.questionId), ["q063-r4-no01","q063-r4-no02","q063-r4-no04"]);

for (const packet of set.packets) {
  const rendered = buildLearnerQuestion(packet);
  assert.equal(rendered.status, "ready");
  assert.equal(rendered.choices.length, 5);
  assert.equal(rendered.instruction, "番号で答えてください。");

  const grade = gradeVerifiedQuestion(packet, packet.correctAnswer, store);
  assert.equal(grade.status, "graded");
  assert.equal(grade.correct, true);
  assert.equal(grade.answerSourceUrl, "https://www.gsi.go.jp/common/000241388.pdf");
}

const repeated = resolveVerifiedPracticeSet(store, {
  qualificationId: "q063",
  fieldId: "q063.surveying_law",
  recentQuestionIds: ["q063-r4-no01"],
  setSize: 3
});
assert.equal(repeated.status, "ready");
assert.notEqual(repeated.packets[0].questionId, "q063-r4-no01");

console.log("verified-question-packet-store: PASS");
