import unittest,tempfile,os
from pathlib import Path
from mvp_two_question import prepare,Quiz,sha
Q=os.environ.get('SURVEYOR_MORNING_QUESTION_PDF','')
A=os.environ.get('SURVEYOR_ANSWER_PDF','')
@unittest.skipUnless(Q and A and Path(Q).is_file() and Path(A).is_file(),'Real morning PDF and answer PDF not configured')
class Tests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.entries=prepare(Q,A,self.temp.name,sha(Q),sha(A))
 def test_real_pdf_images_and_answers(self):
  self.assertEqual([(x['question'],x['page'],x['answer']) for x in self.entries],[(4,7,3),(5,8,2)])
  self.assertTrue(all(Path(x['image']).read_bytes().startswith(bytes([137,80,78,71,13,10,26,10])) for x in self.entries))
 def test_grade_then_next_question(self):
  session=Quiz(self.entries)
  self.assertEqual(session.answer(3),{'question':4,'correct':True,'correctAnswer':3,'nextQuestion':5,'complete':False})
  self.assertEqual(session.answer(1),{'question':5,'correct':False,'correctAnswer':2,'nextQuestion':None,'complete':True})
 def test_wrong_pdf_hash(self):
  with self.assertRaisesRegex(ValueError,'PDF_HASH_MISMATCH'):prepare(Q,A,self.temp.name,'0'*64,sha(A))
 def test_invalid_choice_does_not_advance(self):
  session=Quiz(self.entries)
  with self.assertRaisesRegex(ValueError,'CHOICE_INVALID'):session.answer(6)
  self.assertEqual(session.current()['question'],4)
if __name__=='__main__':unittest.main()
