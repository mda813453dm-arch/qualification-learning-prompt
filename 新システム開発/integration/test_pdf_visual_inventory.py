import os,unittest
from pdf_visual_inventory import inventory
class TestInventory(unittest.TestCase):
 @unittest.skipUnless(os.environ.get('SURVEYOR_QUESTION_PDF'),'PDF path not set')
 def test_real_pdf_inventory(self):
  result=inventory(os.environ['SURVEYOR_QUESTION_PDF'])
  self.assertEqual(result['total'],20)
  self.assertEqual(result['embeddedImageObjects'],0)
  self.assertEqual(result['vectorPaths'],20)
  self.assertEqual(result['publishable'],0)
  self.assertTrue(all(not q['visualCompletenessVerified'] for q in result['questions']))
 @unittest.skipUnless(os.environ.get('SURVEYOR_ANSWER_PDF'),'PDF path not set')
 def test_wrong_pdf_is_rejected(self):
  with self.assertRaisesRegex(ValueError,'QUESTION_PDF_HASH_MISMATCH'):
   inventory(os.environ['SURVEYOR_ANSWER_PDF'])
if __name__=='__main__':unittest.main()
