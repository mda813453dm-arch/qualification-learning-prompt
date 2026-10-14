import test from "node:test";
import assert from "node:assert/strict";
import { FIXED_UI_CHOICES, renderFixedUiScreen } from "./fixed-ui-choices.js";

test("plan edit menu wording/order/count is fixed", () => {
  assert.deepEqual([...FIXED_UI_CHOICES.PLAN_EDIT_MENU.choices], [
    "学習分野・優先順位","学習方法・配分","復習頻度・タイミング","その他","戻る"
  ]);
  assert.equal(FIXED_UI_CHOICES.PLAN_EDIT_MENU.choices.length, 5);
});

test("review menu wording/order/count is fixed", () => {
  assert.deepEqual([...FIXED_UI_CHOICES.PLAN_EDIT_REVIEW.choices], [
    "集中型（当日・翌日・3日後・7日後）",
    "標準型（翌日・3日後・7日後）",
    "ゆっくり型（3日後・7日後・14日後）",
    "AI調整型","自分で間隔指定","戻る"
  ]);
  assert.equal(FIXED_UI_CHOICES.PLAN_EDIT_REVIEW.choices.length, 6);
});

test("start confirmation wording/order/count is fixed", () => {
  assert.deepEqual([...FIXED_UI_CHOICES.PLAN_START_CONFIRM.choices], [
    "この計画で開始する","学習計画を見直す"
  ]);
  assert.equal(FIXED_UI_CHOICES.PLAN_START_CONFIRM.choices.length, 2);
});

test("render uses numbered fixed labels", () => {
  const rendered=renderFixedUiScreen("PLAN_EDIT_MENU");
  assert.match(rendered,/1\. 学習分野・優先順位/);
  assert.match(rendered,/5\. 戻る/);
  assert.match(rendered,/番号で答えてください。/);
});
