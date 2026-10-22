"""公式の解答を検証できない場合に誤採点しないためのFE/AP回帰テスト。"""

import unittest

import fitz

from qlp_parser.adapters import ap, fe
from qlp_parser.core import ParseError


def blank_doc():
    doc = fitz.open()
    doc.new_page()
    return doc


class IpaMultipleChoiceTests(unittest.TestCase):
    def test_both_qualifications_have_independent_ids(self):
        self.assertEqual((fe.QUALIFICATION_ID, ap.QUALIFICATION_ID), ('fe', 'ap'))
        self.assertEqual((fe.CHOICE_COUNT, ap.CHOICE_COUNT), (4, 4))

    def test_empty_official_answer_fails_closed(self):
        with self.assertRaises(ParseError):
            fe.parse_answers(blank_doc())

    def test_no_question_cannot_be_treated_as_ready(self):
        with self.assertRaises(ParseError):
            ap.parse_questions(blank_doc())


if __name__ == '__main__':
    unittest.main()
