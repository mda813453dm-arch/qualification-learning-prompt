#!/usr/bin/env python3
import fitz,re,json,hashlib,os
from pathlib import Path
QSHA="928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c";ASHA="3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad"
QURL="https://www.moj.go.jp/content/001450011.pdf";AURL="https://www.moj.go.jp/content/001450015.pdf"
FW=str.maketrans("０１２３４５６７８９","0123456789")
FIELDS={**{n:"q038-civil-law" for n in range(1,4)},**{n:"q038-registration-general" for n in range(4,9)},
 **{n:"q038-land-registration" for n in range(9,12)},**{n:"q038-building-registration" for n in range(12,16)},
 16:"q038-boundary-determination",17:"q038-appeal",18:"q038-inheritance-information",19:"q038-registration-tax",20:"q038-surveyor-law"}
def norm(s):return re.sub(r"\s+"," ",s.translate(FW)).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def answers(doc):
 t=norm(doc[0].get_text("text",sort=True));by={}
 for n,a in re.findall(r"第\s*(\d+)\s*問\s*([1-5])",t):by.setdefault(int(n),[]).append(int(a))
 return {n:(by[n][1] if n<=10 else by[n][0]) for n in range(1,21)}
def question(page,n):
 raw=norm(page.get_text("text",sort=True));h=re.search(rf"第\s*{n}\s*問\s*",raw)
 if not h:raise SystemExit(f"HEADING_MISSING_Q{n}")
 body=raw[h.end():];ms=list(re.finditer(r"(?:^|\s)1\s+(.+?)\s+2\s+(.+?)\s+3\s+(.+?)\s+4\s+(.+?)\s+5\s+(.+?)(?=\s*─|$)",body))
 if not ms:raise SystemExit(f"CHOICES_MISSING_Q{n}")
 m=ms[-1];stem=body[:m.start()].strip();choices=[x.strip() for x in m.groups()]
 if not stem or any(not x for x in choices):raise SystemExit(f"TEXT_INCOMPLETE_Q{n}")
 return stem,choices
def visual(page,n):
 if page.get_images(full=True):raise SystemExit(f"RASTER_VISUAL_REVIEW_REQUIRED_Q{n}")
 rects=[d["rect"] for d in page.get_drawings()]
 # Verified 2025 MCQ page furniture is confined to the extreme left margin.
 if any(r.x1>10 for r in rects):raise SystemExit(f"VECTOR_VISUAL_REVIEW_REQUIRED_Q{n}")
 return {"status":"verified","diagramRequired":False,"method":"no_raster_and_vectors_confined_to_page_furniture","drawingCount":len(rects)}
def main():
 q=Path(os.environ["RUNNER_TEMP"])/"land-surveyor-2025-pm-question.pdf";a=Path(os.environ["RUNNER_TEMP"])/"land-surveyor-2025-pm-answer.pdf"
 if sha(q)!=QSHA or sha(a)!=ASHA:raise SystemExit("PIN_HASH_MISMATCH")
 qd,ad=fitz.open(q),fitz.open(a);ans=answers(ad);groups={}
 for n in range(1,21):
  page_no=n+3;page=qd[page_no-1];stem,choices=question(page,n);vr=visual(page,n);field=FIELDS[n]
  packet={"questionId":f"q038:2025:午後:{n}","year":2025,"section":"午後","questionNumber":n,"fieldId":field,
   "stem":stem,"choices":choices,"correctAnswer":ans[n],"diagramRequired":False,"diagramAssets":[],
   "packetStatus":"verified_official","questionPdfUrl":QURL,"answerPdfUrl":AURL,"questionPdfSha256":QSHA,"answerPdfSha256":ASHA,
   "evidence":{"questionPdfPage":page_no,"answerPdfPage":1,"visual":vr,"field":{"method":"code_owned_learning_unit_map","questionTopic":stem[:80]}},
   "verification":{"questionText":"official_pdf_checked","choices":"official_pdf_checked","visual":"question_level_pdf_graphics_checked","answer":"same_year_official_answer_checked","field":"verified"}}
  groups.setdefault(field,[]).append(packet)
 outdir=Path("data/runtime-packets/verified");outdir.mkdir(parents=True,exist_ok=True)
 for field,packets in groups.items():
  data={"schemaVersion":1,"qualificationId":"q038","fieldId":field,"year":2025,"verificationStatus":"verified_official","sourceAuthority":"法務省","packets":packets}
  (outdir/f"q038-2025-{field.removeprefix('q038-')}.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"status":"verified_official","packetCount":20,"fields":{k:len(v) for k,v in groups.items()}},ensure_ascii=False))
if __name__=="__main__":main()
