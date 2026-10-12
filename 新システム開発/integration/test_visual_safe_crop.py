import hashlib,tempfile,unittest,os
from pathlib import Path
from visual_safe_crop import render_pair
PDF=os.environ.get('SURVEYOR_QUESTION_PDF','')
class Tests(unittest.TestCase):
 @unittest.skipUnless(bool(PDF) and Path(PDF).exists(),'uploaded PDF unavailable')
 def test_real_page(self):
  with tempfile.TemporaryDirectory() as d:
   sha=hashlib.sha256(Path(PDF).read_bytes()).hexdigest()
   r=render_pair(PDF,sha,4,d)
   self.assertTrue(Path(r['fullPng']).read_bytes().startswith(b'\\x89PNG'))
   self.assertFalse(r['publishable'])
 @unittest.skipUnless(bool(PDF) and Path(PDF).exists(),'uploaded PDF unavailable')
 def test_wrong_hash(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'PDF_HASH_MISMATCH'):render_pair(PDF,'0'*64,4,d)
 def test_vector_outside_crop_rejected(self):
  import fitz
  doc=fitz.open();p=doc.new_page();p.insert_text((80,100),'Sample question');p.draw_rect(fitz.Rect(350,400,450,480))
  with tempfile.TemporaryDirectory() as d:
   src=Path(d)/'test.pdf';src.write_bytes(doc.tobytes());sha=hashlib.sha256(src.read_bytes()).hexdigest()
   r=render_pair(src,sha,1,d)
   self.assertEqual(r['status'],'full-page-only')
   self.assertNotIn('readablePng',r)
 def test_clean_text_page_crop(self):
  import fitz
  doc=fitz.open();p=doc.new_page();p.insert_text((80,100),'Sample question')
  with tempfile.TemporaryDirectory() as d:
   src=Path(d)/'test.pdf';src.write_bytes(doc.tobytes());sha=hashlib.sha256(src.read_bytes()).hexdigest()
   r=render_pair(src,sha,1,d)
   self.assertEqual(r['status'],'crop-preview')
   self.assertTrue(Path(r['readablePng']).exists())
if __name__=='__main__':unittest.main()
