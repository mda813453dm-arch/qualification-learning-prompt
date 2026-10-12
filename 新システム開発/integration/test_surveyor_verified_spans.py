import os
import unittest
from export_verified_spans import export_from_verified
from surveyor_verified_spans import extract_answers,extract_answer_evidence,extract_questions,verify_files

CHOICES='1 アア 2 イイ 3 ウウ 4 エエ 5 オオ'

def answer_pages():
    first=['午前の部                    午後の部']
    first += [f'第{i}問 5 第{i}問 {i % 5 + 1}' for i in range(1,11)]
    second=[f'              第{i}問 {i % 5 + 1}' for i in range(11,21)]
    return ['\n'.join(first),'\n'.join(second)]

def question_pages():
    first='\n'.join(f'第{i}問 問題本文これは検証用の文章で、抽出テスト用に十分な長さを確保しています。\n{CHOICES}' for i in range(1,11))
    second='\n'.join(f'第{i}問 問題本文これは検証用の文章で、抽出テスト用に十分な長さを確保しています。\n{CHOICES}' for i in range(11,22))
    return [first,second]

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

    def test_question_spans_carry_page_ranges_and_stem_hashes(self):
        extracted=extract_questions(question_pages())
        self.assertEqual(len(extracted),20)
        self.assertEqual(extracted[1]['pages'],[1])
        self.assertEqual(extracted[10]['pages'],[1,2])
        self.assertEqual(extracted[11]['pages'],[2])
        self.assertEqual(extracted[20]['pages'],[2])
        self.assertEqual(extracted[1]['stem_text'],'第1問 問題本文これは検証用の文章で、抽出テスト用に十分な長さを確保しています。')
        self.assertEqual(len(extracted[1]['stem_sha256']),64)
        self.assertEqual(len(extracted[1]['span_sha256']),64)

    def test_afternoon_answer_evidence_has_exact_row_page_and_hash(self):
        pages=answer_pages()
        evidence=extract_answer_evidence(pages)
        answers=extract_answers('\n'.join(pages))
        self.assertEqual(len(evidence),20)
        self.assertEqual(evidence[1]['answer'],answers[1])
        self.assertEqual(evidence[1]['page'],1)
        self.assertEqual(evidence[1]['evidence'],'第1問 5 第1問 2')
        self.assertEqual(evidence[11]['page'],2)
        self.assertEqual(evidence[11]['evidence'],'              第11問 2')
        self.assertEqual(len(evidence[20]['evidence_sha256']),64)

    def test_export_contains_canonical_identity_and_complete_evidence(self):
        questions=extract_questions(question_pages())
        evidence=extract_answer_evidence(answer_pages())
        result={
            'questions':questions,
            'answers':{n:evidence[n]['answer'] for n in evidence},
            'answer_evidence':evidence,
            'question_pdf_sha256':'1'*64,
            'answer_pdf_sha256':'2'*64
        }
        bundle=export_from_verified(result)
        self.assertEqual(bundle['registryKey'],'土地家屋調査士:2025:午後')
        self.assertEqual(bundle['qualification'],'土地家屋調査士')
        self.assertEqual(len(bundle['questions']),20)
        q=bundle['questions'][10]
        self.assertEqual(q['key'],'土地家屋調査士:2025:午後:11')
        self.assertEqual(q['pages'],[2])
        self.assertEqual(q['answerPage'],2)
        self.assertEqual(q['answerNumber'],evidence[11]['answer'])
        self.assertEqual(q['answerEvidenceSha256'],evidence[11]['evidence_sha256'])
        self.assertTrue(q['stemText'].endswith('文章です。'))

    @unittest.skipUnless(os.getenv('SURVEYOR_QUESTION_PDF') and os.getenv('SURVEYOR_ANSWER_PDF'),'private PDF paths not configured')
    def test_real_pdf(self):
        result=verify_files(os.environ['SURVEYOR_QUESTION_PDF'],os.environ['SURVEYOR_ANSWER_PDF'])
        self.assertEqual(len(result['questions']),20)
        self.assertEqual(len(result['answers']),20)
        self.assertEqual(result['answers'][1],1)
        self.assertEqual(result['answers'][20],4)
        self.assertEqual(len(result['answer_evidence']),20)
        self.assertTrue(all(len(v['choices'])==5 for v in result['questions'].values()))

if __name__=='__main__':
    unittest.main()
