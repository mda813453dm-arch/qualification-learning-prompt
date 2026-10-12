import os,unittest
from dual_pdf_text_audit import normalized,audit_question_pdf
class DualPdfAuditTests(unittest.TestCase):
 def test_unicode_and_whitespace_normalization(self):
  self.assertEqual(normalized('第１ 問\nア　イ'),normalized('第1問アイ'))
 @unittest.skipUnless(os.getenv('SURVEYOR_QUESTION_PDF'),'PDF not provided')
 def test_real_pdf_twenty_questions(self):
  result=audit_question_pdf(os.environ['SURVEYOR_QUESTION_PDF'])
  self.assertEqual(result['total'],20)
  self.assertEqual(result['exactMatches'],20)
  self.assertEqual(result['publishable'],0)
  self.assertTrue(all(not r['visualCompletenessVerified'] for r in result['reports']))
 @unittest.skipUnless(os.getenv('SURVEYOR_ANSWER_PDF'),'PDF not provided')
 def test_answer_pdf_cannot_substitute_question_pdf(self):
  with self.assertRaisesRegex(ValueError,'QUESTION_PDF_PIN_MISMATCH'):
   audit_question_pdf(os.environ['SURVEYOR_ANSWER_PDF'])
if __name__=='__main__':unittest.main()
