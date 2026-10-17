"""行政書士（行政書士試験研究センター）。

前半は合成データで、正解ページ（HTML）の読み方・分野の決め方を確かめる。
後半は令和7年度の公式PDFと正解ページ（実物）。リポジトリに置かないので、環境変数 GYOSEI_R7_Q（問題PDF）・
GYOSEI_R7_A（正解ページのHTML）にパスを渡したときだけ動く。
公式URL: https://gyosei-shiken.or.jp/pdf/r7_mondai.pdf ／ https://gyosei-shiken.or.jp/doc/exam/r7ans.html
"""

import os
import unittest
from pathlib import Path

from qlp_parser.adapters import gyosei
from qlp_parser.cli import run
from qlp_parser.core import ANSWER_SPECIAL, ParseError, PdfSource, RawQuestion

PAGE = """<html><head><title>令和７年度　行政書士試験問題の正解</title></head><body><table>
<tr><th>問題</th><th>正解</th><th>問題</th><th>正解</th></tr>
""" + "".join(f"<tr><td>問題{'　' if n < 10 else ''}{n:>2}</td><td>{(n % 5) + 1}</td><td>問題{n + 30}</td><td>{'全員正解' if n == 4 else (n % 5) + 1}</td></tr>" for n in range(1, 11)) + """
<tr><td>問題41</td><td>ア</td><td>5</td><td>イ</td><td>10</td></tr>
<tr><td>問題44</td><td>記述式問題の正解例（別紙）</td></tr>
</table><table><tr><td>問題44</td><td>裁</td><td>決</td></tr></table></body></html>"""


class AnswerPage(unittest.TestCase):
    def test_reads_numbers_and_skips_other_formats(self):
        a = gyosei.parse_answers_html(PAGE)
        self.assertEqual(a[1], 2)
        self.assertEqual(a[10], 1)
        self.assertEqual(a[31], 2)
        self.assertEqual(a[34], ANSWER_SPECIAL)
        self.assertNotIn(41, a)  # 多肢選択式（ア〜エ）
        self.assertNotIn(44, a)  # 記述式

    def test_year_from_title(self):
        gyosei.check_year_html(PAGE, 2025)
        with self.assertRaises(ParseError) as e:
            gyosei.check_year_html(PAGE, 2024)
        self.assertEqual(e.exception.code, "ANSWER_YEAR_MISMATCH")


class Fields(unittest.TestCase):
    def test_official_ranges(self):
        got = {n: gyosei.classify(RawQuestion(number=n, stem="x", choices=[], pages=[1]))["fieldId"] for n in (2, 3, 26, 27, 40, 47, 60, 41)}
        self.assertEqual(got, {2: "g1", 3: "g2", 26: "g3", 27: "g4", 40: "g5", 47: "g6", 60: "g6", 41: None})


QP, AP = os.environ.get("GYOSEI_R7_Q"), os.environ.get("GYOSEI_R7_A")


@unittest.skipUnless(QP and AP, "令和7年度の公式PDF・正解ページが無い")
class Official(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        q = PdfSource(Path(QP).read_bytes(), "https://gyosei-shiken.or.jp/pdf/r7_mondai.pdf")
        a = PdfSource(Path(AP).read_bytes(), "https://gyosei-shiken.or.jp/doc/exam/r7ans.html")
        cls.r = run("gyosei", 2025, q, a)
        cls.by = {p["questionNumber"]: p for p in cls.r["packets"]}

    def test_all_five_choice_questions(self):
        # 問題1・58〜60は公開されていない。41〜46（多肢選択式・記述式）は出題しない
        self.assertEqual(self.r["status"], "ready")
        self.assertEqual(sorted(self.by), list(range(2, 41)) + list(range(47, 58)))

    def test_note_and_items(self):
        self.assertTrue(self.by[2]["stem"].endswith("（注）　＊　裁判員の参加する刑事裁判に関する法律"))
        self.assertEqual(self.by[2]["correctAnswer"], 4)
        self.assertEqual(self.by[48]["choices"], ["ア・イ", "ア・ウ", "イ・オ", "ウ・エ", "エ・オ"])

    def test_table_choices_are_official_image(self):
        p = self.by[5]
        self.assertEqual((p["choiceMode"], p["choices"], len(p["figures"])), ("official_image", ["1", "2", "3", "4", "5"], 1))
        self.assertNotIn("アイウエ", p["stem"])


if __name__ == "__main__":
    unittest.main()
