"""Fail-closed gate for official survey exam PDF and page review."""
from hashlib import sha256
import re
def classify_pdf(*,source_url,pdf_bytes=None,question_number=None,rendered_page=None,reviewed=False):
 if not re.fullmatch(r'https://www\.gsi\.go\.jp/common/[0-9]{9}\.pdf',source_url):
  return {'status':'unavailable','reason':'UNTRUSTED_SOURCE'}
 if not isinstance(pdf_bytes,bytes) or not pdf_bytes.startswith(b'%PDF-'):
  return {'status':'unavailable','reason':'QUESTION_PDF_NOT_RETRIEVED'}
 if type(question_number) is not int or not 1<=question_number<=28:
  return {'status':'unavailable','reason':'QUESTION_ID_NOT_VERIFIED'}
 if not isinstance(rendered_page,bytes) or len(rendered_page)<100 or not reviewed:
  return {'status':'unavailable','reason':'VISUAL_PAGE_REVIEW_REQUIRED','questionPdfSha256':sha256(pdf_bytes).hexdigest()}
 return {'status':'pending','reason':'ANSWER_AND_QUESTION_BINDING_REQUIRED','questionPdfSha256':sha256(pdf_bytes).hexdigest()}
