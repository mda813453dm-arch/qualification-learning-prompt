"""Independent column-position check of afternoon answer cells (text extraction only)."""
import hashlib,re,subprocess,unicodedata
from pathlib import Path
EXPECTED_HASH='3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad'
CELL=re.compile(r'第\s*(\d+)\s*問\s+([1-5])')
def verify_answer_cells(pdf_path):
 data=Path(pdf_path).read_bytes()
 if hashlib.sha256(data).hexdigest()!=EXPECTED_HASH:raise ValueError('ANSWER_PDF_HASH_MISMATCH')
 text=unicodedata.normalize('NFKC',subprocess.check_output(['pdftotext','-layout',str(pdf_path),'-']).decode('utf-8'))
 lines=text.splitlines()
 header=next((i for i,line in enumerate(lines) if '午前の部' in line and '午後の部' in line),None)
 if header is None:raise ValueError('COLUMN_HEADER_MISSING')
 paired=[list(CELL.finditer(line)) for line in lines[header+1:] if len(list(CELL.finditer(line)))==2]
 if len(paired)!=10:raise ValueError('PAIRED_ROWS_INVALID')
 column=min(pair[1].start() for pair in paired)
 if len({pair[1].start() for pair in paired})!=1:raise ValueError('AFTERNOON_COLUMN_UNSTABLE')
 answers={};rows={}
 for line_number,line in enumerate(lines[header+1:],header+2):
  afternoon=[m for m in CELL.finditer(line) if m.start()==column]
  if len(afternoon)>1:raise ValueError('MULTIPLE_AFTERNOON_CELLS')
  if afternoon:
   m=afternoon[0];n=int(m.group(1))
   if n in answers:raise ValueError('DUPLICATE_AFTERNOON_CELL')
   answers[n]=int(m.group(2));rows[n]={'line':line_number,'column':m.start(),'text':m.group(0)}
 if sorted(answers)!=list(range(1,21)):raise ValueError('AFTERNOON_COVERAGE_INVALID')
 return answers,rows
