"""Two-question fail-closed quiz from pinned official morning PDFs."""
import hashlib,re,subprocess,unicodedata
from pathlib import Path
import fitz
PAGES={4:7,5:8}
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def prepare(question_pdf,answer_pdf,out,expected_question_hash,expected_answer_hash):
 if sha(question_pdf)!=expected_question_hash or sha(answer_pdf)!=expected_answer_hash:raise ValueError('PDF_HASH_MISMATCH')
 answer_text=unicodedata.normalize('NFKC',subprocess.check_output(['pdftotext','-layout',str(answer_pdf),'-']).decode())
 answers={}
 for line in answer_text.splitlines():
  m=re.search(r'^\s*第\s*(\d+)\s*問\s+([1-5])\s+第\s*(\d+)\s*問\s+([1-5])',line)
  if m:answers[int(m.group(1))]=int(m.group(2))
 if answers.get(4)!=3 or answers.get(5)!=2:raise ValueError('OFFICIAL_ANSWER_BINDING_INVALID')
 doc=fitz.open(question_pdf);directory=Path(out);directory.mkdir(exist_ok=True,parents=True)
 result=[]
 for number,page in PAGES.items():
  text=unicodedata.normalize('NFKC',doc[page-1].get_text())
  if not re.search(r'^第\s*'+str(number)+r'\s*問',text):raise ValueError('QUESTION_PAGE_MISMATCH')
  if not all(re.search(r'(?m)^\s*'+str(i)+r'\s+',text) for i in range(1,6)):raise ValueError('CHOICES_MISSING')
  png=doc[page-1].get_pixmap(matrix=fitz.Matrix(2.5,2.5),alpha=False).tobytes('png')
  image=directory/f'question_{number}.png';image.write_bytes(png)
  result.append({'question':number,'page':page,'image':str(image),'imageSha256':hashlib.sha256(png).hexdigest(),'answer':answers[number]})
 return result
class Quiz:
 def __init__(self,entries):self.entries=entries;self.index=0
 def current(self):return self.entries[self.index] if self.index<len(self.entries) else None
 def answer(self,choice):
  if type(choice) is not int or not 1<=choice<=5:raise ValueError('CHOICE_INVALID')
  q=self.current()
  if q is None:raise ValueError('SESSION_COMPLETE')
  result={'question':q['question'],'correct':choice==q['answer'],'correctAnswer':q['answer']}
  self.index+=1
  result['nextQuestion']=self.current()['question'] if self.current() else None
  result['complete']=self.current() is None
  return result
