"""Download fixed official GSI PDF and render two full-page PNGs in CI only."""
import hashlib,json,sys,urllib.request
from pathlib import Path
URL='https://www.gsi.go.jp/common/000278974.pdf'
PAGES={7:9,27:29}
MAX_BYTES=20_000_000
def fetch_bytes(opener=urllib.request.urlopen):
 request=urllib.request.Request(URL,headers={'User-Agent':'QualificationLearningSystem/1.0'})
 with opener(request,timeout=25) as response:
  if response.geturl()!=URL:raise ValueError('UNEXPECTED_REDIRECT')
  data=response.read(MAX_BYTES+1)
 if len(data)>MAX_BYTES:raise ValueError('PDF_TOO_LARGE')
 if not data.startswith(b'%PDF-'):raise ValueError('NOT_PDF')
 return data
def export(data,directory):
 import fitz
 if not isinstance(data,bytes) or not data.startswith(b'%PDF-'):raise ValueError('NOT_PDF')
 root=Path(directory);root.mkdir(parents=True,exist_ok=True)
 doc=fitz.open(stream=data,filetype='pdf')
 if len(doc)<max(PAGES.values()):raise ValueError('PDF_PAGE_COUNT_INVALID')
 digest=hashlib.sha256(data).hexdigest()
 reports=[]
 for question,page_number in PAGES.items():
  page=doc[page_number-1]
  if not page.get_text().strip():raise ValueError('QUESTION_PAGE_TEXT_EMPTY')
  png=page.get_pixmap(matrix=fitz.Matrix(2.5,2.5),alpha=False).tobytes('png')
  filename=f'question_{question}_page_{page_number}.png'
  (root/filename).write_bytes(png)
  reports.append({'questionNumber':question,'pdfPage':page_number,'imageFile':filename,'imageSha256':hashlib.sha256(png).hexdigest(),'textChars':len(page.get_text()),'pageReview':'PENDING','mobileRenderingVerified':False,'publishable':False})
 report={'sourceUrl':URL,'pdfSha256':digest,'pdfBytes':len(data),'pageCount':len(doc),'questions':reports,'publishable':False}
 (root/'evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 return report
if __name__=='__main__':
 try:
  result=export(fetch_bytes(),sys.argv[1] if len(sys.argv)>1 else 'visual-evidence')
  print(json.dumps(result,ensure_ascii=False))
 except Exception as exc:
  print(f'OFFICIAL_PDF_PIPELINE_FAILED:{type(exc).__name__}:{exc}',file=sys.stderr)
  raise
