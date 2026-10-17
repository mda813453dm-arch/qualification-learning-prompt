"""賃管アダプタのテスト（合成PDF）。問題の読み取りは宅建と同じなので、正解番号表の読み方を確かめる。

実行: cd 新システム開発/parser && python -m unittest discover -s tests
"""

import unittest

import fitz

from qlp_parser.adapters import chintai
from qlp_parser.core import ANSWER_SPECIAL


def answer_pdf(rows, note=None):
    """rows: [(左の問番号, 左の正解, 右の問番号, 右の正解)]。公式と同じ「問n 正解」が2列に並ぶ表。"""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((150, 50), "第13回賃貸不動産経営管理士試験 正解番号表", fontname="japan", fontsize=11)
    y = 90
    for ln, lv, rn, rv in rows:
        page.insert_text((80, y), f"問{ln}", fontname="japan", fontsize=10)
        page.insert_text((200, y), lv, fontname="japan", fontsize=10)
        page.insert_text((330, y), f"問{rn}", fontname="japan", fontsize=10)
        page.insert_text((450, y), rv, fontname="japan", fontsize=10)
        y += 20
    if note:
        page.insert_text((80, y + 20), note, fontname="japan", fontsize=10)
    return doc


class ChintaiAnswers(unittest.TestCase):
    def test_pairs_two_columns(self):
        rows = [(n, str(n % 4 + 1), n + 25, str((n + 1) % 4 + 1)) for n in range(1, 26)]
        a = chintai.parse_answers(answer_pdf(rows))
        self.assertEqual(len(a), 50)
        self.assertEqual(a[1], 2)
        self.assertEqual(a[26], 3)
        self.assertEqual(a[50], (25 + 1) % 4 + 1)

    def test_no_single_answer_is_special(self):
        rows = [(n, "1", n + 25, "2") for n in range(1, 26)]
        rows[8] = (9, "-", 34, "3")  # 問9：正解「-」（全員正解）
        rows[6] = (7, "4", 32, "正解なし")
        rows[4] = (5, "1、3", 30, "2")  # 2つ正解
        a = chintai.parse_answers(answer_pdf(rows, note="問9については、全ての解答を正解として取り扱うこと"))
        self.assertEqual(a[9], ANSWER_SPECIAL)
        self.assertEqual(a[32], ANSWER_SPECIAL)
        self.assertEqual(a[5], ANSWER_SPECIAL)
        self.assertEqual(a[34], 3)
        self.assertEqual(a[30], 2)
        self.assertEqual(a[7], 4)


if __name__ == "__main__":
    unittest.main()
