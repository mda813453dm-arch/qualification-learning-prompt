"""2025年度土地家屋調査士・午前択一10問の完全性監査。
問題番号・本文・図の要否・公式PDF内画像・選択肢・正答表を機械照合する。
"""
import fitz,re,hashlib,unicodedata,subprocess
from pathlib import Path

QUESTION_SHA256="4a90ae3875c14c1eeda4b3ac9a32c6387b69b5cc15d0f5b62a99514af78267d0"
ANSWER_SHA256="3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad"
EXPECTED_ANSWERS={1:5,2:4,3:4,4:3,5:2,6:4,7:2,8:1,9:2,10:3}

def audit(question_pdf, answer_pdf):
    qb=Path(question_pdf).read_bytes(); ab=Path(answer_pdf).read_bytes()
    if hashlib.sha256(qb).hexdigest()!=QUESTION_SHA256: raise ValueError("QUESTION_PDF_HASH_MISMATCH")
    if hashlib.sha256(ab).hexdigest()!=ANSWER_SHA256: raise ValueError("ANSWER_PDF_HASH_MISMATCH")
    doc=fitz.open(stream=qb,filetype="pdf")
    results=[]
    for n in range(1,11):
        page=doc[n+2]
        text=unicodedata.normalize("NFKC",page.get_text("text"))
        if not re.search(fr"第\s*{n}\s*問",text): raise ValueError(f"QUESTION_HEADING_MISSING:{n}")
        for k in range(1,6):
            if not re.search(fr"(?<!\d){k}\s+",text): raise ValueError(f"CHOICE_MISSING:{n}:{k}")
        needs_figure="〔図〕" in text
        images=page.get_images(full=True)
        if needs_figure and len(images)!=1: raise ValueError(f"FIGURE_IMAGE_COUNT_INVALID:{n}")
        if not needs_figure and images: raise ValueError(f"UNEXPECTED_IMAGE:{n}")
        image=None
        if images:
            info=doc.extract_image(images[0][0])
            image={"width":info["width"],"height":info["height"],"ext":info["ext"],
                   "sha256":hashlib.sha256(info["image"]).hexdigest()}
        results.append({"number":n,"pdfPage":n+3,"hasFigure":needs_figure,"image":image})
    answer_text=unicodedata.normalize("NFKC",subprocess.check_output(["pdftotext","-layout",str(answer_pdf),"-"]).decode())
    for n,a in EXPECTED_ANSWERS.items():
        line=next((x for x in answer_text.splitlines() if re.search(fr"第\s*{n}\s*問",x)),None)
        if line is None or not re.search(fr"第\s*{n}\s*問\s+{a}\b",line): raise ValueError(f"ANSWER_MISMATCH:{n}")
    return {"ok":True,"questions":results,"answers":EXPECTED_ANSWERS}
