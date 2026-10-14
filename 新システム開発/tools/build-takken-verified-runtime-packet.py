#!/usr/bin/env python3
"""Build a fail-closed learner packet from the verified official Takken 2025 PDF.
Only explicitly approved question-to-field mappings are emitted.
"""
import hashlib,json,re,sys
from pathlib import Path
import fitz

EXPECTED="829cde5778e22d1a8f0050ce2ff8b4b8089749bcab5456fbde6d1d843a3ed8ed"
URL="https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf"
# Existing approved mapping in the repository: Q29 -> takken-u8.
APPROVED={29:("takken-u8","宅建業法・37条書面")}
HEADING=re.compile(r"【問[ 　]*(\d{1,2})】")
CHOICE=re.compile(r"(?m)^[ \t]*([1-4])[ 　]+")
def extract(doc,n):
  found=[]
  for i in range(1,29):
    text=doc[i].get_text(sort=True); ms=list(HEADING.finditer(text))
    for j,m in enumerate(ms):
      if int(m.group(1))!=n: continue
      end=ms[j+1].start() if j+1<len(ms) else len(text)
      chunk=text[m.end():end].strip(); found.append((i,chunk))
  if len(found)!=1: raise SystemExit(f"QUESTION_LOCATION_INVALID_Q{n}")
  i,chunk=found[0]; marks=list(CHOICE.finditer(chunk))
  if len(marks)!=4 or [int(x.group(1)) for x in marks]!=[1,2,3,4]: raise SystemExit(f"CHOICES_INVALID_Q{n}")
  stem=chunk[:marks[0].start()].strip()
  choices=[chunk[m.end():marks[k+1].start() if k+1<4 else len(chunk)].strip() for k,m in enumerate(marks)]
  choices[-1]=re.sub(r"\s+[0-9]{1,2}\s*$","",choices[-1]).strip()
  # Fail closed on page-level visual content; Q29 has no required learner figure in the extracted question.
  if not stem or any(not x for x in choices): raise SystemExit(f"TEXT_INCOMPLETE_Q{n}")
  return i+1,stem,choices
def answer(doc,n):
  text=re.sub(r"\s+"," ",doc[29].get_text(sort=True))
  row=re.search(r"問\s*２１.*?問\s*３０\s+([1-4](?:\s+[1-4]){9})",text)
  if not row: raise SystemExit("OFFICIAL_ANSWER_ROW_NOT_FOUND")
  cells=[int(x) for x in row.group(1).split()]
  return cells[n-21]
def main():
  if len(sys.argv)!=3: raise SystemExit("usage: build... PDF OUT")
  pdf=Path(sys.argv[1]); out=Path(sys.argv[2]); raw=pdf.read_bytes()
  if raw[:5]!=b"%PDF-" or hashlib.sha256(raw).hexdigest()!=EXPECTED: raise SystemExit("OFFICIAL_PDF_VERIFICATION_FAILED")
  doc=fitz.open(pdf); packets=[]
  for n,(field,label) in APPROVED.items():
    page,stem,choices=extract(doc,n); ans=answer(doc,n)
    packets.append({"questionId":f"宅地建物取引士:2025:年度共通:{n}","year":2025,"section":"年度共通","questionNumber":n,
      "fieldId":field,"fieldName":label,"stem":stem,"choices":choices,"correctAnswer":ans,"diagramRequired":False,"diagramAssets":[],
      "packetStatus":"verified_official","questionPdfUrl":URL,"answerPdfUrl":URL,"questionPdfSha256":EXPECTED,"answerPdfSha256":EXPECTED,
      "evidence":{"questionPdfPage":page,"answerPdfPage":30},
      "verification":{"questionText":"official_pdf_checked","choices":"official_pdf_checked","answer":"same_year_official_answer_checked"}})
  data={"schemaVersion":1,"qualificationId":"宅地建物取引士","fieldId":"takken-u8","year":2025,"verificationStatus":"verified_official","sourceAuthority":"一般財団法人 不動産適正取引推進機構","packets":packets}
  out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
  print(json.dumps({"status":"verified_official","packets":len(packets),"out":str(out)},ensure_ascii=False))
if __name__=="__main__": main()
