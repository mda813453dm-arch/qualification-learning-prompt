#!/usr/bin/env python3
import fitz,re,json,hashlib,os
from pathlib import Path
QSHA="928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c"
ASHA="3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad"
FW=str.maketrans("０１２３４５６７８９","0123456789")
def norm(s): return re.sub(r"\s+"," ",s.translate(FW)).strip()
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def answer_map(doc):
 t=norm(doc[0].get_text("text",sort=True))
 pairs=[(int(n),int(a)) for n,a in re.findall(r"第\s*(\d+)\s*問\s*([1-5])",t)]
 by={}
 for n,a in pairs: by.setdefault(n,[]).append(a)
 out={}
 for n in range(1,21):
  vals=by.get(n,[])
  if n<=10:
   if len(vals)<2: raise SystemExit(f"AFTERNOON_ANSWER_MISSING_Q{n}")
   out[n]=vals[1]
  else:
   if len(vals)!=1: raise SystemExit(f"AFTERNOON_ANSWER_AMBIGUOUS_Q{n}")
   out[n]=vals[0]
 return out
def split_choices(text,n):
 s=norm(text)
 h=re.search(rf"第\s*{n}\s*問\s*",s)
 if not h: raise SystemExit(f"QUESTION_HEADING_MISSING_Q{n}")
 body=s[h.end():]
 # Five-choice answer row is at the tail of each multiple-choice question.
 ms=list(re.finditer(r"(?:^|\s)1\s+(.+?)\s+2\s+(.+?)\s+3\s+(.+?)\s+4\s+(.+?)\s+5\s+([^\n]+?)(?=\s*─|$)",body))
 if not ms: raise SystemExit(f"CHOICE_ROW_MISSING_Q{n}")
 m=ms[-1];choices=[x.strip() for x in m.groups()]
 stem=body[:m.start()].strip()
 if not stem or len(choices)!=5 or any(not x for x in choices): raise SystemExit(f"QUESTION_INCOMPLETE_Q{n}")
 return stem,choices
def main():
 q=Path(os.environ["RUNNER_TEMP"])/"land-surveyor-2025-pm-question.pdf";a=Path(os.environ["RUNNER_TEMP"])/"land-surveyor-2025-pm-answer.pdf"
 if sha(q)!=QSHA or sha(a)!=ASHA: raise SystemExit("PIN_HASH_MISMATCH")
 qd,ad=fitz.open(q),fitz.open(a);answers=answer_map(ad);items=[]
 for n in range(1,21):
  page=n+3;text=qd[page-1].get_text("text",sort=True);stem,choices=split_choices(text,n)
  diagram=bool(re.search(r"(?:〔図〕|次の図|下図|図に|図の)",stem))
  items.append({"questionNumber":n,"pdfPage":page,"stem":stem,"choices":choices,"correctAnswer":answers[n],
    "answerVerified":True,"fieldId":None,"fieldStatus":"unclassified","diagramReferenceCandidate":diagram,
    "promotionStatus":"blocked_field_and_visual_verification" if diagram else "blocked_field_verification"})
 out=Path(os.environ["RUNNER_TEMP"])/"q038-2025-afternoon-mcq-candidates.json"
 out.write_text(json.dumps({"schemaVersion":1,"qualificationId":"q038","year":2025,"section":"午後","items":items},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"status":"candidate_extraction_complete","count":len(items),"diagramCandidates":[x["questionNumber"] for x in items if x["diagramReferenceCandidate"]],"answers":answers,"output":str(out)},ensure_ascii=False))
if __name__=="__main__":main()
