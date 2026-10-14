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
ad=fitz.open(a)
for i,p in enumerate(ad):
 text=re.sub(r"\s+"," ",p.get_text("text",sort=True)).strip()
 print("ANSWER_PAGE_DIAGNOSTIC="+json.dumps({"pdfPage":i+1,"textChars":len(text),"textPreview":text[:1000]},ensure_ascii=False))
print(json.dumps({"status":"diagnosed","questionPages":len(qd),"answerPages":len(ad)},ensure_ascii=False))
