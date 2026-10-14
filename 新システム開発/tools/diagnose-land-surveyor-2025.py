#!/usr/bin/env python3
import fitz,re,json,os
from pathlib import Path
q=Path(os.environ["RUNNER_TEMP"])/"land-surveyor-2025-pm-question.pdf"
a=Path(os.environ["RUNNER_TEMP"])/"land-surveyor-2025-pm-answer.pdf"
if not q.exists() or not a.exists(): raise SystemExit("VERIFIED_PDFS_REQUIRED")
head=re.compile(r"(?:^|\n)[ \t　]*(?:第[ \t　]*)?問[ \t　]*(\d{1,2})",re.M)
qd=fitz.open(q); rows=[]
for i,p in enumerate(qd):
 text=p.get_text("text",sort=True)
 nums=[int(x) for x in head.findall(text)]
 rows.append({"pdfPage":i+1,"questionHeadings":nums,"images":len(p.get_images(full=True)),"drawings":len(p.get_drawings()),"textChars":len(text)})
print("QUESTION_PAGE_DIAGNOSTICS="+json.dumps(rows,ensure_ascii=False))
for page_no in range(4,24):
 p=qd[page_no-1]
 rects=[list(map(lambda z:round(float(z),1),d["rect"])) for d in p.get_drawings()]
 imgs=[{"xref":x[0]} for x in p.get_images(full=True)]
 print("MCQ_VISUAL_DIAGNOSTIC="+json.dumps({"pdfPage":page_no,"pageRect":[p.rect.width,p.rect.height],"drawingRects":rects,"images":imgs},ensure_ascii=False))
for page_no in list(range(4,8))+list(range(24,39)):
 p=qd[page_no-1]
 text=re.sub(r"\\s+"," ",p.get_text("text",sort=True)).strip()
 print("AFTERNOON_TEXT_PREVIEW="+json.dumps({"pdfPage":page_no,"text":text[:1800]},ensure_ascii=False))
ad=fitz.open(a)
for i,p in enumerate(ad):
 text=re.sub(r"\s+"," ",p.get_text("text",sort=True)).strip()
 print("ANSWER_PAGE_DIAGNOSTIC="+json.dumps({"pdfPage":i+1,"textChars":len(text),"textPreview":text[:1000]},ensure_ascii=False))
print(json.dumps({"status":"diagnosed","questionPages":len(qd),"answerPages":len(ad)},ensure_ascii=False))
