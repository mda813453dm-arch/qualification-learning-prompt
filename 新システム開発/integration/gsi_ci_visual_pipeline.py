"""Download fixed official GSI PDF and render two full-page PNGs in CI only."""
import hashlib,json,sys,urllib.request
from pathlib import Path
QUESTION_URL='https://web2.gsi.go.jp/common/000278974.pdf'
ANSWER_URL='https://web2.gsi.go.jp/common/000278975.pdf'
URL=QUESTION_URL
SOURCE_PAGE_URL='https://web2.gsi.go.jp/LAW/SHIKEN/past.html'
PAGES={7:9,27:29}
MAX_BYTES=20_000_000
def fetch_url(url,opener=urllib.request.urlopen):
 request=urllib.request.Request(url,headers={'User-Agent':'QualificationLearningSystem/1.0'})
 with opener(request,timeout=25) as response:
  if response.geturl()!=url:raise ValueError('UNEXPECTED_REDIRECT')
  data=response.read(MAX_BYTES+1)
 if len(data)>MAX_BYTES:raise ValueError('PDF_TOO_LARGE')
 if not data.startswith(b'%PDF-'):raise ValueError('NOT_PDF')
 return data
def fetch_bytes(opener=urllib.request.urlopen):return fetch_url(QUESTION_URL,opener)
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
 report={'sourceUrl':QUESTION_URL,'publishedSourceUrl':SOURCE_PAGE_URL,'pdfSha256':digest,'pdfBytes':len(data),'pageCount':len(doc),'questions':reports,'publishable':False}
 (root/'evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 return report
if __name__=='__main__':
 try:
  root=sys.argv[1] if len(sys.argv)>1 else 'visual-evidence'\n  q=fetch_url(QUESTION_URL);a=fetch_url(ANSWER_URL)\n  result=export(q,root)\n  Path(root,'official-question.pdf').write_bytes(q);Path(root,'official-answer.pdf').write_bytes(a)\n  result['answerUrl']=ANSWER_URL;result['answerPdfSha256']=hashlib.sha256(a).hexdigest()\n  Path(root,'evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps(result,ensure_ascii=False))
 except Exception as exc:
  print(f'OFFICIAL_PDF_PIPELINE_FAILED:{type(exc).__name__}:{exc}',file=sys.stderr)
  raise
