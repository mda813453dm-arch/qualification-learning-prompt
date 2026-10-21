"""土地家屋調査士の午前／午後の正答列と、問題単位の安全な切抜範囲。
合成Docは原本での検証結果ではない。実PDFの2024・2025年度検証は作業環境で別途行う。
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


def question_pdf(section, count, year=2025):
    tag = f"({year - 2018:02d})"
    pages = [Page(f"午前{tag}（午前の部）試験問題" if section == "午前の部" else f"午後{tag}（午後の部）試験問題")]
    for n in range(1, count + 1):
        pages.append(Page(f"第{n} 問 問題文\n1 アウ 2 アオ 3 イエ 4 イオ 5 ウオ\n─（{n}）─"))
    pages.append(Page("第11 問 記述式であり5択ではない" if section == "午前の部" else "第21 問 記述式であり5択ではない"))
    return pages


def answer_pdf(year=2025):
    expected = adapter.EXPECTED_BY_YEAR[year]
    words = []
    for n in range(1, 21):
        y = 160 + n * 18
        if n <= 10:
            words.extend([(110, y, 150, y+12, f"第{n}問", 0, 0, 0),
                          (230, y, 241, y+12, str(expected["午前の部"][n-1]), 0, 0, 0)])
        words.extend([(320, y, 365, y+12, f"第{n}問", 0, 0, 0),
                      (440, y, 452, y+12, str(expected["午後の部"][n-1]), 0, 0, 0)])
    return [Page(f"令和{year - 2018}年度土地家屋調査士試験 正解 午前の部 午後の部", words)]


class LandSurveyorTest(unittest.TestCase):
    def test_morning_and_afternoon_keys_never_merge(self):
        ans = answer_pdf()
        for section, count, field in [("午前の部", 10, "l1"), ("午後の部", 20, "l3")]:
            with self.subTest(section=section):
                questions = adapter.parse_questions(question_pdf(section, count), section)
                key = adapter.parse_answers(ans, section, 2025)
                self.assertEqual([q.number for q in questions], list(range(1, count+1)))
                self.assertEqual(len(key), count)
                self.assertEqual([key[i] for i in range(1, count+1)], adapter.EXPECTED_2025[section])
                self.assertEqual(adapter.classify(questions[0], section)["fieldId"], field)
                self.assertEqual(len(questions[0].crops), 1)
                self.assertEqual(questions[0].stem_mode, "official_image")
                self.assertEqual(questions[0].choice_mode, "official_image")
                self.assertNotIn(21, [q.number for q in questions])
        self.assertNotEqual(adapter.parse_answers(ans, "午前の部", 2025)[1], adapter.parse_answers(ans, "午後の部", 2025)[1])

    def test_rejects_cross_section_answer_missing_extra_question_and_unchecked_hash(self):
        with self.assertRaises(ParseError) as e:
            adapter.check_source_hashes(2025, "午前の部", adapter.PIN_2025["午後の部"], adapter.PIN_2025["正答"])
        self.assertEqual(e.exception.code, "SOURCE_PDF_PIN_MISMATCH")
        with self.assertRaises(ParseError):
            adapter.check_source_hashes(2024, "午後の部", "anything", "anything")
        with self.assertRaises(ParseError):
            adapter.parse_questions(question_pdf("午前の部", 9), "午前の部")
        with self.assertRaises(ParseError):
            adapter.parse_answers(answer_pdf(), "夜の部", 2025)
        broken = answer_pdf()
        broken[0]._words = [w for w in broken[0]._words if not (w[0] >= 400 and w[1] == 178)]
        with self.assertRaises(ParseError):
            adapter.parse_answers(broken, "午後の部", 2025)

    def test_cover_year_and_section_are_verified(self):
        ans = answer_pdf()
        adapter.check_question(question_pdf("午前の部", 10), ans, 2025, "午前の部")
        with self.assertRaises(ParseError):
            adapter.check_question(question_pdf("午後の部", 20), ans, 2025, "午前の部")
        with self.assertRaises(ParseError):
            adapter.check_question(question_pdf("午前の部", 10), ans, 2024, "午前の部")

    def test_2024_morning_afternoon_pin_year_and_answer_are_independent(self):
        for year in (2024, 2025):
            source = adapter.PIN_BY_YEAR[year]
            for section, count in (("午前の部", 10), ("午後の部", 20)):
                with self.subTest(year=year, section=section):
                    adapter.check_source_hashes(year, section, source[section], source["正答"])
                    adapter.check_question(question_pdf(section, count, year), answer_pdf(year), year, section)
                    answers = adapter.parse_answers(answer_pdf(year), section, year)
                    self.assertEqual([answers[i] for i in range(1, count + 1)],
                                     adapter.EXPECTED_BY_YEAR[year][section])
                    wrong_year = 2024 if year == 2025 else 2025
                    with self.assertRaises(ParseError) as ctx:
                        adapter.check_source_hashes(year, section,
                            adapter.PIN_BY_YEAR[wrong_year][section], source["正答"])
                    self.assertEqual(ctx.exception.code, "SOURCE_PDF_PIN_MISMATCH")
                    with self.assertRaises(ParseError):
                        adapter.check_question(question_pdf(section, count, wrong_year),
                                               answer_pdf(year), year, section)
            with self.assertRaises(ParseError):
                adapter.parse_answers(answer_pdf(year), "午後の部", 2023)
        with self.assertRaises(ParseError) as ctx:
            adapter.check_source_hashes(2023, "午後の部", "any", "any")
        self.assertEqual(ctx.exception.code, "YEAR_NOT_VALIDATED")



if __name__ == "__main__":
    unittest.main()
