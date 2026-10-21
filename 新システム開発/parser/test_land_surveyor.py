"""土地家屋調査士の午前／午後の正答列と、問題単位の安全な切抜範囲。
合成Docは原本での検証結果ではない。実PDFの2025検証は別途行う。
"""
import unittest
from types import SimpleNamespace

from qlp_parser.adapters import land_surveyor as adapter
from qlp_parser.core import ParseError


class Page:
    def __init__(self, text="", words=None):
        self._text = text
        self._words = words or []
        self.rect = SimpleNamespace(x0=0.0, y0=0.0, x1=595.0, y1=842.0, width=595.0)
    def get_text(self, kind="text", sort=False):
        if kind == "words":
            return self._words
        return self._text


def question_pdf(section, count):
    pages = [Page("午前(07)（午前の部）試験問題" if section == "午前の部" else "午後(07)（午後の部）試験問題")]
    for n in range(1, count + 1):
        pages.append(Page(f"第{n} 問 問題文\n1 アウ 2 アオ 3 イエ 4 イオ 5 ウオ\n─（{n}）─"))
    pages.append(Page("第11 問 記述式であり5択ではない" if section == "午前の部" else "第21 問 記述式であり5択ではない"))
    return pages


def answer_pdf():
    words = []
    for n in range(1, 21):
        y = 160 + n * 18
        if n <= 10:
            words.extend([(110, y, 150, y+12, f"第{n}問", 0, 0, 0),
                          (230, y, 241, y+12, str(adapter.EXPECTED_2025["午前の部"][n-1]), 0, 0, 0)])
        words.extend([(320, y, 365, y+12, f"第{n}問", 0, 0, 0),
                      (440, y, 452, y+12, str(adapter.EXPECTED_2025["午後の部"][n-1]), 0, 0, 0)])
    return [Page("令和7年度土地家屋調査士試験 正解 午前の部 午後の部", words)]


class LandSurveyorTest(unittest.TestCase):
    def test_morning_and_afternoon_keys_never_merge(self):
        ans = answer_pdf()
        for section, count, field in [("午前の部", 10, "l1"), ("午後の部", 20, "l3")]:
            with self.subTest(section=section):
                questions = adapter.parse_questions(question_pdf(section, count), section)
                key = adapter.parse_answers(ans, section)
                self.assertEqual([q.number for q in questions], list(range(1, count+1)))
                self.assertEqual(len(key), count)
                self.assertEqual([key[i] for i in range(1, count+1)], adapter.EXPECTED_2025[section])
                self.assertEqual(adapter.classify(questions[0], section)["fieldId"], field)
                self.assertEqual(len(questions[0].crops), 1)
                self.assertEqual(questions[0].stem_mode, "official_image")
                self.assertEqual(questions[0].choice_mode, "official_image")
                self.assertNotIn(21, [q.number for q in questions])
        self.assertNotEqual(adapter.parse_answers(ans, "午前の部")[1], adapter.parse_answers(ans, "午後の部")[1])

    def test_rejects_cross_section_answer_missing_extra_question_and_unchecked_hash(self):
        with self.assertRaises(ParseError) as e:
            adapter.check_source_hashes(2025, "午前の部", adapter.PIN_2025["午後の部"], adapter.PIN_2025["正答"])
        self.assertEqual(e.exception.code, "SOURCE_PDF_PIN_MISMATCH")
        with self.assertRaises(ParseError):
            adapter.check_source_hashes(2024, "午後の部", "anything", "anything")
        with self.assertRaises(ParseError):
            adapter.parse_questions(question_pdf("午前の部", 9), "午前の部")
        with self.assertRaises(ParseError):
            adapter.parse_answers(answer_pdf(), "夜の部")
        broken = answer_pdf()
        broken[0]._words = [w for w in broken[0]._words if not (w[0] >= 400 and w[1] == 178)]
        with self.assertRaises(ParseError):
            adapter.parse_answers(broken, "午後の部")

    def test_cover_year_and_section_are_verified(self):
        ans = answer_pdf()
        adapter.check_question(question_pdf("午前の部", 10), ans, 2025, "午前の部")
        with self.assertRaises(ParseError):
            adapter.check_question(question_pdf("午後の部", 20), ans, 2025, "午前の部")
        with self.assertRaises(ParseError):
            adapter.check_question(question_pdf("午前の部", 10), ans, 2024, "午前の部")


if __name__ == "__main__":
    unittest.main()
