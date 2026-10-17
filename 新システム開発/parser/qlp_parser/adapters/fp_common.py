"""FP技能検定（日本FP協会）の学科試験の読み取り。2級・3級で共通。

形式（日本FP協会の公表PDFで確認）:
- CBT試験の公表問題（2024年5月〜）：見出し「問n」、選択肢「1) 」、各問の直後に「正解 3)」「正解 ○」。
  3級の問1〜30は正誤式（〇／×）、問31〜60は三答択一式。2級は四答択一式。
- 紙の試験（2級の2024年5月・9月、2025年1月）：見出し「問題 n」、選択肢「１．」、正解は別PDFの表
  （「問１ … 問１０」の行の下に10個の正解が並ぶ）。
- 正誤式は選択肢を「〇」「×」の2つとし、1＝〇、2＝×で答える。
- 表や図（罫線・画像）がある問は、その部分を公式PDFから切り出して見せ、図の中の文字は本文から除く。
"""

import re
import unicodedata

from .. import ocr
from ..core import ParseError, RawQuestion, clean_text, is_page_number_line, mark_out_of_order, to_int
from . import takken

HEADING = re.compile(r"^問(?:題)?\s*([0-9０-９]{1,2})\s*$")
CHOICE = re.compile(r"^([1-5１-５])\s*(?:\)|）|．|\.)\s*")
ANSWER_LINE = re.compile(r"^正\s*解\s*([1-5１-５]\s*(?:\)|）)?|[〇○◯×✕])\s*$")
TRUE_FALSE = ["〇", "×"]
PAGE_NO = re.compile(r"^[－\-ー―]\s*[0-9０-９]{1,3}\s*[－\-ー―]$")


def _value(token):
    """正解の表記を選択肢の番号にする（〇＝1、×＝2）。"""
    t = unicodedata.normalize("NFKC", token).strip()
    if t and t[0] in "〇○◯":
        return 1
    if t and t[0] in "×✕":
        return 2
    return int(t[0])


def _items(doc):
    """全ページの行を (ページ番号0始まり, y0, y1, 文字, x0) で並べる。見出しの無いページ（表紙・注意事項）は除く。"""
    out = []
    for i in range(doc.page_count):
        lines = takken._lines(doc[i])
        if not any(HEADING.match(ln[2].strip()) for ln in lines):
            continue
        for y0, y1, t, x0 in lines:
            t = t.strip()
            if t and not PAGE_NO.match(t) and not is_page_number_line(t):
                out.append((i, y0, y1, t, x0))
    return out


def _graphic_groups(page, y0, y1, template):
    """y0〜y1 にある図・表を、近い線や画像どうしをまとめた範囲のリストで返す。

    版面の飾りは数えない。細い線だけのまとまりは、縦線と横線が2本以上ずつある（表・図の枠）ときだけ図とし、
    横線だけ（下線）は図としない。
    """
    import fitz

    parts = []  # (範囲, 種類) 種類: "solid"（画像・面のある図形）/ "h" / "v"（細い線）
    for img in page.get_image_info():
        r = fitz.Rect(img["bbox"])
        if r.y1 > y0 and r.y0 < y1:
            parts.append((r, "solid"))
    for dr in page.get_drawings():
        r = dr["rect"]
        if takken._rect_key(r) in template or r.contains(page.rect) or not (r.y1 > y0 and r.y0 < y1):
            continue
        if dr.get("color") is None and dr.get("fill") is not None and min(dr["fill"]) >= 0.98:
            continue  # 白で塗っただけの四角（見えない）
        if r.height <= takken.THIN:
            parts.append((r, "h"))
        elif r.width <= takken.THIN:
            parts.append((r, "v"))
        else:
            parts.append((r, "solid"))
    # 線は太さが0の範囲になり、そのままでは重なりを判定できないので、6ptずつ広げた範囲どうしで比べる
    groups = []
    for r, kind in parts:
        box, kinds = fitz.Rect(r.x0 - 6, r.y0 - 6, r.x1 + 6, r.y1 + 6), [kind]
        for g in [g for g in groups if g[0].intersects(box)]:
            box |= g[0]
            kinds += g[1]
            groups.remove(g)
        groups.append((box, kinds))
    out = []
    for box, kinds in groups:
        box = fitz.Rect(box.x0 + 6, box.y0 + 6, box.x1 - 6, box.y1 - 6)
        # 字の形を線で描いた記号（小さな図形）は図としない
        if box.width < 30 or box.height < 12:
            continue
        if "solid" in kinds or (kinds.count("h") >= 2 and kinds.count("v") >= 2):
            out.append(box)
    return sorted(out, key=lambda b: b.y0)


def _figure_band(page, body_on_page, box):
    """図の範囲を、図に付いた文字（家系図の名前・表の見出し・「〈資料〉」など）まで広げる。

    図のすぐ上・すぐ下の行で、文が「。」で終わらず、選択肢の番号で始まらない行は図の一部とみなす。
    範囲の左右は、その範囲に入る文字と図の端まで。
    """
    import fitz

    lines = sorted(body_on_page, key=lambda b: b[1])
    top, bottom = box.y0, box.y1
    above = [b for b in lines if b[2] <= box.y0 + 2]
    for b in reversed(above):
        if top - b[2] > 18 or b[3].rstrip().endswith("。") or CHOICE.match(b[3]) or HEADING.match(b[3]):
            break
        top = min(top, b[1])
    below = [b for b in lines if b[1] >= box.y1 - 2]
    for b in below:
        if b[1] - bottom > 18 or b[3].rstrip().endswith("。") or CHOICE.match(b[3]):
            break
        bottom = max(bottom, b[2])
    band = fitz.Rect(box.x0, top, box.x1, bottom)
    for w in page.get_text("words"):
        cy = (w[1] + w[3]) / 2
        if top - 1 <= cy <= bottom + 1:
            band |= fitz.Rect(w[:4])
    return band


def parse_questions(doc):
    items = _items(doc)
    template = takken._template_drawings(doc)
    starts = [k for k, it in enumerate(items) if HEADING.match(it[3])]
    questions = []
    for idx, k in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(items)
        number = to_int(HEADING.match(items[k][3]).group(1))
        body = items[k + 1:end]
        # 正解の行から後ろは問題に入れない（利用者に正解を見せない）
        cut = next((j for j, b in enumerate(body) if ANSWER_LINE.match(b[3]) or b[3].startswith("正解")), None)
        if cut is not None:
            body = body[:cut]
        notes = []
        pages = sorted({b[0] + 1 for b in body}) or [items[k][0] + 1]

        # 図・表：ページごとに、問題の範囲の図を切り出し、図の中の文字は本文から除く
        crops, inside = [], set()
        for p in pages:
            on_page = [b for b in body if b[0] + 1 == p]
            if not on_page:
                continue
            page = doc[p - 1]
            for box in _graphic_groups(page, min(b[1] for b in on_page) - 2, max(b[2] for b in on_page) + 2, template):
                band = _figure_band(page, on_page, box)
                if crops and crops[-1][0] == p and band.y0 <= crops[-1][1][3] + 2:
                    continue  # 前の図の範囲に入っている
                for j, b in enumerate(body):
                    if b[0] + 1 == p and band.y0 - 1 <= (b[1] + b[2]) / 2 <= band.y1 + 1:
                        inside.add(j)
                crops.append((p, (band.x0 - 4, band.y0 - 4, band.x1 + 4, band.y1 + 4)))

        # 選択肢：番号が1から順に並ぶ行。折り返しは次の番号の行まで
        marks = [j for j, b in enumerate(body) if j not in inside and CHOICE.match(b[3])]
        seq = []
        for j in marks:
            if to_int(CHOICE.match(body[j][3]).group(1)) == len(seq) + 1:
                seq.append(j)
        stem_end = seq[0] if seq else len(body)
        stem = [b[3] for j, b in enumerate(body[:stem_end]) if j not in inside]
        if seq:
            choices = []
            for c, j in enumerate(seq):
                stop = seq[c + 1] if c + 1 < len(seq) else len(body)
                part = [CHOICE.sub("", body[j][3], count=1)] + [b[3] for jj, b in enumerate(body[j + 1:stop], j + 1) if jj not in inside]
                choices.append(clean_text("\n".join(part)))
        else:
            choices = list(TRUE_FALSE)  # 正誤式
            notes.append("true_false")
        first = [b for b in body if b[0] + 1 == pages[0]]
        questions.append(RawQuestion(
            number=number,
            stem=clean_text("\n".join(stem)),
            choices=choices,
            pages=pages,
            rect=(round(min(b[1] for b in first), 1), round(max(b[2] for b in first), 1)) if first else None,
            has_graphics=bool(crops),
            notes=notes,
            crops=crops,
        ))
    return mark_out_of_order(questions)


def parse_answers(doc):
    """各問の直後の「正解 …」の行（公表問題）、または別PDFの正解の表（紙の試験）を読む。"""
    answers = {}
    current = None
    for _, _, _, t, _ in _items(doc):
        m = HEADING.match(t)
        if m:
            current = to_int(m.group(1))
            continue
        a = ANSWER_LINE.match(t)
        if a and current is not None:
            answers[current] = _value(a.group(1))
            current = None
    if answers:
        return answers
    for i in range(doc.page_count):
        for n, c in takken._answer_rows(doc[i].get_text(sort=True)):
            if n in answers and answers[n] != c:
                raise ParseError("ANSWER_TABLE_CONFLICT", question=n)
            answers[n] = c
    if not answers:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers
