"""Independent PDF text cross-check; visual content is never auto-approved."""
import difflib,hashlib,subprocess,unicodedata
from pathlib import Path
QUESTION_SHA256='928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c'
def normalized(s):
 return ''.join(unicodedata.normalize('NFKC',s).split())
def audit_question_pdf(path):
 import fitz
 raw=Path(path).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=QUESTION_SHA256:raise ValueError('QUESTION_PDF_PIN_MISMATCH')
 text=subprocess.check_output(['pdftotext','-layout',str(path),'-'],stderr=subprocess.DEVNULL,timeout=30).decode('utf-8').split('\f')
 doc=fitz.open(stream=raw,filetype='pdf')
 if len(doc)<24 or len(text)<24:raise ValueError('PDF_PAGES_MISSING')
 reports=[]
 for number in range(1,21):
  page_idx=number+2
  first=normalized(text[page_idx]);page=doc[page_idx];second=normalized(page.get_text())
  if not first or not second:raise ValueError(f'EMPTY_PAGE_TEXT:{number}')
  ratio=difflib.SequenceMatcher(None,first,second,autojunk=False).ratio()
  reports.append({'number':number,'pdfPage':page_idx+1,'match':first==second,'similarity':ratio,'normalizedChars':len(first),'imageCount':len(page.get_images()),'drawingCount':len(page.get_drawings()),'visualCompletenessVerified':False,'publishable':False})
 return {'total':len(reports),'exactMatches':sum(r['match'] for r in reports),'publishable':0,'reports':reports}
