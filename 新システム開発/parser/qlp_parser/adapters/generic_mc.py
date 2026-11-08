"""資格に依存しない、検証可能な択一式PDF限定の共通解析器。

問題：行頭「問1」「第1問」「問題1」と、1〜10またはア〜コの選択肢。
正答：別PDFに行単位「問1 正解 3」「問1 3」等を明記したものに限る。
文章をテキスト層から検証可能な範囲で抽出する。図表・式が不明瞭な問、
本文または選択肢が抽出できない問は原本画像を保持し、未検証と明記する。
曖昧な正答・不完全な選択肢・記述式は除外する。
"""
import re
import unicodedata
from ..core import ParseError, RawQuestion, clean_text

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
        starts=[]
        for j, (_, t, _, _) in enumerate(body[1:], 1):
            match=_OPTION.match(t)
            if match:
                label=int(match[1]) if match[1] else _MARKS.index(match[2])+1
                choices.append(label)
                starts.append(j)
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
        # 問号・連続する選択肢番号は本文の根拠にはならない。全選択肢の本文が
        # 存在し、本文も取得できた問だけ text にする。図表が埋め込まれた問は
        # 画像を保持して原本照合待ちとする（文字の誤欠落を隠さない）。
        stem_lines=[_HEADING.sub('',body[0][1],count=1).strip()] + [r[1] for r in body[1:starts[0]]]
        stem=clean_text('\n'.join(stem_lines))
        option_text=[]
        for i, begin in enumerate(starts):
            stop=starts[i+1] if i+1<len(starts) else len(body)
            first=_OPTION.sub('',body[begin][1],count=1).strip()
            option_text.append(clean_text('\n'.join([first]+[r[1] for r in body[begin+1:stop]])))
        has_visual=False
        for pn in pages:
            page=doc[pn-1]
            rows=[r for r in body if r[0]==pn]
            top=min(r[2] for r in rows)-5
            bottom=max(r[3] for r in rows)+5
            # 表紙のロゴ・別問の図を同じページに含むだけでは、この問を
            # 画像扱いにしない。必ずこの問の縦範囲と交差する図を検出する。
            imgs=page.get_image_info() if hasattr(page,'get_image_info') else []
            if any((isinstance(i,dict) and i.get('bbox') and
                    i['bbox'][3]>top and i['bbox'][1]<bottom)
                   for i in imgs):
                has_visual=True
                break
            # 表の罫線やベクトル図形は get_image_info() では検出できない。
            drawings=page.get_drawings() if hasattr(page,'get_drawings') else []
            if any(d.get('rect') is not None and d['rect'].y1>top and d['rect'].y0<bottom
                   for d in drawings):
                has_visual=True
                break
        complete=bool(stem and all(option_text) and not has_visual)
        if complete:
            questions.append(RawQuestion(number=number,stem=stem,choices=option_text,
              pages=pages,has_graphics=False,stem_mode='text',choice_mode='text',
              notes=['generic_pdf_text_layer_extracted', 'manual_visual_comparison_pending']))
        else:
            questions.append(RawQuestion(number=number,stem='',choices=[str(i) for i in range(1,len(choices)+1)],
              pages=pages,has_graphics=True,stem_mode='official_image',choice_mode='official_image',
              crops=crops,preserve_aspect=True,notes=['generic_official_question_image',
                'text_or_graphics_not_independently_verified']))
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
