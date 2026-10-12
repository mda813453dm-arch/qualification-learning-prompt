import unittest
from survey_pdf_gate import classify_pdf
U='https://www.gsi.go.jp/common/000278974.pdf'
class Tests(unittest.TestCase):
 def test_missing_pdf(self):self.assertEqual(classify_pdf(source_url=U)['reason'],'QUESTION_PDF_NOT_RETRIEVED')
 def test_untrusted_url(self):self.assertEqual(classify_pdf(source_url='https://example.com/000278974.pdf')['reason'],'UNTRUSTED_SOURCE')
 def test_visual_review_required(self):self.assertEqual(classify_pdf(source_url=U,pdf_bytes=b'%PDF-123',question_number=7)['reason'],'VISUAL_PAGE_REVIEW_REQUIRED')
 def test_answer_binding_required(self):self.assertEqual(classify_pdf(source_url=U,pdf_bytes=b'%PDF-123',question_number=7,rendered_page=b'X'*100,reviewed=True)['reason'],'ANSWER_AND_QUESTION_BINDING_REQUIRED')
if __name__=='__main__':unittest.main()
