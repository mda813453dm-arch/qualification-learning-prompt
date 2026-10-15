"""測量士補アダプタ。

形式（R8公式PDFで確認した形を土台にしている）:
- 1ページに1問。見出し「〔No. n〕」、5択（行頭の「1.」〜「5.」）、ページ下にページ番号
- 正答は別PDF。「No.n m」が28問分並ぶ（全角数字）

R8の問題PDFは日本語の文字が図形（アウトライン）になっていて、文字として取り出せない。
文字として残っているのは数字・英字だけ。そのため:
- 問番号は、見出しの数字の形（図形）を問題の並び順と突き合わせて確かめる（_number_glyphs）
- 本文は公式PDFの画像で見せる（stem_mode = official_image）
- 選択肢は、文字が全部取り出せたときだけ文字にし、欠けがあれば番号だけにして画像で見せる
文字が取り出せるPDF（見出しが文字で読める年度）では、本文・選択肢を文字で返す。
"""

import re
import unicodedata

from ..core import ParseError, RawQuestion, clean_text

QUALIFICATION_ID = "q063"
SECTION = "測量士補"
CHOICE_COUNT = 5

HEADING_TEXT = re.compile(r"〔\s*No\.\s*([0-9]{1,2})\s*〕")
ANSWER = re.compile(r"No\.\s*([0-9]{1,2})\s+([1-5])(?![0-9])")
REIWA = re.compile(r"令和\s*([0-9]{1,2}|元)\s*年")
GLYPH_MAX = 20  # 1文字の図形とみなす大きさの上限（pt）
FOOTER = 0.9  # ページの下10%はページ番号の欄として扱う
MARGIN = 6  # 切り出しの余白（pt）
# 図形の数字で問番号を確かめるのに必要な問数。20問以上あると0〜9の各数字が
# 1の位に2回以上出てくるので、ページの入れ替わり・抜けを数字の形の食い違いとして検出できる
MIN_QUESTIONS_FOR_GLYPH_NUMBERS = 20


def check_year(doc, year):
    """正答PDFに「令和n年」とあれば、指定の年度と一致するか確かめる。"""
    m = REIWA.search(unicodedata.normalize("NFKC", " ".join(doc[i].get_text() for i in range(doc.page_count))))
    if m:
        stated = 2019 if m.group(1) == "元" else 2018 + int(m.group(1))
        if stated != year:
            raise ParseError("ANSWER_YEAR_MISMATCH", stated=stated, requested=year)


def parse_answers(doc):
    answers = {}
    for i in range(doc.page_count):
        text = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", doc[i].get_text(sort=True)))
        for m in ANSWER.finditer(text):
            n, a = int(m.group(1)), int(m.group(2))
            if n in answers and answers[n] != a:
                raise ParseError("ANSWER_TABLE_CONFLICT", question=n)
            answers[n] = a
    if not answers:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def classify(question):
    """分野判定は未実装。分野の対応表が承認されるまで fieldId は付けない。"""
    return {"fieldId": None, "method": "not_classified", "verified": False}


# ---- ページの読み取り ----

class _Page:
    def __init__(self, page):
        self.page = page
        self.limit = page.rect.height * FOOTER
        self.words = [_with_superscript(w, page) for w in page.get_text("words", sort=True) if w[3] <= self.limit]
        self.drawings = [d for d in page.get_drawings() if d["rect"].y1 <= self.limit and d["rect"].intersects(page.rect)]
        self.images = [i["bbox"] for i in page.get_image_info() if i["bbox"][3] <= self.limit]
        self.glyphs = [d for d in self.drawings if _is_glyph(d)]

    def body_rect(self):
        import fitz

        r = fitz.Rect()
        for w in self.words:
            r.include_rect(fitz.Rect(w[:4]))
        for d in self.drawings:
            r.include_rect(d["rect"])
        for b in self.images:
            r.include_rect(fitz.Rect(b))
        return r


_SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def _with_superscript(word, page):
    """「m2」の2が上付きの小さい字なら「m²」にする（面積・体積の単位を取り違えないため）。"""
    if not any(ch.isdigit() for ch in word[4]):
        return word
    chars = []
    for b in page.get_text("rawdict", clip=word[:4])["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln["spans"]:
                for c in sp["chars"]:
                    x = (c["bbox"][0] + c["bbox"][2]) / 2
                    if word[0] <= x <= word[2] and c["c"].strip():
                        chars.append((c["bbox"][0], c["c"], sp["size"]))
    chars.sort()
    if "".join(c[1] for c in chars) != word[4] or not chars:
        return word
    big = max(c[2] for c in chars)
    text = "".join(c[1].translate(_SUPERSCRIPT) if c[2] < big * 0.8 and c[1].isdigit() else c[1] for c in chars)
    return word[:4] + (text,) + tuple(word[5:])


def _is_glyph(d):
    r = d["rect"]
    return r.width <= GLYPH_MAX and r.height <= GLYPH_MAX and d.get("fill") is not None


def _covered(rect, words):
    """図形が、取り出せた文字のどれかと重なっているか（文字の上に重ねて描かれた形）。"""
    return any(rect.intersects((w[0], w[1], w[2], w[3])) for w in words)


def _choice_markers(pg):
    """行頭の「1」〜「5」（同じ字下げ・上から順）。最後に見つかった並びを採る。"""
    marks = [w for w in pg.words if unicodedata.normalize("NFKC", w[4]) in {"1", "2", "3", "4", "5"}]
    found = []
    for a, w1 in enumerate(marks):
        if unicodedata.normalize("NFKC", w1[4]) != "1":
            continue
        seq, want = [w1], 2
        for w in marks[a + 1:]:
            if int(unicodedata.normalize("NFKC", w[4])) == want and abs(w[0] - w1[0]) <= 2 and w[1] > seq[-1][1]:
                seq.append(w)
                want += 1
                if want > CHOICE_COUNT:
                    break
        if len(seq) == CHOICE_COUNT:
            found.append(seq)
    return found[-1] if found else None


def _top_glyph_run(pg):
    """ページ最上部の行にある図形の文字を左から順に返す（見出し「〔No. n〕」の候補）。"""
    if not pg.glyphs:
        return []
    top = min(d["rect"].y0 for d in pg.glyphs)
    if pg.words and min(w[1] for w in pg.words) < top - 2:
        return []  # 最上部が文字として読める行なら、図形の見出しではない
    line = sorted((d for d in pg.glyphs if d["rect"].y0 < top + 12), key=lambda d: d["rect"].x0)
    run = line[:1]
    for d in line[1:]:
        if d["rect"].x0 - run[-1]["rect"].x1 > 14:  # 半角の空白（「No. 7」）はつなぐ
            break
        run.append(d)
    return run


def _shape(d):
    """図形の形（位置を除いた輪郭の座標）。同じ字は同じ形になる。"""
    r = d["rect"]
    pts = []
    kinds = []
    for it in d["items"]:
        kinds.append(it[0])
        for p in it[1:]:
            if hasattr(p, "x"):
                pts.append((p.x - r.x0, p.y - r.y0))
    return "".join(kinds), pts


def _same_shape(a, b, tol=0.4):
    # PDF内の座標の丸め（約0.12pt刻み）で同じ字でも数値がわずかにずれるので、許容幅で比べる
    return a[0] == b[0] and len(a[1]) == len(b[1]) and all(
        abs(x1 - x2) <= tol and abs(y1 - y2) <= tol for (x1, y1), (x2, y2) in zip(a[1], b[1]))


class _ShapeIds:
    def __init__(self):
        self.reps = []

    def id(self, d):
        s = _shape(d)
        for k, r in enumerate(self.reps):
            if _same_shape(s, r):
                return k
        self.reps.append(s)
        return len(self.reps) - 1


def _common_prefix(seqs):
    n = min(len(s) for s in seqs)
    k = 0
    while k < n and all(s[k] == seqs[0][k] for s in seqs):
        k += 1
    return k


def _number_glyphs(pages):
    """図形の見出しから問番号を決める。

    pages: [(ページ番号, _Page)]（ページ順）。選択肢が5つそろったページから見出しの共通部分
    （「〔No.」と「〕」）を求め、同じ形で始まり・終わるページを問題のページとする。
    問題のページを並び順に1, 2, 3…と仮に番号付けし、見出しの数字の形がすべての問で
    同じ数字に対応する（形と数字が1対1）ときだけ採用する。食い違えば全体を出さない。
    """
    ids = _ShapeIds()
    runs = {}
    for no, pg in pages:
        run = _top_glyph_run(pg)
        if run:
            runs[no] = [ids.id(d) for d in run]
    sure = [runs[no] for no, pg in pages if len(runs.get(no, [])) >= 3 and _choice_markers(pg)]
    # 表紙・関数表にも「1〜5」の並びがあるので、最上部が同じ形で始まるページが過半数のものを見出しとする
    groups = {}
    for r in sure:
        groups.setdefault(tuple(r[:2]), []).append(r)
    sure = max(groups.values(), key=len) if groups else []
    if len(sure) < 2 or len(sure) * 2 <= sum(len(g) for g in groups.values()):
        raise ParseError("QUESTION_NUMBER_UNVERIFIED", reason="no_heading_pattern")
    pre = _common_prefix(sure)
    suf = _common_prefix([s[::-1] for s in sure])
    if pre < 2 or suf < 1:
        raise ParseError("QUESTION_NUMBER_UNVERIFIED", reason="no_heading_pattern")
    head, tail = sure[0][:pre], sure[0][len(sure[0]) - suf:]
    qpages = []
    for no, _ in pages:
        r = runs.get(no)
        if r and r[:pre] == head and r[len(r) - suf:] == tail and 1 <= len(r) - pre - suf <= 2:
            qpages.append((no, r[pre:len(r) - suf]))
    if len(qpages) < MIN_QUESTIONS_FOR_GLYPH_NUMBERS:
        raise ParseError("QUESTION_NUMBER_UNVERIFIED", reason="too_few_questions", found=len(qpages))
    digit_of, shape_of = {}, {}
    for n, (no, digits) in enumerate(qpages, 1):
        text = str(n)
        if len(text) != len(digits):
            raise ParseError("QUESTION_NUMBER_UNVERIFIED", reason="digit_count_mismatch", page=no)
        for ch, sid in zip(text, digits):
            if digit_of.setdefault(sid, ch) != ch or shape_of.setdefault(ch, sid) != sid:
                raise ParseError("QUESTION_NUMBER_UNVERIFIED", reason="digit_shape_conflict", page=no)
    return [(n, no) for n, (no, _) in enumerate(qpages, 1)]


def _number_text(pages):
    """見出しが文字で読めるPDF。読めたページだけを問題のページとする。"""
    out = []
    for no, pg in pages:
        m = HEADING_TEXT.search(unicodedata.normalize("NFKC", pg.page.get_text()))
        if m:
            out.append((int(m.group(1)), no))
    return out


# ---- 問題の組み立て ----

def _line_text(words):
    """同じ行の単語を左から順につなぐ。すき間が狭ければ（m2 の 2 など）詰める。"""
    out = ""
    prev = None
    for w in sorted(words, key=lambda w: w[0]):
        if prev is not None and w[0] - prev[2] > 1.5:
            out += " "
        out += w[4]
        prev = w
    return out


def _lines(words):
    rows = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if rows and abs(w[1] - rows[-1][0][1]) <= 3:
            rows[-1].append(w)
        else:
            rows.append([w])
    return rows


def _question(number, no, pg, text_heading):
    markers = _choice_markers(pg)
    notes = []
    choices, choice_mode = [], "text"
    if markers:
        line_h = (markers[-1][1] - markers[0][1]) / (CHOICE_COUNT - 1)
        for c, m in enumerate(markers):
            # 同じ行の語は上端が番号より少し上にずれることがある（m2 など）ので、3pt上から次の番号の3pt上まで
            y0, y1 = m[1] - 3, (markers[c + 1][1] - 3 if c + 1 < CHOICE_COUNT else m[1] + line_h - 3)
            words = [w for w in pg.words if y0 <= w[1] < y1 and w is not m]
            # 番号のすぐ右の「.」は番号の一部（R8では図形）。それ以外の字の図形が文字で読めなければ欠けあり
            stray = [d for d in pg.glyphs if y0 <= d["rect"].y0 < y1 and d["rect"].x0 > m[2] + 4 and not _covered(d["rect"], words)]
            text = clean_text("\n".join(_line_text(r) for r in _lines(words)))
            if stray or not text:
                choice_mode = "official_image"
            choices.append(text)
        # 選択肢のすぐ上に列の見出し（「ア イ」など）があれば、文字だけでは列の意味が伝わらないので画像で見せる
        top = markers[0]
        if any(top[1] - line_h - 3 <= d["rect"].y0 < top[1] - 3 and d["rect"].x0 > top[2] + 4 for d in pg.glyphs) or any(
                top[1] - line_h - 3 <= w[1] < top[1] - 3 and w[0] > top[2] + 4 for w in pg.words):
            choice_mode = "official_image"
        if choice_mode != "text":
            choices =[str(i) for i in range(1, CHOICE_COUNT + 1)]
            notes.append("choice_text_outlined")
    stem_top = markers[0][1] - 3 if markers else pg.limit
    stem_words = [w for w in pg.words if w[1] < stem_top]
    stem_glyphs = [d for d in pg.glyphs if d["rect"].y0 < stem_top and not _covered(d["rect"], stem_words)]
    if text_heading and not stem_glyphs:
        stem_mode = "text"
        rows = _lines(stem_words)
        lines = [_line_text(r) for r in rows]
        lines[0] = HEADING_TEXT.sub("", unicodedata.normalize("NFKC", lines[0])).strip() if lines else ""
        stem = clean_text("\n".join(lines))
    else:
        stem_mode, stem = "official_image", ""
        notes.append("stem_text_outlined")
    graphics = bool(pg.images) or any(not _is_glyph(d) for d in pg.drawings)
    body = pg.body_rect()
    crops = []
    if not body.is_empty and (graphics or stem_mode != "text" or choice_mode != "text"):
        # 問題1問分（見出し〜最後の選択肢）をそのまま切り出す。ページ番号の欄は含めない
        crops.append((no, (body.x0 - MARGIN, body.y0 - MARGIN, body.x1 + MARGIN, min(body.y1 + MARGIN, pg.limit))))
    return RawQuestion(
        number=number,
        stem=stem,
        choices=choices,
        pages=[no],
        rect=(round(body.y0, 1), round(body.y1, 1)) if not body.is_empty else None,
        has_graphics=graphics,
        notes=notes,
        stem_mode=stem_mode,
        choice_mode=choice_mode,
        crops=crops,
    )


def parse_questions(doc):
    pages = [(i + 1, _Page(doc[i])) for i in range(doc.page_count)]
    numbered = _number_text(pages)
    text_heading = bool(numbered)
    if not numbered:
        numbered = _number_glyphs(pages)
    by_no = dict(pages)
    return [_question(n, no, by_no[no], text_heading) for n, no in numbered]
