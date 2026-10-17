"""賃貸不動産経営管理士（賃管）アダプタ。

形式（2015〜2025年度の公式PDFで確認）:
- 問題は宅建と同じ形（見出し「【問 n】」、4択「1 」〜「4 」）なので、宅建の読み取りを使う。
  2015年度は紙をスキャンしたPDF（OCRで読む）。
- 正答は別PDFの「正解番号表」。「問1 1 問26 1 …」のように問番号と正解が1つずつ交互に並ぶ。
  正解が「-」の問や「全ての解答を正解として取り扱う」と注記された問は、1つの正答で採点できない問として扱う。
"""

import re
import unicodedata

from .. import fields
from .. import ocr
from ..core import ANSWER_SPECIAL, ParseError
from . import takken

QUALIFICATION_ID = "q097"
SECTION = "年度共通"
CHOICE_COUNT = 4
QUESTION_COUNT = 50

parse_questions = takken.parse_questions

_PAIR = re.compile(r"問\s*([0-9]{1,2})(?![0-9])\s*([1-4]|[-－‐―ー]|正解なし)(?![0-9、,，・])")
_MULTI = re.compile(r"問\s*([0-9]{1,2})(?![0-9])\s*[1-4]\s*[、,，・]\s*[1-4]")
_ALL_CORRECT = re.compile(r"問\s*([0-9]{1,2})(?:(?!問\s*[0-9]).){0,60}?(全ての解答を正解|全員を?正解|いずれも正解|正解肢の?ない)")


def parse_answers(doc):
    """正解番号表を読む。問番号と正解が交互に並ぶ形。読めなければ宅建の読み方（見出しの行と正解の行）も試す。"""
    answers, special = {}, set()
    for i in range(doc.page_count):
        if ocr.is_garbled(doc[i]):
            continue  # 化けた字は読まない（下で表の画像から読む）
        text = unicodedata.normalize("NFKC", takken._page_text(doc[i]))
        flat = re.sub(r"\s+", " ", text)
        for m in _PAIR.finditer(flat):
            n, v = int(m.group(1)), m.group(2)
            if not v.isdigit():
                special.add(n)
                continue
            if n in answers and answers[n] != int(v):
                raise ParseError("ANSWER_TABLE_CONFLICT", question=n)
            answers[n] = int(v)
        special |= {int(m.group(1)) for m in _ALL_CORRECT.finditer(re.sub(r"\s+", "", text))}
        special |= {int(m.group(1)) for m in _MULTI.finditer(flat)}
    if len(answers) + len(special) < 10:
        # 文字が取り出せない正解番号表（線で描いた字・化けた字）：表の位置から1マスずつ読む
        for i in range(doc.page_count):
            answers.update(_ocr_cells(doc[i]))
    if len(answers) + len(special) < 10:
        return takken.parse_answers(doc)
    for n in special:
        answers[n] = ANSWER_SPECIAL
    return answers


def _ocr_cells(page):
    """文字が取り出せない正解番号表（線で描いた字・化けた字）を読む。

    表の罫線を白で消した画像を、区切り方を変えて2回読み、2回とも同じ正解になった問だけを採る。
    「正解なし」「1、3」のように1つの数字でないマスは採らない（その問は正答が確かめられず、出題しない）。
    """
    import fitz

    reads = [_ocr_table(page, dpi) for dpi in (300, 400)]
    return {n: c for n, c in reads[0].items() if reads[1].get(n) == c}


def _ocr_table(page, dpi):
    import fitz

    zoom = dpi / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False, colorspace=fitz.csGRAY)
    for d in page.get_drawings():
        r = d["rect"]
        if r.width > 30 or r.height > 30:
            box = fitz.IRect(int((r.x0 - page.rect.x0) * zoom) - 3, int((r.y0 - page.rect.y0) * zoom) - 3,
                             int((r.x1 - page.rect.x0) * zoom) + 3, int((r.y1 - page.rect.y0) * zoom) + 3)
            if r.width > 30 and r.height > 30:
                # 枠（四角）は線だけを消す（中の字は残す）
                for edge in ((box.x0, box.y0, box.x1, box.y0 + 6), (box.x0, box.y1 - 6, box.x1, box.y1),
                             (box.x0, box.y0, box.x0 + 6, box.y1), (box.x1 - 6, box.y0, box.x1, box.y1)):
                    pix.set_rect(fitz.IRect(*edge) & pix.irect, (255,))
            else:
                pix.set_rect(box & pix.irect, (255,))
    pix.set_dpi(dpi, dpi)
    png = pix.tobytes("png")
    text = unicodedata.normalize("NFKC", ocr.image_text(png, "6")).replace("間", "問")
    return {int(m.group(1)): int(m.group(2)) for m in _PAIR.finditer(re.sub(r"\s+", " ", text)) if m.group(2).isdigit()}


def classify(question):
    return fields.classify_chintai(question)
