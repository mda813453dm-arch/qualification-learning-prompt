#!/usr/bin/env python3
"""Reference-model + static checks for candidate v29 (F8: 取得不能条件の記録と引き継ぎ).
NOT a live AI execution: deterministic decision-table model of the B07/B09/B10 rules plus text assertions.
usage: python3 -I candidate_v29_state_model_tests_2026-10-11.py <v28> <v29>
"""
import difflib
import itertools
import sys

v28 = open(sys.argv[1], encoding="utf-8").read()
v29 = open(sys.argv[2], encoding="utf-8").read()
results = []


def check(name, got, expected):
    ok = got == expected
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + f"{name} -> {got} (expected {expected})")


# ------------------------------------------------ F. fetch-loop model (image route unavailable)
def search(formats, image_na=True, rule="v29", attached=False):
    """formats: list of 'SEP'|'PAIR'|'GARBLED' per candidate PDF in exploration order (index 0 = current year).
    Returns (outcome, fetches, skipped_years, fetched_urls)."""
    if attached:
        return ("CONFIRMED_BY_ATTACHMENT", 0, 0, [])
    fetched, run, skipped = [], 0, 0
    for i, f in enumerate(formats):
        if rule == "v29" and image_na and run >= 3:
            skipped = len(formats) - i       # 形式確認を省略 -> 「未確認（同じ条件の可能性）」
            break
        url = f"pdf{i}"
        assert url not in fetched            # 同一URLは再取得しない（モデル上の不変条件）
        fetched.append(url)
        if f == "PAIR":
            return ("CANDIDATE", len(fetched), 0, fetched)
        run = run + 1 if f == "SEP" else 0   # 連続3件は「分離行形式による不成立」の連続
    return ("B10", len(fetched), skipped, fetched)


allsep = ["SEP"] * 10
check("F1 all 10 PDFs separate-row, no image: v28 fetches every PDF", search(allsep, rule="v28")[:3], ("B10", 10, 0))
check("F2 same, v29 stops after 3 consecutive separate-row failures, 7 years marked 未確認", search(allsep)[:3], ("B10", 3, 7))
check("F3 explicit-pair PDF at 3rd position is still found", search(["SEP", "SEP", "PAIR"] + ["SEP"] * 7)[:2], ("CANDIDATE", 3))
check("F4 run resets on non-SEP (garbled) -> continues", search(["SEP", "SEP", "GARBLED", "SEP", "SEP", "SEP", "SEP"])[:3],
      ("B10", 6, 1))
check("F5 image available: early stop rule not engaged",
      search(allsep, image_na=False)[:3], ("B10", 10, 0))
check("F6 user attached image/PDF: image-NA condition not applied", search(allsep, attached=True)[0], "CONFIRMED_BY_ATTACHMENT")

# exhaustive: termination, never more fetches than v28, outcome differs from v28 only by documented early stop
worse = bad = missed = total = 0
for n in range(0, 9):
    for seq in itertools.product(["SEP", "PAIR", "GARBLED"], repeat=n):
        total += 1
        a = search(list(seq), rule="v28")
        b = search(list(seq), rule="v29")
        if b[1] > a[1] or len(set(b[3])) != len(b[3]):
            bad += 1
        if a[0] != b[0]:
            missed += 1                      # v29 stopped early although a later PAIR existed
            if not (b[0] == "B10" and a[0] == "CANDIDATE" and b[2] > 0):
                worse += 1
check(f"F7 exhaustive ({total} sequences, len 0..8): v29 never fetches more than v28 and never repeats a URL", bad, 0)
check("F8 every outcome difference is an early stop with skipped years recorded (no silent loss)", worse, 0)
print(f"INFO  sequences where v29 stops early and misses a later explicit-pair PDF: {missed} of {total} (documented trade-off)")

# ------------------------------------------------ G. static assertions
def count(t, s):
    return t.count(s)


check("G1 v29 line count equals v28", len(v29.split("\n")), len(v28.split("\n")))
changed = [i for i, (a, b) in enumerate(zip(v28.split("\n"), v29.split("\n")), 1) if a != b]
check("G2 exactly 5 lines of v28 changed (D09 l.55, B07 l.283, B10 l.314-315, R l.506)", changed, [55, 283, 314, 315, 506])
check("G3 F8 block appears once", count(v29, "【取得不能条件の記録と引き継ぎ】"), 1)
check("G4 same URL/method not re-run with changed wording", count(v29, "問い方を変えても再実行しない"), 1)
check("G4b observed answer table not re-read even if only the question side is needed", count(v29, "観測済みの正答表は再度読み取らない"), 1)
check("G4c format checks sequential, stop starting at 3 consecutive failures", count(v29, "並行して先取りしない") == count(v29, "連続3件確認された時点で、残りの年度の形式確認を開始せず省略する") == 1, True)
check("G5 transient-retry exception kept", count(v29, "一時障害に限る再試行1回は除く"), 1)
check("G6 user attachments exempt from image-NA condition", count(v29, "利用者が添付した画像・PDFには、ページ画像の手段なしの条件を適用しない"), 1)
check("G7 non-image direct-confirmation routes tried first", count(v29, "ページ画像の手段なしを理由に省略せず先に1回ずつ試す"), 1)
check("G8 relay re-assembled pairs not accepted", count(v29, "中継が並び順から組み直した出力は明示的な組と認めない"), 1)
check("G9 no report-only stop", count(v29, "取得不能条件の報告や探索予定の表示だけで応答を終えず"), 1)
check("G10 skipped years never reported as searched", count(v29, "探索済みとは書かない"), 1)
check("G11 B10 gate counts skipped years as not-remaining only when recorded", count(v29, "省略した年度と理由を記録した上で、実行可能な残余に数えない"), 1)
check("G12 B10 guidance names concrete material", count(v29, "必要な資料を具体的に1件示す（年度・回・区分、確認できた公式PDFのURL"), 1)
check("G13 D09 holds observed conditions", count(v29, "観測済み取得不能条件（種別・対象・観測根拠"), 1)
check("G14 R pointer to v29 record", count(v29, "candidate_v29_audit_and_tests_2026-10-11.md"), 1)
# unchanged sections (everything outside the 4 changed lines is byte-identical by G2); explicit spot checks
for key, a, b in [("X section", "◆ X. 送信可能な応答出口", "◆ Z."), ]:
    pass
check("G15 B09d basis (案A) unchanged", count(v29, "【正答表の直接確認の基準】") == count(v28, "【正答表の直接確認の基準】") == 1, True)
check("G16 same-response completion rule unchanged", count(v29, "【解説後・次行動確定後の同一応答完了（唯一の正本）】"), 1)
check("G17 U06 menu text unchanged", v29[v29.index("U06 過去問準備失敗メニュー"):v29.index("U07")] ==
      v28[v28.index("U06 過去問準備失敗メニュー"):v28.index("U07")], True)
check("G18 B13 unchanged", v29[v29.index("B13 訂正・限定復旧"):v29.index("B14 実践採点後の解説")] ==
      v28[v28.index("B13 訂正・限定復旧"):v28.index("B14 実践採点後の解説")], True)

print()
print(f"Total: {sum(results)}/{len(results)} passed; failures: {len(results) - sum(results)}")
print("Reference model and text assertions only. NOT a live LLM execution; does not validate real fetching or model adherence.")
sys.exit(0 if all(results) else 1)
