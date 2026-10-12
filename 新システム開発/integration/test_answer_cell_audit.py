import os,unittest
from answer_cell_audit import verify_answer_cells
class AnswerCellAuditTests(unittest.TestCase):
 @unittest.skipUnless(os.getenv('SURVEYOR_ANSWER_PDF'),'PDF path missing')
 def test_real_pdf_twenty_cells(self):
  answers,rows=verify_answer_cells(os.environ['SURVEYOR_ANSWER_PDF'])
  self.assertEqual(len(answers),20)
  self.assertEqual(answers[1],1)
  self.assertEqual(answers[10],4)
  self.assertEqual(answers[20],4)
  self.assertEqual(len(rows),20)
 @unittest.skipUnless(os.getenv('SURVEYOR_QUESTION_PDF'),'PDF path missing')
 def test_wrong_pdf_rejected(self):
  with self.assertRaisesRegex(ValueError,'ANSWER_PDF_HASH_MISMATCH'):
   verify_answer_cells(os.environ['SURVEYOR_QUESTION_PDF'])
if __name__=='__main__':unittest.main()
