"""Generate optional readable text crop while preserving original full page as fallback."""
import hashlib
from pathlib import Path
def render_readable_pair(pdf_path,expected_sha256,page_number,output_dir,dpi=180):
 import fitz
 raw=Path(pdf_path).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=expected_sha256:raise ValueError('PDF_HASH_MISMATCH')
 if type(page_number) is not int or page_number<1:raise ValueError('INVALID_PAGE')
 if type(dpi) is not int or not 100<=dpi<=300:raise ValueError('INVALID_DPI')
 doc=fitz.open(stream=raw,filetype='pdf')
 if page_number>len(doc):raise ValueError('PAGE_OUT_OF_RANGE')
 page=doc[page_number-1]
 root=Path(output_dir);root.mkdir(parents=True,exist_ok=True)
 scale=fitz.Matrix(dpi/72,dpi/72)
 full=page.get_pixmap(matrix=scale,alpha=False).tobytes('png')
 full_path=root/f'page_{page_number}_full.png';full_path.write_bytes(full)
 blocks=[fitz.Rect(b[:4]) for b in page.get_text('blocks') if str(b[4]).strip()]
 if not blocks:raise ValueError('NO_TEXT_BLOCKS')
 # Exclude only the bottommost page-number region from the optional crop.
 content=[r for r in blocks if r.y0<page.rect.height*.88]
 if not content:raise ValueError('NO_CONTENT')
 union=content[0]
 for r in content[1:]:union|=r
 clip=fitz.Rect(max(0,union.x0-18),max(0,union.y0-15),min(page.rect.width,union.x1+18),min(page.rect.height,union.y1+22))
 crop=page.get_pixmap(matrix=scale,clip=clip,alpha=False).tobytes('png')
 crop_path=root/f'page_{page_number}_readable.png';crop_path.write_bytes(crop)
 return {'fullPng':str(full_path),'readablePng':str(crop_path),'fullSha256':hashlib.sha256(full).hexdigest(),'readableSha256':hashlib.sha256(crop).hexdigest(),'croppedImageRequiresVisualReview':True,'mobileRenderingVerified':False,'publishable':False}
