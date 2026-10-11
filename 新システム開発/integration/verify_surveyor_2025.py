import re
import subprocess
import sys
import unicodedata
from pathlib import Path

EXPECTED = [1,5,2,1,4,5,3,1,5,4,3,5,5,2,2,3,3,4,3,4]

def text(path):
    return subprocess.check_output(["pdftotext","-layout",str(path),"-"],text=True)

def verify(question_pdf,answer_pdf):
    pages=text(question_pdf).split("\f")
    answers=unicodedata.normalize("NFKC",text(answer_pdf))
    pages_by_question={}
    for number in range(1,21):
        matches=[i+1 for i,p in enumerate(pages) if re.search(r"^\s*第\s*"+str(number)+r"\s*問\s",p,re.M)]
        if len(matches)!=1:
            raise ValueError(f"Question {number}: {len(matches)} page matches")
        page=pages[matches[0]-1]
        for option in range(1,6):
            if not re.search(r"(?<!\d)"+str(option)+r"\s+[アイウエオ]{2}",page):
                raise ValueError(f"Question {number}: choice {option} missing")
        pages_by_question[number]=matches[0]
    key={}
    for line in answers.splitlines():
        pairs=re.findall(r"第(\d+)問\s+([1-5])",line)
        if pairs:
            number,value=pairs[-1]
            key[int(number)]=int(value)
    if sorted(key)!=list(range(1,21)):
        raise ValueError("Answer coverage incomplete")
    if [key[n] for n in range(1,21)]!=EXPECTED:
        raise ValueError("Answer mapping differs from verified 2025 fixture")
    return pages_by_question,key

if __name__=="__main__":
    if len(sys.argv)!=3:
        raise SystemExit("Usage: python verify_surveyor_2025.py QUESTION.pdf ANSWER.pdf")
    p,k=verify(Path(sys.argv[1]),Path(sys.argv[2]))
    print("PASS: 20 questions, 100 choices, 20 answer entries")
    print("Pages:",p)
    print("Answers:",k)
