"""Year/section-scoped answer validation. Synthetic HTML proves guard behavior;
live-site audit is separately executed in Actions.
"""
import unittest
from qlp_parser.core import ANSWER_SPECIAL, ParseError
from qlp_parser.adapters.land_surveyor_web_answers import (
    EXPECTED, ARCHIVE_WEB_YEARS, extract_year, parse_answers_html,
)

def make_page(values=None, omit=None, extra_year=None):
    sections = {year:{key:list(v) for key,v in EXPECTED[year].items()}
                for year in ARCHIVE_WEB_YEARS}
    if values:
        for (year, section, number), value in values.items():
            sections[year][section][number-1] = value
    out = ["<!doctype html><html><head><title>土地家屋調査士試験の過去問と解答</title></head><body>"]
    for year in ARCHIVE_WEB_YEARS:
        out.append(f'<h3 id="year-{year}">平成{year-1988}年度：解答</h3>')
        for section in ("午後の部", "午前の部") if year <= 2008 else ("午前の部","午後の部"):
            out.append(f'<div><strong>{section}</strong><table><tbody><tr><th></th><th>正解</th></tr>')
            for index, value in enumerate(sections[year][section],1):
                if omit == (year, section, index):
                    continue
                answer="没問" if value == ANSWER_SPECIAL else str(value)
                out.append(f"<tr><td>第{index}問</td><td>{answer}</td></tr>")
            out.append("</tbody></table></div>")
    if extra_year:
        year, section = extra_year
        out.extend([f'<h3>平成{year-1988}年度：解答</h3>',
            "<table><tr><td>第1問</td><td>2</td></tr></table>"])
    out.append('<h2>土地家屋調査士試験の過去問の解説</h2></body></html>')
    return "".join(out)


class ArchivedWebAnswers(unittest.TestCase):
    def test_all_three_years_and_reversed_legacy_sections(self):
        page = make_page()
        for year in ARCHIVE_WEB_YEARS:
            result = extract_year(page, year)
            self.assertEqual(result, EXPECTED[year])
            self.assertEqual(len(result["午前の部"]),10)
            self.assertEqual(len(result["午後の部"]),20)
            for section in result:
                self.assertEqual(list(parse_answers_html(page,year,section).values()),result[section])

    def test_2008_cancelled_question_is_not_given_normal_grade(self):
        row = parse_answers_html(make_page(),2008,"午後の部")
        self.assertEqual(row[19], ANSWER_SPECIAL)
        self.assertEqual(len(row),20)

    def test_modified_answer_rejected(self):
        with self.assertRaises(ParseError) as ex:
            extract_year(make_page({(2007,"午後の部",2):1}),2007)
        self.assertEqual(ex.exception.code,"WEB_ANSWER_DIFFERS_FROM_AUDITED_SOURCE")

    def test_missing_question_rejected(self):
        with self.assertRaises(ParseError):
            extract_year(make_page(omit=(2008,"午前の部",5)),2008)

    def test_unexpected_year_fails(self):
        with self.assertRaises(ParseError):
            extract_year(make_page(),2010)

    def test_section_and_year_cannot_be_swapped(self):
        with self.assertRaises(ParseError) as e:
            parse_answers_html(make_page(),2007,"main")
        self.assertEqual(e.exception.code,"SECTION_NOT_SUPPORTED")
        self.assertNotEqual(EXPECTED[2007]["午前の部"],EXPECTED[2009]["午前の部"])

    def test_no_source_page_fails(self):
        with self.assertRaises(ParseError):
            extract_year('<html>land data</html>',2008)
