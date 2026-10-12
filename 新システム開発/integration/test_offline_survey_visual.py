import tempfile,unittest
from pathlib import Path
from offline_survey_visual import prepare
class Tests(unittest.TestCase):
 def create_pdf(self,n=29,empty_page=None):
  import fitz
  doc=fitz.open()
  for i in range(n):
   page=doc.new_page()
   if i!=empty_page:page.insert_text((72,72),f'Question page {i+1}')
   if i==8:page.draw_rect(fitz.Rect(100,110,300,220))
  return doc.tobytes()
 def test_render_two_pages_without_approval(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'input.pdf';p.write_bytes(self.create_pdf());r=prepare(p,Path(d)/'out')
   self.assertEqual([(x['questionNumber'],x['pdfPage']) for x in r['questions']],[(7,9),(27,29)])
   self.assertTrue(all((Path(d)/'out'/x['imageFile']).read_bytes().startswith(b'\x89PNG') for x in r['questions']))
   self.assertEqual(r['sourceProvenance'],'USER_OR_EXTERNAL_FILE_UNVERIFIED')
   self.assertFalse(r['publishable'])
 def test_short_pdf_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'input.pdf';p.write_bytes(self.create_pdf(28))
   with self.assertRaisesRegex(ValueError,'PDF_PAGE_COUNT_OR_ENCRYPTION_INVALID'):prepare(p,Path(d)/'out')
 def test_missing_text_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'input.pdf';p.write_bytes(self.create_pdf(empty_page=8))
   with self.assertRaisesRegex(ValueError,'QUESTION_PAGE_TEXT_EMPTY'):prepare(p,Path(d)/'out')
 def test_html_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'input.pdf';p.write_bytes(b'<html>not a PDF</html>')
   with self.assertRaisesRegex(ValueError,'INVALID_PDF_INPUT'):prepare(p,Path(d)/'out')
if __name__=='__main__':unittest.main()
