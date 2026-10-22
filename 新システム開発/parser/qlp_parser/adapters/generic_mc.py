"""資格に依存しない、検証可能な択一式PDF限定の共通解析器。

問題：行頭「問1」「第1問」「問題1」と、1〜10またはア〜コの選択肢。
正答：別PDFに行単位「問1 正解 3」「問1 3」等を明記したものに限る。
図・式・文章はPDF原本の問単位画像で表示し、OCR文字を正本にしない。
曖昧な正答・不完全な選択肢・記述式は除外する。
"""
import re
import unicodedata
from ..core import ParseError, RawQuestion

QUALIFICATION_ID = "generic"
SECTION = "択一"
CHOICE_COUNT = 0
_MARKS = "アイウエオカキクケコ"
_HEADING = re.compile(r"^(?:第\s*(\d{1,3})\s*問|(?:問|問題)\s*(\d{1,3}))(?:\s|[\s:：．.）)]|$)")
_OPTION = re.compile(r"^\s*(?:(\d{1,2})[.．)）]|([アイウエオカキクケコ])[.．)）\s])\s*")
_ANSWER = re.compile(r"^(?:第\s*)?(?:問|問題)\s*(\d{1,3})(?:\s*問)?\s*(?:正解|正答|解答)?\s*[:：=－-]?\s*([0-9]{1,2}|[アイウエオカキクケコ])\s*$")


def _norm(text):
    return unicodedata.normalize("NFKC", text).strip()


def parse_questions(doc):
    lines = []
    for page_no, page in enumerate(doc, 1):
        blocks = sorted(page.get_text("blocks"), key=lambda x:(round(x[1]), x[0]))
        for b in blocks:
            for line in b[4].splitlines():
                t = _norm(line)
                if t: lines.append((page_no, t, b[1], b[3]))
    starts = [(i,int(next(g for g in m.groups() if g is not None))) for i, (_, t, _, _) in enumerate(lines) if (m := _HEADING.match(t))]
    if not starts:
        raise ParseError("GENERIC_QUESTION_HEADINGS_NOT_FOUND")
    questions=[]
    for k, (start, number) in enumerate(starts):
        body=lines[start:(starts[k+1][0] if k+1<len(starts) else len(lines))]
        choices=[]
        for _, t, _, _ in body[1:]:
            match=_OPTION.match(t)
            if match:
                label=int(match[1]) if match[1] else _MARKS.index(match[2])+1
                choices.append(label)
        # Numerically consistent, contiguous option labels only. Refuse guessed count.
        if not (2 <= len(choices) <= 10 and choices == list(range(1,len(choices)+1))):
            continue
        pages=sorted({r[0] for r in body})
        crops=[]
        for pn in pages:
            rows=[r for r in body if r[0]==pn]
            rect=doc[pn-1].rect
            top=max(rect.y0,min(r[2] for r in rows)-8)
            bottom=min(rect.y1,max(r[3] for r in rows)+8)
            if bottom <= top: continue
            crops.append((pn,(rect.x0+12,top,rect.x1-12,bottom)))
        questions.append(RawQuestion(number=number,stem="",choices=[str(i) for i in range(1,len(choices)+1)],
          pages=pages,has_graphics=True,stem_mode="official_image",choice_mode="official_image",
          crops=crops,preserve_aspect=True,notes=["generic_official_question_image", "unverified_ocr_text_not_used"]))
    return questions


def parse_answers(doc):
    answers={}
    for page in doc:
        for line in page.get_text("text",sort=True).splitlines():
            m=_ANSWER.match(_norm(line))
            if not m: continue
            n=int(m[1]); raw=m[2]
            value=int(raw) if raw.isdigit() else _MARKS.index(raw)+1
            if n in answers and answers[n]!=value:
                raise ParseError("GENERIC_ANSWER_CONFLICT",question=n)
            answers[n]=value
    if not answers:
        raise ParseError("GENERIC_OFFICIAL_ANSWER_NOT_MACHINE_VERIFIABLE")
    return answers


def classify(question):
    return {"fieldId":"generic_uploaded_mc","method":"explicit_pdf_question_number", "verified":True}
