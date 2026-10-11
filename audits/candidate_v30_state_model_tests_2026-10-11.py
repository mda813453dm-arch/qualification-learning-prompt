#!/usr/bin/env python3
"""Reference-model + static checks for candidate v30 (F9: no blanket early stop; skip only on pre-fetch format evidence).
NOT a live AI execution: deterministic decision-table model of the B07/B09/B10 acquisition rules plus text assertions.
usage: python3 -I candidate_v30_state_model_tests_2026-10-11.py <v29> <v30>
"""
import difflib
import itertools
import sys

v29 = open(sys.argv[1], encoding="utf-8").read()
v30 = open(sys.argv[2], encoding="utf-8").read()
results = []
LIMIT = 11   # B07: current year + at most 10 other years


def check(name, got, expected):
    ok = got == expected
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + f"{name} -> {got} (expected {expected})")


# ---- candidate = (true_format, hint); true_format in SEP|PAIR|GARBLED ; hint in None|SAME|DIFF
# hint comes only from already-obtained index/official-site information that states the format/method
# (SAME = stated same format & method as an already-observed failure, DIFF = stated different). Name-series alone => None.

def rule_v28(cands):
    """no early stop, no hint use: each URL fetched once in order, up to LIMIT"""
    fetched = 0
    for i, (f, h) in enumerate(cands[:LIMIT]):
        fetched += 1
        if f == "PAIR":
            return ("CANDIDATE", fetched, [])
    return ("B10", fetched, [])


def rule_v29(cands):
    """v29: after 3 consecutive SEP failures stop starting format checks (the rule removed in v30)"""
    fetched, run = 0, 0
    for i, (f, h) in enumerate(cands[:LIMIT]):
        if run >= 3:
            return ("B10", fetched, ["skipped"])
        fetched += 1
        if f == "PAIR":
            return ("CANDIDATE", fetched, [])
        run = run + 1 if f == "SEP" else 0
    return ("B10", fetched, [])


def rule_v30(cands):
    """v30: fetch the first candidate (current year); then order remaining: DIFF first, None next; SAME skipped
    (recorded with basis); unknown-format candidates are never skipped for failure count; bounded by LIMIT."""
    window = cands[:LIMIT]
    order = window[:1] + [c for c in window[1:] if c[1] == "DIFF"] + [c for c in window[1:] if c[1] is None]
    skipped = [c for c in window[1:] if c[1] == "SAME"]
    fetched = 0
    for f, h in order:
        fetched += 1
        if f == "PAIR":
            return ("CANDIDATE", fetched, skipped)
    return ("B10", fetched, skipped)


# ---- H. regression of the 472 sequences that v29 missed (hints absent: name-series alone is not evidence)
seqs = []
for n in range(0, 9):
    for seq in itertools.product(["SEP", "PAIR", "GARBLED"], repeat=n):
        seqs.append([(f, None) for f in seq])
missed_v29 = [s for s in seqs if rule_v29(s)[0] != rule_v28(s)[0]]
check("H1 v29 regression anchor: sequences (len 0..8) where v29 missed a later explicit-pair PDF", len(missed_v29), 472)
check("H2 all 472 are found by v30 (CANDIDATE)", sum(1 for s in missed_v29 if rule_v30(s)[0] == "CANDIDATE"), 472)
check("H3 for ALL 9,841 sequences v30 outcome equals the unbounded search outcome (no missed year)",
      sum(1 for s in seqs if rule_v30(s)[0] != rule_v28(s)[0]), 0)
check("H4 v30 never fetches more than the no-hint search (no repeated URL)",
      sum(1 for s in seqs if rule_v30(s)[1] > rule_v28(s)[1]), 0)
check("H5 v30 fetch count bounded by the B07 limit", max(rule_v30(s)[1] for s in seqs), 8)
check("H6 limit case: 11 SEP candidates -> exactly 11 fetches then B10 (finite)", rule_v30([("SEP", None)] * 11)[:2], ("B10", 11))
check("H7 limit case: 15 candidates, PAIR at 14th is beyond the B07 limit -> not searched (finite, documented)",
      rule_v30([("SEP", None)] * 13 + [("PAIR", None)] + [("SEP", None)])[:2], ("B10", 11))

# ---- I. with pre-fetch format evidence (hints), bounded enumeration
fmts = ["SEP", "PAIR", "GARBLED"]
hints = [None, "SAME", "DIFF"]
miss = more = total = skipped_ok = bad_hint_models = 0
for n in range(1, 6):
    for combo in itertools.product(itertools.product(fmts, hints), repeat=n):
        cands = list(combo)
        # reliability: SAME only on failing formats; DIFF only on non-SEP/GARBLED-equal... DIFF means stated different from
        # the observed failure, so its true format is not SEP
        if any((h == "SAME" and f == "PAIR") or (h == "DIFF" and f == "SEP") for f, h in cands[1:]):
            continue
        total += 1
        a, b = rule_v28(cands), rule_v30(cands)
        if a[0] != b[0]:
            miss += 1
        if b[1] > len(cands[:LIMIT]) - len(b[2]):
            more += 1
        skipped_ok += len(b[2])
check(f"I1 with reliable format evidence ({total} combos): v30 never misses a year the unbounded search finds", miss, 0)
check("I2 with evidence, v30 never fetches a candidate twice nor more than the window minus evidence-skips", more, 0)
print(f"INFO  fetches saved by evidence-based skipping in I-enumeration: {skipped_ok} candidate-skips (all with recorded basis)")
check("I3 same-format-by-evidence candidate is skipped, different-format candidate is tried first",
      (rule_v30([("SEP", None), ("SEP", "SAME"), ("PAIR", "DIFF")]), ),
      ((("CANDIDATE", 2, [("SEP", "SAME")])),))
check("I4 name-series-only (hint None) candidates are NOT skipped -> real v29 miss case found",
      rule_v30([("SEP", None)] * 3 + [("PAIR", None)])[:2], ("CANDIDATE", 4))

# ---- G. static assertions
def count(t, s):
    return t.count(s)


check("G1 line count equals v29", len(v30.split("\n")), len(v29.split("\n")))
changed = [i for i, (a, b) in enumerate(zip(v29.split("\n"), v30.split("\n")), 1) if a != b]
check("G2 exactly 4 lines changed vs v29 (B07 l.283, B10 l.314-315, R l.506)", changed, [283, 314, 315, 506])
check("G3 blanket '連続3件' early stop removed", count(v30, "連続3件"), 0)
check("G4 failure count alone never a reason to skip", count(v30, "連続して失敗した回数だけを理由に省略しない"), 1)
check("G5 pre-fetch format check from index/official info present", count(v30, "すでに取得済みの索引・公式サイトの情報"), 1)
check("G6 different-format candidates tried first", count(v30, "それを優先して試す"), 1)
check("G7 skip allowed only with recorded basis", count(v30, "省略の対象と根拠をD09とB10の表示に残す"), 1)
check("G8 name-series/same-publisher alone is not evidence", count(v30, "同じ形式と確認したことにしない"), 1)
check("G9 unknown-format years count as remaining; no B10 until B07 limit", count(v30, "形式が未確認の年度は実行可能な残余に数え、B07の上限に達するまでB10へ進まない"), 1)
check("G10 one check per candidate, sequential", count(v30, "1候補1回だけ、年度ごとに順番に行い（並行して先取りしない"), 1)
check("G11 no unevidenced 'skipped/explored' claims", count(v30, "根拠のない年度を省略済み・探索済みと書かない"), 1)
check("G12 B10 display distinguishes evidence-skip vs limit-unsearched", count(v30, "上限到達で未探索の年度とを区別して書く"), 1)
check("G13 v29 F8 items kept (record/inherit, no re-run, attachment exemption, relay-pair not accepted, no report-only stop)",
      all(count(v30, s) == 1 for s in ["【取得不能条件の記録と引き継ぎ】", "問い方を変えても再実行しない", "観測済みの正答表は再度読み取らない",
                                          "利用者が添付した画像・PDFには、ページ画像の手段なしの条件を適用しない",
                                          "中継が並び順から組み直した出力は明示的な組と認めない", "取得不能条件の報告や探索予定の表示だけで応答を終えず"]), True)
check("G14 案A (B09d) unchanged", v30[v30.index("【正答表の直接確認の基準】"):v30.index("e 両キー")] ==
      v29[v29.index("【正答表の直接確認の基準】"):v29.index("e 両キー")], True)
check("G15 same-response completion (X section) unchanged", v30[v30.index("◆ X. 送信可能な応答出口"):v30.index("◆ B. 実行ブロック")] ==
      v29[v29.index("◆ X. 送信可能な応答出口"):v29.index("◆ B. 実行ブロック")], True)
check("G16 B14/B15 unchanged", v30[v30.index("B14 実践採点後の解説"):v30.index("B16 ")] == v29[v29.index("B14 実践採点後の解説"):v29.index("B16 ")], True)
check("G17 B13 and U06 unchanged", v30[v30.index("B13 訂正・限定復旧"):v30.index("B14 実践採点後の解説")] ==
      v29[v29.index("B13 訂正・限定復旧"):v29.index("B14 実践採点後の解説")] and
      v30[v30.index("U06 過去問準備失敗メニュー"):v30.index("U07")] == v29[v29.index("U06 過去問準備失敗メニュー"):v29.index("U07")], True)
check("G18 R pointer to v30 record", count(v30, "candidate_v30_audit_and_tests_2026-10-11.md"), 1)

print()
print(f"Total: {sum(results)}/{len(results)} passed; failures: {len(results) - sum(results)}")
print("Reference model and text assertions only. NOT a live LLM execution; does not validate real fetching or model adherence.")
sys.exit(0 if all(results) else 1)
