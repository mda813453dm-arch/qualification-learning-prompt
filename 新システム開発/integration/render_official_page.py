"""Render entire PDF pages to PNG, preserving figures and tables without cropping."""
import hashlib
from pathlib import Path
def render_page(pdf_path, *, expected_sha256, page_number, output_path, dpi=180):
 import fitz
 data=Path(pdf_path).read_bytes()
 digest=hashlib.sha256(data).hexdigest()
 if not isinstance(expected_sha256,str) or digest!=expected_sha256:raise ValueError('PDF_PIN_MISMATCH')
 if type(page_number) is not int or page_number<1:raise ValueError('PAGE_NUMBER_INVALID')
 if type(dpi) is not int or not 100<=dpi<=300:raise ValueError('DPI_INVALID')
 doc=fitz.open(stream=data,filetype='pdf')
 if page_number>len(doc):raise ValueError('PAGE_OUT_OF_RANGE')
 page=doc[page_number-1]
 if not page.get_text().strip():raise ValueError('PAGE_TEXT_MISSING')
 pix=page.get_pixmap(matrix=fitz.Matrix(dpi/72,dpi/72),alpha=False)
 png=pix.tobytes('png')
 path=Path(output_path);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(png)
 return {'pdfSha256':digest,'pageNumber':page_number,'pageTextChars':len(page.get_text()),'pngSha256':hashlib.sha256(png).hexdigest(),'pngBytes':len(png),'pixelWidth':pix.width,'pixelHeight':pix.height,'visualPageReviewed':False,'mobileRenderingVerified':False,'publishable':False}
