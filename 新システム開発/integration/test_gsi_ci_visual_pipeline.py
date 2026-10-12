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
 def test_html_rejected(self):
  with self.assertRaisesRegex(ValueError,'NOT_PDF'):fetch_bytes(lambda req,timeout:FakeResponse(b'<html>'))
 def test_redirect_rejected(self):
  with self.assertRaisesRegex(ValueError,'UNEXPECTED_REDIRECT'):fetch_bytes(lambda req,timeout:FakeResponse(b'%PDF-',url='https://example.org/'))
 def test_too_few_pages_rejected(self):
  import fitz
  doc=fitz.open();doc.new_page()
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'PDF_PAGE_COUNT_INVALID'):export(doc.tobytes(),d)
if __name__=='__main__':unittest.main()
