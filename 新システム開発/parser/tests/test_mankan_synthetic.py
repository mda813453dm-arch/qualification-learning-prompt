"""マンション管理士アダプタ（合成PDF）。正解表の形は令和7年度の公式PDF（2列の「問題｜正解」）をまねる。

実行: cd 新システム開発/parser && python -m unittest discover -s tests
"""

import unittest

import fitz

from qlp_parser.adapters import mankan
from qlp_parser.core import ANSWER_SPECIAL, ParseError, RawQuestion


def answer_pdf(title="令和７年度マンション管理士試験正解", special=None):
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((131, 80), title, fontname="japan", fontsize=14)
    for x in (86, 277):
        p.insert_text((x, 96), "問題", fontname="japan", fontsize=14)
        p.insert_text((x + 95, 96), "正解", fontname="japan", fontsize=14)
    for n in range(1, 26):
        y = 111 + (n - 1) * 15
        for base, num in ((93, n), (284, n + 25)):
            ans = special if (special and num == 30) else str(num % 4 + 1)
            p.insert_text((base, y), str(num), fontname="japan", fontsize=14)
            p.insert_text((base + 99, y), ans, fontname="japan", fontsize=14)
    return fitz.open(stream=doc.tobytes(), filetype="pdf")


class Answers(unittest.TestCase):
    def test_two_columns(self):
        a = mankan.parse_answers(answer_pdf())
        self.assertEqual(len(a), 50)
        self.assertEqual(a[1], 2)
        self.assertEqual(a[26], 3)
        self.assertEqual(a[50], 3)

    def test_special(self):
        self.assertEqual(mankan.parse_answers(answer_pdf(special="全員正解"))[30], ANSWER_SPECIAL)

    def test_year(self):
        mankan.check_year(answer_pdf(), 2025)
        with self.assertRaises(ParseError) as e:
            mankan.check_year(answer_pdf(), 2024)
        self.assertEqual(e.exception.code, "ANSWER_YEAR_MISMATCH")
        with self.assertRaises(ParseError):
            mankan.check_year(answer_pdf(title="令和７年度管理業務主任者試験正解"), 2025)


class Fields(unittest.TestCase):
    def test_rules_and_range(self):
        f = lambda n, stem: mankan.classify(RawQuestion(number=n, stem=stem, choices=[], pages=[1]))["fieldId"]
        self.assertEqual(f(47, "次の記述のうち、正しいものはどれか。"), "k4")
        self.assertEqual(f(1, "共用部分に関する次の記述のうち、区分所有法の規定によれば、誤っているものはどれか。"), "k1")
        self.assertEqual(f(28, "理事長及び理事会の権限に関する次の記述のうち、標準管理規約によれば、適切でないものはどれか。"), "k2")
        self.assertEqual(f(36, "コンクリートに関する次の記述のうち、適切でないものはどれか。"), "k3")


if __name__ == "__main__":
    unittest.main()
