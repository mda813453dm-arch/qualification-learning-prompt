"""Prepare review images from a separately obtained PDF; source remains unverified."""
import hashlib,json,sys
from pathlib import Path
PAGES={7:9,27:29}
MAX_BYTES=20_000_000
def prepare(pdf_path,output_dir,*,claimed_source_url='https://www.gsi.go.jp/common/000278974.pdf'):
 import fitz
 raw=Path(pdf_path).read_bytes()
 if len(raw)>MAX_BYTES or not raw.startswith(b'%PDF-'):raise ValueError('INVALID_PDF_INPUT')
 doc=fitz.open(stream=raw,filetype='pdf')
 if doc.is_encrypted or len(doc)<29:raise ValueError('PDF_PAGE_COUNT_OR_ENCRYPTION_INVALID')
 output=Path(output_dir);output.mkdir(parents=True,exist_ok=True)
 entries=[]
 for number,page_num in PAGES.items():
  page=doc[page_num-1]
  if not page.get_text().strip():raise ValueError('QUESTION_PAGE_TEXT_EMPTY')
  png=page.get_pixmap(matrix=fitz.Matrix(2.5,2.5),alpha=False).tobytes('png')
  name=f'question_{number}_page_{page_num}_full.png'
  (output/name).write_bytes(png)
  entries.append({'questionNumber':number,'pdfPage':page_num,'imageFile':name,'pngSha256':hashlib.sha256(png).hexdigest(),'textChars':len(page.get_text()),'questionIdentityVerified':False,'visualCompletenessVerified':False,'mobileRenderingVerified':False,'publishable':False})
 evidence={'claimedSourceUrl':claimed_source_url,'sourceProvenance':'USER_OR_EXTERNAL_FILE_UNVERIFIED','pdfSha256':hashlib.sha256(raw).hexdigest(),'pdfBytes':len(raw),'pageCount':len(doc),'questions':entries,'publishable':False}
 (output/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
 return evidence
if __name__=='__main__':
 if len(sys.argv)!=3:raise SystemExit('Usage: python offline_survey_visual.py INPUT_PDF OUTPUT_DIR')
 print(json.dumps(prepare(sys.argv[1],sys.argv[2]),ensure_ascii=False))
