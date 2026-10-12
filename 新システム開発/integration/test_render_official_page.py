import hashlib,os,tempfile,unittest
from pathlib import Path
from render_official_page import render_page
PDF=os.environ.get('SURVEYOR_QUESTION_PDF')
@unittest.skipUnless(PDF and Path(PDF).is_file(),'real PDF not configured')
class Tests(unittest.TestCase):
 def test_real_pdf_render(self):
  with tempfile.TemporaryDirectory() as d:
   digest=hashlib.sha256(Path(PDF).read_bytes()).hexdigest()
   result=render_page(PDF,expected_sha256=digest,page_number=4,output_path=f'{d}/page.png')
   self.assertTrue(Path(f'{d}/page.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
   self.assertFalse(result['publishable'])
 def test_wrong_hash(self):
  with self.assertRaisesRegex(ValueError,'PDF_PIN_MISMATCH'):
   render_page(PDF,expected_sha256='0'*64,page_number=4,output_path='/tmp/no.png')
 def test_page_out_of_range(self):
  digest=hashlib.sha256(Path(PDF).read_bytes()).hexdigest()
  with self.assertRaisesRegex(ValueError,'PAGE_OUT_OF_RANGE'):
   render_page(PDF,expected_sha256=digest,page_number=999,output_path='/tmp/no.png')
 def test_bad_dpi(self):
  digest=hashlib.sha256(Path(PDF).read_bytes()).hexdigest()
  with self.assertRaisesRegex(ValueError,'DPI_INVALID'):
   render_page(PDF,expected_sha256=digest,page_number=4,output_path='/tmp/no.png',dpi=400)
if __name__=='__main__':unittest.main()
