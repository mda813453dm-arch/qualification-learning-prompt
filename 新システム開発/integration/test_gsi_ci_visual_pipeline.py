import unittest,tempfile
from pathlib import Path
from gsi_ci_visual_pipeline import fetch_bytes,export,URL
class FakeResponse:
 def __init__(self,data,url=URL):self.data=data;self.url=url
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def geturl(self):return self.url
 def read(self,limit):return self.data[:limit]
class Tests(unittest.TestCase):
 def test_valid_header(self):self.assertEqual(fetch_bytes(lambda req,timeout:FakeResponse(b'%PDF-test')),b'%PDF-test')
 def test_official_published_mirror(self):self.assertEqual(URL,'https://web2.gsi.go.jp/common/000278974.pdf')
 def test_html_rejected(self):
  with self.assertRaisesRegex(ValueError,'NOT_PDF'):fetch_bytes(lambda req,timeout:FakeResponse(b'<html>'))
 def test_redirect_rejected(self):
  with self.assertRaisesRegex(ValueError,'UNEXPECTED_REDIRECT'):fetch_bytes(lambda req,timeout:FakeResponse(b'%PDF-',url='https://example.org/'))
 def test_too_few_pages_rejected(self):
  import fitz
  doc=fitz.open();doc.new_page()
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'PDF_PAGE_COUNT_INVALID'):export(doc.tobytes(),d)
 def test_29_pages_generate_two_pngs(self):
  import fitz,json
  doc=fitz.open()
  for i in range(29):
   page=doc.new_page()
   page.insert_text((50,50),f'Question page {i+1}')
  with tempfile.TemporaryDirectory() as d:
   report=export(doc.tobytes(),d)
   self.assertEqual([q['pdfPage'] for q in report['questions']],[9,29])
   self.assertEqual([q['questionNumber'] for q in report['questions']],[7,27])
   self.assertTrue(all((Path(d)/q['imageFile']).read_bytes().startswith(bytes([137,80,78,71,13,10,26,10])) for q in report['questions']))
   self.assertFalse(report['publishable'])
 def test_empty_question_page_rejected(self):
  import fitz
  doc=fitz.open()
  for i in range(29):
   page=doc.new_page()
   if i!=8:page.insert_text((50,50),'test')
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'QUESTION_PAGE_TEXT_EMPTY'):export(doc.tobytes(),d)
if __name__=='__main__':unittest.main()
