import test from "node:test";
import assert from "node:assert/strict";
import { QUALIFICATION_MASTER, resolveQualification, validateQualificationRecord, planExemption, createPendingQualification } from "./qualification-master.js";

test("宅建の免除は2026年度公式マスタから両AIで同一に判定", () => {
  assert.equal(resolveQualification("宅建").id, "takken");
  assert.equal(validateQualificationRecord(QUALIFICATION_MASTER.takken, 2026).status, "verified");
  assert.equal(planExemption({qualificationName:"宅建"}).status, "needs_user_choice");
});
test("利用時は46-50のみ除外し、分野全体は除外しない", () => {
  assert.deepEqual(planExemption({qualificationName:"宅建",userUsesExemption:true}).excludedQuestionNumbers,[46,47,48,49,50]);
  assert.deepEqual(planExemption({qualificationName:"宅建",userUsesExemption:false}).excludedQuestionNumbers,[]);
});
test("年度違いと未知資格は確定扱いしない", () => {
  assert.equal(planExemption({qualificationName:"宅建",examYear:2027}).status,"blocked");
  assert.equal(planExemption({qualificationName:"未知の資格"}).status,"master_missing");
});
test("AI発見データは自動承認されない", () => {
  const pending=createPendingQualification({id:"x",name:"試験X",year:2026});
  assert.equal(validateQualificationRecord(pending,2026).status,"pending");
});
test("免除範囲が欠けたレコードは学習計画へ反映しない", () => {
  const bad={...QUALIFICATION_MASTER.takken,exemption:{...QUALIFICATION_MASTER.takken.exemption,excludedQuestionNumbers:[]}};
  assert.equal(validateQualificationRecord(bad,2026).status,"pending");
});

test("追加4資格は名称解決でき、未検証の免除範囲を確定扱いしない", () => {
  for (const name of ["土地家屋調査士","測量士","測量士補","通関士"]) {
    assert.ok(resolveQualification(name), name);
    assert.equal(planExemption({qualificationName:name}).status, "blocked", name);
    assert.equal(planExemption({qualificationName:name}).reason, "OFFICIAL_VERIFICATION_REQUIRED", name);
  }
});
