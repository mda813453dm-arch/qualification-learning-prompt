"""Crop the original figure from the pinned 2025 morning examination PDF."""
import hashlib
from pathlib import Path
import fitz
EXPECTED_PDF_SHA256='4a90ae3875c14c1eeda4b3ac9a32c6387b69b5cc15d0f5b62a99514af78267d0'
PAGE=8
CROP=(88,203,515,501)
REQUIRED=['新点Ｂ','既知点Ａ','偏心点Ｃ','零方向','φ']
def crop_q5(pdf_path,output_path):
 data=Path(pdf_path).read_bytes()
 if hashlib.sha256(data).hexdigest()!=EXPECTED_PDF_SHA256:raise ValueError('PDF_HASH_MISMATCH')
 doc=fitz.open(stream=data,filetype='pdf')
 if len(doc)<PAGE:raise ValueError('PAGE_MISSING')
 page=doc[PAGE-1]
 text=page.get_text()
 if not ('第５問' in text or '第5 問' in text or '第5問' in text):raise ValueError('QUESTION_MISMATCH')
 image=page.get_pixmap(matrix=fitz.Matrix(2.6,2.6),clip=fitz.Rect(*CROP),alpha=False).tobytes('png')
 Path(output_path).write_bytes(image)
 return {'question':5,'page':PAGE,'pdfSha256':EXPECTED_PDF_SHA256,'imageSha256':hashlib.sha256(image).hexdigest(),'crop':CROP,'visualReviewRequired':True,'publishable':False}
