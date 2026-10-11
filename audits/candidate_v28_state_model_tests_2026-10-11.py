#!/usr/bin/env python3
"""Reference state-model checks for candidate v28 (F5-F7).
NOT a live AI execution: this is a deterministic decision table that encodes the v28 rules
(B09d/B09f/B07 answer-cell gate, X-section same-response completion, B08/B10 tool-absence,
B15 -> B09 acquisition) plus static text assertions on the candidate file.
usage: python3 -I candidate_v28_state_model_tests_2026-10-11.py <v27> <v28>
"""
import itertools
import sys

v27 = open(sys.argv[1], encoding="utf-8").read()
v28 = open(sys.argv[2], encoding="utf-8").read()

results = []


def check(name, got, expected):
    ok = got == expected
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + f"{name} -> {got} (expected {expected})")


# ---------------------------------------------------------------- A. answer-cell gate (B09d/f, B07)
def cell_gate(layer, page_image, image_value_matches=True, relay_double_read=True,
              other_candidates=False, year_fixed=True):
    """layer: 'explicit_pair' | 'separate_rows' | 'not_found'
    page_image: 'viewed' | 'attached' | 'unavailable' | 'unreadable'
    returns outcome of the candidate gate."""
    if layer == "explicit_pair":
        return "CONFIRMED"            # text-layer direct confirmation; image not required
    # separate rows / not found: positional inference only -> relay re-reads never substitute
    if page_image in ("viewed", "attached"):
        return "CONFIRMED" if image_value_matches else "CANDIDATE_FAIL"
    # image route not executable or unreadable
    if other_candidates and not year_fixed:
        return "NEXT_CANDIDATE"       # B07 keeps going while executable routes remain
    return "B10_MENU"                 # exhausted -> U06 (attach), never a graded question


check("A1 explicit pair in text layer, no image", cell_gate("explicit_pair", "unavailable"), "CONFIRMED")
check("A2 separate rows + page image viewed", cell_gate("separate_rows", "viewed"), "CONFIRMED")
check("A3 separate rows + relay double read, no image (R7 q29 case)",
      cell_gate("separate_rows", "unavailable", relay_double_read=True), "B10_MENU")
check("A4 separate rows, no image, year not fixed, other candidate remains",
      cell_gate("separate_rows", "unavailable", other_candidates=True, year_fixed=False), "NEXT_CANDIDATE")
check("A5 separate rows + user attached PDF/image", cell_gate("separate_rows", "attached"), "CONFIRMED")
check("A6 image value differs from positional guess", cell_gate("separate_rows", "viewed", image_value_matches=False),
      "CANDIDATE_FAIL")
check("A7 table not found in text + image unreadable", cell_gate("not_found", "unreadable"), "B10_MENU")
check("A8 table not found + image viewed", cell_gate("not_found", "viewed"), "CONFIRMED")
check("A9 separate rows, no image, year fixed, other candidates exist (fixed year wins)",
      cell_gate("separate_rows", "unavailable", other_candidates=True, year_fixed=True), "B10_MENU")


# ---------------------------------------------------------------- B. response validity (X section)
def response_valid(r):
    """r: dict of flags describing a drafted response. returns 'VALID:<exit>' or 'INVALID'."""
    if r.get("u14_shown"):
        # U14 response: X2 only, no next question
        return "INVALID" if r.get("next_question_shown") else "VALID:X2"
    if r.get("forced_stop_evidence"):
        return "VALID:X6"
    if r.get("end_log"):
        return "VALID:X4"
    if r.get("explanation_only_user_request") and not r.get("next_question_shown"):
        return "VALID:X5"
    if r.get("explanation_shown") and r.get("resume_unanswered_shown"):
        return "VALID:X1"             # B17g: explanation + re-display of unanswered question
    if r.get("announcement_only") or (r.get("explanation_shown") and not (
            r.get("next_question_shown") or r.get("menu_shown") or r.get("b10_menu_shown")
            or r.get("material_request_shown"))):
        return "INVALID"
    if r.get("next_question_shown"):
        return "VALID:X1"
    if r.get("menu_shown") or r.get("b10_menu_shown"):
        return "VALID:X2"
    if r.get("material_request_shown"):
        return "VALID:X3"
    return "INVALID"


check("B1 Grok-type: explanation + '次の問題に進みます' only",
      response_valid({"explanation_shown": True, "announcement_only": True}), "INVALID")
check("B2 announcement only (no explanation)", response_valid({"announcement_only": True}), "INVALID")
check("B3 explanation then complete next question (U14 answered '1')",
      response_valid({"explanation_shown": True, "next_question_shown": True}), "VALID:X1")
check("B4 skip ('2') then complete next question",
      response_valid({"next_question_shown": True}), "VALID:X1")
check("B5 explanation then B10 menu after proven exhaustion",
      response_valid({"explanation_shown": True, "b10_menu_shown": True}), "VALID:X2")
check("B6 U14 shown alone", response_valid({"u14_shown": True}), "VALID:X2")
check("B7 U14 shown with next question", response_valid({"u14_shown": True, "next_question_shown": True}), "INVALID")
check("B8 explanation only, user said '説明だけ'",
      response_valid({"explanation_shown": True, "explanation_only_user_request": True}), "VALID:X5")
check("B9 explanation + re-display of unanswered question (B17g)",
      response_valid({"explanation_shown": True, "resume_unanswered_shown": True}), "VALID:X1")
check("B10 explanation then reinforcement menu U21", response_valid({"explanation_shown": True, "menu_shown": True}),
      "VALID:X2")
check("B11 forced stop evidence", response_valid({"explanation_shown": True, "forced_stop_evidence": True}), "VALID:X6")
check("B12 end log", response_valid({"end_log": True}), "VALID:X4")
check("B13 explanation then material request after limited recovery (X3)",
      response_valid({"explanation_shown": True, "material_request_shown": True}), "VALID:X3")


# ---------------------------------------------------------------- C. next-action exit after B15 (same response)
def exit_after_b15(route, fetch="ok"):
    """route: 'practice' | 'reinforce' | 'menu' | 'review' | 'end' | 'next_item'
    fetch (practice only): 'ok' | 'exhausted' | 'tool_absent' | 'forced_stop'"""
    if route == "practice":
        return {"ok": "X1", "exhausted": "X2:B10", "tool_absent": "X2:B10(Web利用不能)",
                "forced_stop": "X6"}[fetch]
    if route == "reinforce":
        return "X1:B11"
    if route in ("menu",):
        return "X2"
    if route == "end":
        return "X4"
    if route in ("review", "next_item"):
        return "X1/X2"                # B16/B17 prepare and show the next screen in the same response
    raise ValueError(route)


check("C1 practice, fetch ok", exit_after_b15("practice", "ok"), "X1")
check("C2 practice, exhausted", exit_after_b15("practice", "exhausted"), "X2:B10")
check("C3 practice, tool absent (observed)", exit_after_b15("practice", "tool_absent"), "X2:B10(Web利用不能)")
check("C4 practice, forced stop", exit_after_b15("practice", "forced_stop"), "X6")
check("C5 reinforcement route", exit_after_b15("reinforce"), "X1:B11")
check("C6 menu route", exit_after_b15("menu"), "X2")
check("C7 end route", exit_after_b15("end"), "X4")
check("C8 review / next item route", exit_after_b15("review"), "X1/X2")


# ---------------------------------------------------------------- D. termination of acquisition loop (B07/B10/B15 gate)
def run_cycle(successes):
    """successes: tuple of booleans, one per executable residual operation (B07 limits).
    Model of B08->B09->B07->(B10). Returns (exit, steps)."""
    steps = 0
    for ok in successes:
        steps += 1
        if ok:
            return "X1", steps
    return "X2:B10", steps            # all operations tried -> B10; B10 never re-enters with unchanged queue


max_steps = 0
bad = 0
for n in range(0, 7):
    for pat in itertools.product([False, True], repeat=n):
        ex, st = run_cycle(pat)
        max_steps = max(max_steps, st)
        if ex not in ("X1", "X2:B10") or st > n:
            bad += 1
check("D1 exhaustive acquisition patterns (len 0..6): always ends in X1 or X2:B10 within queue size", bad, 0)
check("D2 B10 -> B08 return only if queue shrinks (loop guard in v27 B10, unchanged)",
      "B10からの復帰は未試行キューが実際に減る場合だけ認め" in v28, True)

# ---------------------------------------------------------------- E. static text assertions
def count(t, s):
    return t.count(s)


check("E1 v27 unchanged line count", len(v27.split("\n")), 507)
check("E2 v28 line count (no line added/removed)", len(v28.split("\n")), 507)
check("E3 B09d standard present once", count(v28, "【正答表の直接確認の基準】"), 1)
check("E4 positional guess never substitutes (B09d)", count(v28, "並び順の推測を直接確認の代用にしない"), 1)
check("E5 B09f says double read does not replace direct confirmation", count(v28, "二重読取は並び順の推測を直接確認に代えない"), 1)
check("E6 B07 covers separate-row extraction", count(v28, "問番号の行と正答値の行が分離して抽出され並び順から対応を推測する必要がある場合もB09dに従い"), 1)
check("E7 canonical same-response rule appears as the single definition", count(v28, "【解説後・次行動確定後の同一応答完了（唯一の正本）】"), 1)
check("E8 pointers to the canonical rule (B14, B15 exits)", count(v28, "X節【解説後・次行動確定後の同一応答完了】"), 2)
check("E9 announcement text forbidden as a completion", count(v28, "「次の問題に進みます」等の次行動の予告や宣言だけの応答"), 1)
check("E10 B15 gate no longer limited to confirmation->practice", count(v28, "他の復帰経路で公式実践へ進むとき"), 0)
check("E11 old B10 'tool unusable -> X6' wording removed", count(v28, "ただしツールそのものが使用不能な場合はX6"), 0)
check("E12 tool-absence observation rule in B08", count(v28, "呼出手段が最初から無いことを確認できた場合は「Web利用不能」としてD09に記録し"), 1)
check("E13 B07 evidence clause for tool absence", count(v28, "呼出手段が最初から無い場合は、B08で観測した「Web利用不能」の記録をこの実行証拠とする。"), 1)
check("E14 Z7a covers D09-not-yet-created transition", count(v28, "B15が公式実践（B09）への遷移を確定済みでD09が未作成"), 1)
check("E15 X6 strictness paragraph untouched", count(v28, "【X6厳格化】") == count(v27, "【X6厳格化】") == 1, True)
check("E16 U14 definition untouched", v28[v28.index("U14 実践解説要否"):v28.index("U15 時刻確認")] ==
      v27[v27.index("U14 実践解説要否"):v27.index("U15 時刻確認")], True)
check("E17 B13 untouched", v28[v28.index("B13 訂正・限定復旧"):v28.index("B14 実践採点後の解説")] ==
      v27[v27.index("B13 訂正・限定復旧"):v27.index("B14 実践採点後の解説")], True)
check("E18 D/U/H sections untouched",
      v28[:v28.index("◆ X. 送信可能な応答出口")] == v27[:v27.index("◆ X. 送信可能な応答出口")], True)

check("E19 same-response rule covers every graded/explained response, not only U14 answers",
      count(v28, "採点（U12・U13・U22・U25）・解説・解説省略のいずれかを処理した応答でB15の行先が確定したなら、"), 1)
check("B14 confirmation question graded (U22) then next screen in the same response",
      response_valid({"next_question_shown": True}), "VALID:X1")
check("B15 confirmation graded, announcement only (adjacent stall path)",
      response_valid({"announcement_only": True}), "INVALID")

print()
print(f"Total: {sum(results)}/{len(results)} passed; failures: {len(results) - sum(results)}")
print("These checks run a deterministic reference model of the v28 rules and static text assertions.")
print("They are NOT a live LLM execution and do not validate real PDF fetching, tool use, or model adherence.")
sys.exit(0 if all(results) else 1)
