"""中小企業診断士 第1次試験アダプタ（合成PDF）。公式PDFの形（parser/tools/shindan_probe.py で確認）をまねて作る。

実行: cd 新システム開発/parser && python -m unittest discover -s tests
"""

import unittest

import fitz

from qlp_parser.adapters import shindan
from qlp_parser.cli import run
from qlp_parser.core import ANSWER_SPECIAL, PdfSource

QURL = "https://example.invalid/C1JC2026.pdf"
AURL = "https://example.invalid/2026C.pdf"


def _t(page, x, y, text, size=9.9):
    page.insert_text((x, y), text, fontname="japan", fontsize=size)


def make_question_pdf(subject="企業経営理論", year_label="令和8 年度　第1 次試験問題"):
    doc = fitz.open()
    cover = doc.new_page(width=516, height=729)
    _t(cover, 156, 50, year_label, 15.6)
    _t(cover, 62, 50, "Ｃ", 45)
    _t(cover, 197, 80, subject, 24)
    _t(cover, 79, 150, "電卓、携帯電話などは使用できません。財務・会計の試験は2日目です。")
    p = doc.new_page(width=516, height=729)
    # 第1問：4択
    _t(p, 69, 80, "第１問")
    _t(p, 79, 100, "　経営戦略に関する記述として、最も適切なものはどれか。")
    y = 140
    for k, c in zip("アイウエ", ["企業ドメインは", "事業ドメインは", "多角化は", "競争戦略は"]):
        _t(p, 79, y, f"{k}　{c}次の行に続く。")
        _t(p, 89, y + 20, "折り返しの行。")
        y += 40
    _t(p, 255, 670, "1")
    # 第2問：解答群の5択（続きの行が全角空白で始まる）
    p = doc.new_page(width=516, height=729)
    _t(p, 69, 80, "第２問")
    _t(p, 79, 100, "　用語の組み合わせとして、最も適切なものを下記の解答群から選べ。")
    _t(p, 79, 120, "ａ　素材が準備されてから完成品になるまでの時間")
    _t(p, 74, 150, "〔解答群〕")
    y = 170
    for k in "アイウエオ":
        _t(p, 89, y, f"{k}　ａ：リードタイム　　ｂ：歩留り")
        _t(p, 89, y + 20, "　　ｄ：適合品率")
        y += 40
    _t(p, 255, 670, "2")
    # 第3問：設問に分かれる問（出題しない）
    p = doc.new_page(width=516, height=729)
    _t(p, 69, 80, "第３問")
    _t(p, 79, 100, "　次の文章を読んで、下記の設問に答えよ。")
    _t(p, 69, 140, "（設問１）")
    y = 160
    for k in "アイウエ":
        _t(p, 79, y, f"{k}　設問1の選択肢")
        y += 20
    _t(p, 69, 260, "（設問２）")
    y = 280
    for k in "アイウエ":
        _t(p, 79, y, f"{k}　設問2の選択肢")
        y += 20
    # 第4問：空欄の枠（図形）がある問
    _t(p, 69, 400, "第４問")
    _t(p, 79, 420, "　空欄Ａに入る語句として、最も適切なものはどれか。")
    p.draw_rect(fitz.Rect(180, 425, 220, 440), color=(0, 0, 0), width=0.8)
    p.draw_rect(fitz.Rect(240, 425, 280, 440), color=(0, 0, 0), width=0.8)
    y = 460
    for k in "アイウエ":
        _t(p, 79, y, f"{k}　語句{k}")
        y += 20
    _t(p, 255, 670, "3")
    return doc.tobytes()


def make_answer_pdf(rows_left, rows_right, subject="Ｃ　企業経営理論", year="令和８年度　中小企業診断士　第１次試験"):
    """2段組みの正解表。rows: [(問題, 設問, 正解, 配点)]"""
    doc = fitz.open()
    p = doc.new_page(width=765, height=541)
    _t(p, 241, 48, year, 11)
    _t(p, 323, 66, subject, 11)
    _t(p, 347, 85, "正解・配点", 11)
    for x0, rows in ((63, rows_left), (428, rows_right)):
        for dx, h in zip((0, 84, 165, 247), ("問題", "設問", "正解", "配点")):
            _t(p, x0 + dx + 3, 116, h)
        y = 130
        for r in rows:
            for dx, v in zip((0, 92, 171, 255), r):
                if v:
                    _t(p, x0 + dx, y, v)
            y += 13.5
    return doc.tobytes()


LEFT = [("第1問", "-", "イ", "3"), ("第2問", "-", "オ", "3"), ("第3問", "設問1", "ア", "2"), (None, "設問2", "ウ", "2"),
        ("第4問", "-", "エ", "3")] + [(f"第{n}問", "-", "ア", "2") for n in range(5, 12)]
RIGHT = [(f"第{n}問", "-", "ウ", "2") for n in range(12, 20)] + [("第20問", "-", "全員正解", "2")]


class Answers(unittest.TestCase):
    def test_two_column_table(self):
        a = shindan.parse_answers(fitz.open(stream=make_answer_pdf(LEFT, RIGHT), filetype="pdf"))
        self.assertEqual(a[1], 2)
        self.assertEqual(a[2], 5)
        self.assertNotIn(3, a)  # 設問に分かれる問
        self.assertEqual(a[4], 4)
        self.assertEqual(a[11], 1)
        self.assertEqual(a[12], 3)
        self.assertEqual(a[19], 3)
        self.assertEqual(a[20], ANSWER_SPECIAL)

    def test_year_from_title(self):
        doc = fitz.open(stream=make_answer_pdf(LEFT, RIGHT), filetype="pdf")
        shindan.check_year(doc, 2026)
        with self.assertRaises(Exception) as e:
            shindan.check_year(doc, 2025)
        self.assertEqual(e.exception.code, "ANSWER_YEAR_MISMATCH")


class Questions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = run("shindan", 2026, PdfSource(make_question_pdf(), QURL), PdfSource(make_answer_pdf(LEFT, RIGHT), AURL), "企業経営理論")
        cls.by = {p["questionNumber"]: p for p in cls.r["packets"]}
        cls.ex = {e["questionNumber"]: e["reason"] for e in cls.r["excluded"]}

    def test_four_choice(self):
        p = self.by[1]
        self.assertEqual(len(p["choices"]), 4)
        self.assertIn("折り返しの行", p["choices"][3])
        self.assertEqual(p["correctAnswer"], 2)
        self.assertEqual(p["fieldId"], "d3")
        self.assertEqual(p["questionId"], "q021:2026:企業経営理論:1")

    def test_answer_group_five_choices(self):
        p = self.by[2]
        self.assertEqual(len(p["choices"]), 5)
        self.assertIn("ｄ：適合品率", p["choices"][4])
        self.assertNotIn("〔解答群〕", p["stem"])
        self.assertEqual(p["correctAnswer"], 5)

    def test_subquestions_not_served(self):
        self.assertEqual(self.ex[3], "CHOICES_INCOMPLETE")

    def test_boxes_are_shown_as_image(self):
        self.assertTrue(self.by[4]["figures"])


class Checks(unittest.TestCase):
    def test_subject_mismatch(self):
        r = run("shindan", 2026, PdfSource(make_question_pdf(subject="財務・会計"), QURL), PdfSource(make_answer_pdf(LEFT, RIGHT), AURL), "財務・会計")
        self.assertEqual(r["reason"], "SUBJECT_MISMATCH")

    def test_requested_subject_mismatch(self):
        r = run("shindan", 2026, PdfSource(make_question_pdf(), QURL), PdfSource(make_answer_pdf(LEFT, RIGHT), AURL), "経営法務")
        self.assertEqual(r["reason"], "SUBJECT_MISMATCH")

    def test_question_year_mismatch(self):
        r = run("shindan", 2026, PdfSource(make_question_pdf(year_label="令和7 年度　第1 次試験問題"), QURL), PdfSource(make_answer_pdf(LEFT, RIGHT), AURL), "企業経営理論")
        self.assertEqual(r["reason"], "QUESTION_YEAR_MISMATCH")


if __name__ == "__main__":
    unittest.main()
