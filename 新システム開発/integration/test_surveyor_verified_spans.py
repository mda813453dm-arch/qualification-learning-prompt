import os
import unittest
from surveyor_verified_spans import extract_answers,extract_questions,verify_files

class VerifiedSpanTests(unittest.TestCase):
    def test_missing_answer_rejected(self):
        with self.assertRaisesRegex(ValueError,'ANSWER_COVERAGE_INVALID'):
            extract_answers('午前の部   午後の部\n第1問 5 第1問 1')
    def test_multiline_row_not_merged(self):
        with self.assertRaises(ValueError):
            extract_answers('午前の部   午後の部\n第1問 5\n第1問 1')
    def test_duplicate_question_rejected(self):
        with self.assertRaisesRegex(ValueError,'QUESTION_HEADERS_NOT_UNIQUE'):
            extract_questions(['第1問 test\n第1問 duplicated'])
    def test_missing_choice_rejected(self):
        pages=[f'第{i}問 '+('x'*50)+'\n' for i in range(1,22)]
        with self.assertRaisesRegex(ValueError,'CHOICE_LINE_UNVERIFIED'):
            extract_questions(pages)
    @unittest.skipUnless(os.getenv('SURVEYOR_QUESTION_PDF') and os.getenv('SURVEYOR_ANSWER_PDF'),'private PDF paths not configured')
    def test_real_pdf(self):
        result=verify_files(os.environ['SURVEYOR_QUESTION_PDF'],os.environ['SURVEYOR_ANSWER_PDF'])
        self.assertEqual(len(result['questions']),20)
        self.assertEqual(len(result['answers']),20)
        self.assertEqual(result['answers'][1],1)
        self.assertEqual(result['answers'][20],4)
        self.assertTrue(all(len(v['choices'])==5 for v in result['questions'].values()))

if __name__=='__main__':unittest.main()
