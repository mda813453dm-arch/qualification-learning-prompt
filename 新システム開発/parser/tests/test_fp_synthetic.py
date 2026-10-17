"""FPアダプタのテスト（合成PDF）。公表問題の形（各問の直後に「正解 …」）を確かめる。

実行: cd 新システム開発/parser && python -m unittest discover -s tests
"""

import unittest

import fitz

from qlp_parser.cli import run
from qlp_parser.core import PdfSource


def make_pdf():
    doc = fitz.open()
    page = doc.new_page()
    y = 60

    def put(text, x=60):
        nonlocal y
        page.insert_text((x, y), text, fontname="japan", fontsize=10)
        y += 18

    put("問１")
    put("労働者災害補償保険の保険料は、その全額を事業主が負担する。")
    put("正解 ○")
    y += 10
    put("問２")
    put("下記の〈資料〉に基づく保険料の控除額は、（   ）である。")
    put("〈資料〉")
    top = y - 10
    put("一般の生命保険料 10万円", 80)
    put("個人年金保険料 10万円", 80)
    page.draw_rect(fitz.Rect(70, top, 400, y - 6), color=(0, 0, 0), width=0.8)
    page.draw_line((70, top + 18), (400, top + 18), color=(0, 0, 0), width=0.5)
    y += 6
    put("1) ４万円")
    put("2) ８万円")
    put("3) 12万円")
    put("正解 2)")
    put("－1－", 280)
    return doc.tobytes()


class FpSynthetic(unittest.TestCase):
    def test_true_false_and_three_choice(self):
        r = run("fp3", 2026, PdfSource(data=make_pdf(), url="https://example.invalid/g3.pdf"), section="2026年5月", assets={})
        self.assertEqual(r["status"], "ready", r)
        q1, q2 = r["packets"]
        self.assertEqual(q1["choices"], ["〇", "×"])
        self.assertEqual(q1["correctAnswer"], 1)
        self.assertEqual(q1["fieldId"], "f1")
        self.assertEqual(q2["choices"], ["４万円", "８万円", "12万円"])
        self.assertEqual(q2["correctAnswer"], 2)
        for q in (q1, q2):
            self.assertNotIn("正解", q["stem"] + "".join(q["choices"]), "正解を問題に入れない")
        # 表は公式PDFから切り出し、表の中の文字は本文に入れない
        self.assertEqual(len(q2["figures"]), 1)
        self.assertNotIn("10万円", q2["stem"])


if __name__ == "__main__":
    unittest.main()
