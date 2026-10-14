// Fixed UI choice contract shared by ChatGPT/Claude/Perplexity.
// AI clients must render these labels, order and counts verbatim.
export const FIXED_UI_CHOICES = Object.freeze({
  EXEMPTION_USE_CONFIRM: Object.freeze({
    prompt: "免除制度を利用しますか？",
    choices: Object.freeze(["免除を利用する", "免除を利用しない"]),
    answerInstruction: "番号で答えてください。"
  }),
  PLAN_START_CONFIRM: Object.freeze({
    prompt: "この学習計画で学習を開始しますか？",
    choices: Object.freeze(["学習を開始する", "今は学習しない"]),
    answerInstruction: "番号で答えてください。"
  }),
  PLAN_EDIT_MENU: Object.freeze({
    prompt: "学習計画のどの部分を見直しますか？",
    choices: Object.freeze([
      "学習分野・優先順位",
      "学習方法・配分",
      "復習頻度・タイミング",
      "その他",
      "戻る"
    ]),
    answerInstruction: "番号で答えてください。"
  }),
  PLAN_EDIT_METHOD: Object.freeze({
    prompt: "学習方法・配分を選んでください。",
    choices: Object.freeze([
      "解説重視",
      "確認問題重視",
      "実践問題重視",
      "バランス型",
      "自分で配分指定",
      "戻る"
    ]),
    answerInstruction: "番号で答えてください。"
  }),
  PLAN_EDIT_REVIEW: Object.freeze({
    prompt: "復習頻度・タイミングを選んでください。",
    choices: Object.freeze([
      "集中型（当日・翌日・3日後・7日後）",
      "標準型（翌日・3日後・7日後）",
      "ゆっくり型（3日後・7日後・14日後）",
      "AI調整型",
      "自分で間隔指定",
      "戻る"
    ]),
    answerInstruction: "番号で答えてください。"
  })
});

export function getFixedUiScreen(screenId) {
  const screen = FIXED_UI_CHOICES[screenId];
  if (!screen) throw new Error(`Unknown fixed UI screen: ${screenId}`);
  return screen;
}

export function renderFixedUiScreen(screenId) {
  const screen = getFixedUiScreen(screenId);
  return [
    screen.prompt,
    "",
    ...screen.choices.flatMap((label, index) => [`${index + 1}. ${label}`, ""]),
    screen.answerInstruction
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}
