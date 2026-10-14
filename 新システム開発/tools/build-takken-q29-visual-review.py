#!/usr/bin/env python3
import fitz,json,os,re
from pathlib import Path
pdf=Path(os.environ["RUNNER_TEMP"])/"takken-2025-verified.pdf";doc=fitz.open(pdf);page=doc[16]
blocks=page.get_text("blocks",sort=True)
q29=[b for b in blocks if "【問　29】" in b[4]]
q30=[b for b in blocks if "【問　30】" in b[4]]
if len(q29)!=1 or len(q30)!=1:raise SystemExit("Q29_BOUNDARY_NOT_FOUND")
top=q29[0][1];bottom=q30[0][1];content=fitz.Rect(45,top-5,page.rect.width-45,bottom-5)
if page.get_images(full=True):raise SystemExit("Q29_RASTER_IMAGE_REVIEW_REQUIRED")
relevant=[]
page_area=page.rect.get_area()
for d in page.get_drawings():
 r=d["rect"];area=max(0,r.get_area())
 if area>=page_area*.8:continue
 if r.intersects(content):relevant.append([round(float(x),1) for x in r])
if relevant:raise SystemExit("Q29_VECTOR_VISUAL_REVIEW_REQUIRED:"+json.dumps(relevant))
out=Path(str(pdf)+".visual-review.json")
out.write_text(json.dumps({"29":{"status":"verified","diagramRequired":False,"method":"question_bbox_graphics_scan","pdfPage":17,"questionRect":[round(float(x),1) for x in content]}},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"status":"verified","questionNumber":29,"diagramRequired":False,"questionRect":[round(float(x),1) for x in content]},ensure_ascii=False))
