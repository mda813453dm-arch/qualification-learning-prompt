import hashlib,tempfile,unittest,os
from pathlib import Path
from render_readable_pair import render_readable_pair
PDF=os.environ.get('SURVEYOR_QUESTION_PDF')
@unittest.skipUnless(PDF and Path(PDF).exists(),'real PDF unavailable')
class Tests(unittest.TestCase):
 def test_pair_and_fail_closed(self):
  with tempfile.TemporaryDirectory() as d:
   sha=hashlib.sha256(Path(PDF).read_bytes()).hexdigest()
   result=render_readable_pair(PDF,sha,4,d)
   self.assertTrue(Path(result['fullPng']).read_bytes().startswith(b'\x89PNG'))
   self.assertTrue(Path(result['readablePng']).read_bytes().startswith(b'\x89PNG'))
   self.assertFalse(result['publishable'])
   self.assertTrue(result['croppedImageRequiresVisualReview'])
 def test_wrong_hash(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'PDF_HASH_MISMATCH'):render_readable_pair(PDF,'0'*64,4,d)
if __name__=='__main__':unittest.main()
