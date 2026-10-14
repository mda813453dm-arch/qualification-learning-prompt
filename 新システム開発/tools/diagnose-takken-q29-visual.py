#!/usr/bin/env python3
import fitz,os,json,re
from pathlib import Path
p=Path(os.environ["RUNNER_TEMP"])/"takken-2025-verified.pdf";d=fitz.open(p);page=d[16]
text=page.get_text("dict",sort=True);blocks=[]
for b in text.get("blocks",[]):
 blocks.append({"type":b.get("type"),"bbox":[round(x,1) for x in b.get("bbox",[0,0,0,0])],"text":" ".join(s.get("text","") for l in b.get("lines",[]) for s in l.get("spans",[]))[:160]})
draw=[{"rect":[round(float(x),1) for x in z["rect"]],"items":len(z.get("items",[]))} for z in page.get_drawings()]
imgs=[{"xref":x[0]} for x in page.get_images(full=True)]
print("TAKKEN_Q29_VISUAL="+json.dumps({"page":17,"pageRect":[page.rect.width,page.rect.height],"images":imgs,"drawings":draw,"blocks":blocks},ensure_ascii=False))
