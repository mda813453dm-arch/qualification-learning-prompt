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

from .. import ocr, vision
from .. import fields
from ..core import ParseError, RawQuestion, clean_text, mark_out_of_order

QUALIFICATION_ID = "q063"
SECTION = "測量士補"
CHOICE_COUNT = 5

HEADING_TEXT = re.compile(r"[〔【\[［(（「{｛]\s*No\s*[.．。]?\s*([0-9]{1,2})\s*[〕】\]］)）」}｝J]?")
# 行頭の見出し（OCRでは見出しの前に「_」「'」などの汚れが付くことがあるので、記号3字までは許す）
HEADING_LINE = re.compile(r"^(?:[^\w【〔\[［(（「{｛]|_){0,4}" + HEADING_TEXT.pattern)
# 選択肢の番号（「1」「1.」「1．」。OCRでは「.」が「。」に読まれることがある）
MARKER = re.compile(r"^([1-5])[.．。]?$")
OCR_INDENT_TOL = 8
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
        page = doc[i]
        raw = "\n".join(ln[2] for ln in ocr.page_ocr(page)) if ocr.needs_ocr(page) else page.get_text(sort=True)
        text = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", raw))
        for m in ANSWER.finditer(text):
            n, a = int(m.group(1)), int(m.group(2))
            if n in answers and answers[n] != a:
                raise ParseError("ANSWER_TABLE_CONFLICT", question=n)
            answers[n] = a
    if not answers:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def classify(question):
    """分野（fieldId）を内容から規則で分類する（qlp_parser/fields.py。分野の表は案・承認待ち）。"""
    return fields.classify_surveyor(question)


# ---- ページの読み取り ----

class _Page:
    def __init__(self, page, force_ocr=False):
        self.page = page
        self.limit = page.rect.height * FOOTER
        # スキャンした紙・文字化けしたページ（令和4〜7年）は、ページ全体をOCRで読む
        self.ocr = ocr.needs_ocr(page) or (force_ocr and ocr.available())
        if self.ocr:
            # 語の末尾に OCR の行番号を付ける（行のまとまりは OCR の判断どおりに使う）
            self.words = _split_markers([w + (OCR_LINE, k) for k, ln in enumerate(ocr.page_ocr(page)) for w in ln[4] if w[3] <= self.limit])
            self.drawings, self.glyphs = [], []
            self.images = [tuple(page.rect)]  # 問題1問分を公式PDFの画像でも見せる
            return
        self.words = _split_markers([_with_superscript(w, page) for w in page.get_text("words", sort=True) if w[3] <= self.limit])
        # 細い線は高さ0の範囲になる（Rect.intersects では拾えない）ので、座標で比べる
        pr = page.rect
        self.drawings = [d for d in page.get_drawings() if d["rect"].y1 <= self.limit
                         and d["rect"].x0 < pr.x1 and d["rect"].x1 > pr.x0 and d["rect"].y0 < pr.y1 and d["rect"].y1 > pr.y0]
        self.images = [i["bbox"] for i in page.get_image_info() if i["bbox"][3] <= self.limit]
        self.glyphs = [d for d in self.drawings if _is_glyph(d)]

    def body_rect_words(self):
        """OCRで読んだページの問題の範囲（読めた語の範囲。ページ全体の画像は含めない）。"""
        import fitz

        r = fitz.Rect()
        for w in self.words:
            r.include_rect(fitz.Rect(w[:4]))
        return r

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


_GLUED_MARKER = re.compile(r"^([1-5１-５][.．])(\S+)$")


def _split_markers(words):
    """「1．地理学的経緯度は，…」のように番号と本文が1語になっている（令和4年）ときは、番号を別の語に分ける。"""
    out = []
    for w in words:
        m = _GLUED_MARKER.match(w[4])
        if m:
            cut = w[0] + (w[2] - w[0]) * len(m.group(1)) / len(w[4])
            out.append((w[0], w[1], cut, w[3], m.group(1)) + tuple(w[5:]))
            out.append((cut, w[1], w[2], w[3], m.group(2)) + tuple(w[5:]))
        else:
            out.append(w)
    return out


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
    num = lambda w: int(MARKER.match(unicodedata.normalize("NFKC", w[4])).group(1))  # noqa: E731
    marks = [w for w in pg.words if MARKER.match(unicodedata.normalize("NFKC", w[4]))]
    tol = OCR_INDENT_TOL if pg.ocr else 2
    found = []
    for a, w1 in enumerate(marks):
        if num(w1) != 1:
            continue
        seq, want = [w1], 2
        for w in marks[a + 1:]:
            if num(w) == want and abs(w[0] - w1[0]) <= tol and w[1] > seq[-1][1]:
                seq.append(w)
                want += 1
                if want > CHOICE_COUNT:
                    break
        if len(seq) == CHOICE_COUNT:
            found.append(seq)
    if not found and pg.ocr:
        return _ocr_choice_markers(pg) or _gap_markers(pg)
    return found[-1] if found else None


_MARKER_LIKE = re.compile(r"^[0-9OoIlS\]|｜]{1,2}[.．。,]?$")


def _ocr_choice_markers(pg):
    """OCRで番号を1つだけ読み違えた選択肢（「3.」が「38.」「9.」になるなど）。

    行の先頭が番号らしい語の行が、同じ字下げで5行続き、そのうち4つ以上が順に1〜5と読めていれば、
    その5行を選択肢とする（読み違えた番号は位置から決まる）。
    """
    heads = {}
    for w in pg.words:
        if w[6] not in heads or w[0] < heads[w[6]][0]:
            heads[w[6]] = w
    cands = sorted((w for w in heads.values() if _MARKER_LIKE.match(unicodedata.normalize("NFKC", w[4]))), key=lambda w: w[1])
    best = None
    for a in range(len(cands) - CHOICE_COUNT + 1):
        win = cands[a:a + CHOICE_COUNT]
        if max(w[0] for w in win) - min(w[0] for w in win) > OCR_INDENT_TOL:
            continue
        ok = sum(MARKER.match(unicodedata.normalize("NFKC", w[4])) is not None and num_of(w) == k for k, w in enumerate(win, 1))
        if ok >= CHOICE_COUNT - 1:
            best = win
    return best


_COMBO = re.compile(r"^[a-eA-E](?:\s*[,，、.]\s*[a-eA-E])*$")


def _LETTER_COMBO_FIX(text):
    """「C , d」のような記号の組合せの選択肢は、小文字の「c, d」の形にそろえる（OCRは c を C と読むことがある）。"""
    if not _COMBO.match(text):
        return text
    return ", ".join(re.findall(r"[a-eA-E]", text)).lower()


def _tidy_ocr_choice(text):
    """OCRで読んだ選択肢の形を整える（番号の後の「.」の残り・符号と数の間の空白・記号の組合せの大文字）。"""
    text = re.sub(r"(^|：)[.．。,，、]\s*", r"\1", text)
    text = re.sub(r"(\d)\.\s+(?=\d)", r"\1.", text)
    text = re.sub(r"(^|[\s：、(（])([+\-−－])\s+(?=\d)", r"\1\2", text)
    return _LETTER_COMBO_FIX(text)


def _uneven(choices, labels):
    """OCRで字を読み落とした選択肢があるか（ほかの選択肢と、列・記号・矢印の数がそろわない）。

    「−」「c」「→」のような細い・小さい字は、読み落とすことがある。読み落としたまま出すと正誤が変わるので、
    そのときは選択肢を公式PDFの画像で見せる。
    """
    if labels and len({c.count("：") for c in choices}) > 1:
        return True
    if all(_COMBO.match(c) for c in choices) and len({len(re.findall(r"[a-eA-E]", c)) for c in choices}) > 1:
        return True
    return any("→" in c for c in choices) and len({c.count("→") for c in choices}) > 1


def _last_choice_end(pg, m, line_h):
    """最後の選択肢の下端。ほかの選択肢より行が多いときも、続きの行（番号より右から始まる、すぐ下の行）まで含める。"""
    y1 = m[1] + line_h - 3
    rowh = m[3] - m[1]
    rows = []
    for w in sorted((w for w in pg.words if (w[1] + w[3]) / 2 >= y1), key=lambda w: w[1]):
        if rows and w[1] < rows[-1][1] + 3:
            rows[-1] = (min(rows[-1][0], w[0]), rows[-1][1], max(rows[-1][2], w[3]))
        else:
            rows.append((w[0], w[1], w[3]))
    bottom = y1
    for x0, top, bot in rows:
        if top - bottom > 1.2 * rowh or not m[2] < x0 < m[2] + 30:
            break
        bottom = bot
        y1 = bot + 1
    return y1


def _gap_markers(pg):
    """OCRが選択肢の番号を1つだけ読み落としたとき（Vision が「2.」を読まないことがある）。

    行頭の番号が、同じ字下げで（1〜5のうち）真ん中の1つを除いて順に読めていて、その抜けた位置に、
    ほかの選択肢の本文と同じ字下げで始まる行がちょうど1つあれば、その行を抜けた番号の選択肢とする。
    最後の番号が抜けたときは、4つ目の番号の後（選択肢の間隔の1.5倍まで）で最初にそうなっている行とする。
    """
    lines = {}
    for w in pg.words:
        lines.setdefault(w[6], []).append(w)
    heads = sorted((min(ws, key=lambda w: w[0]), sorted(ws, key=lambda w: w[0])) for ws in lines.values())
    heads.sort(key=lambda h: h[0][1])
    marks = [(h, ws) for h, ws in heads if MARKER.match(unicodedata.normalize("NFKC", h[4]))]
    best = None
    for gap in range(2, CHOICE_COUNT + 1):
        want = [k for k in range(1, CHOICE_COUNT + 1) if k != gap]
        for a in range(len(marks)):
            seq = []
            for h, ws in marks[a:]:
                if num_of(h) == want[len(seq)] and (not seq or (abs(h[0] - seq[0][0][0]) <= OCR_INDENT_TOL and h[1] > seq[-1][0][1])):
                    seq.append((h, ws))
                    if len(seq) == len(want):
                        break
            if len(seq) != len(want):
                continue
            bodies = sorted(ws[1][0] for _, ws in seq if len(ws) > 1)
            if not bodies:
                continue
            bx = bodies[len(bodies) // 2]
            lo = seq[gap - 2][0][1]
            if gap < CHOICE_COUNT:
                cand = [h for h, _ in heads if lo < h[1] < seq[gap - 1][0][1] and abs(h[0] - bx) <= 3]
            else:
                step = max(b[0][1] - a[0][1] for a, b in zip(seq, seq[1:]))
                cand = [h for h, _ in heads if lo < h[1] < lo + 1.5 * step and abs(h[0] - bx) <= 3][:1]
            if len(cand) != 1:
                continue
            c, mx = cand[0], min(m[0][0] for m in seq)
            made = (mx, c[1], mx + (seq[0][0][2] - seq[0][0][0]), c[3], f"{gap}.") + tuple(c[5:])
            best = [m for m, _ in seq[:gap - 1]] + [made] + [m for m, _ in seq[gap - 1:]]
    return best


def num_of(w):
    return int(MARKER.match(unicodedata.normalize("NFKC", w[4])).group(1))


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
    return "".join(kinds), pts, r.width, r.height


def _same_shape(a, b, tol=0.4):
    # PDF内の座標の丸め（約0.12pt刻み）で同じ字でも数値がわずかにずれるので、許容幅で比べる
    # 大きさも比べる（度の「°」と句点「。」のように、形が似て大きさだけ違う字を分けるため）
    return a[0] == b[0] and len(a[1]) == len(b[1]) and abs(a[2] - b[2]) <= 0.25 and abs(a[3] - b[3]) <= 0.25 and all(
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
    """見出しが文字（またはOCR）で読めるPDF。見出しの行から、問番号と問題の範囲を決める。

    令和4〜7年は1ページに2問あるページがあるので、ページの中の見出しをすべて探し、
    見出しから次の見出しの手前までを1問の範囲とする。見出しは行頭にあるものだけ
    （表紙の注意書きにある「〔No.1〕～〔No.28〕」を見出しと取り違えないため）。
    返り値: [(問番号, ページ番号, 範囲の上端, 範囲の下端)]
    """
    out = []
    for no, pg in pages:
        heads = []
        for row in _lines(pg.words):
            m = HEADING_LINE.match(unicodedata.normalize("NFKC", _line_text(row)))
            if m:
                heads.append((int(m.group(1)), min(w[1] for w in row)))
        for k, (n, y) in enumerate(heads):
            y1 = heads[k + 1][1] - 3 if k + 1 < len(heads) else pg.limit
            out.append((n, no, y - 3, y1))
    return out


def _region(pg, y0, y1):
    """ページの一部（1問分）だけを見る _Page。"""
    import copy

    r = copy.copy(pg)
    inside = lambda a, b: b > y0 and a < y1  # noqa: E731
    r.words = [w for w in pg.words if y0 <= w[1] < y1]
    r.drawings = [d for d in pg.drawings if inside(d["rect"].y0, d["rect"].y1)]
    r.glyphs = [d for d in pg.glyphs if inside(d["rect"].y0, d["rect"].y1)]
    r.images = [b for b in pg.images if inside(b[1], b[3])] if not pg.ocr else pg.images
    r.limit = min(y1, pg.limit)
    return r


# ---- 問題の組み立て ----

OCR_LINE = "ocr_line"


def _is_ocr(words):
    return bool(words) and len(words[0]) == 7 and words[0][5] == OCR_LINE


def _line_text(words):
    """同じ行の単語を左から順につなぐ。すき間が狭ければ（m2 の 2 など）詰める。"""
    if _is_ocr(words):
        return ocr._join_words([w[4] for w in sorted(words, key=lambda w: w[0])])
    out = ""
    prev = None
    for w in sorted(words, key=lambda w: w[0]):
        if prev is not None and w[0] - prev[2] > 1.5:
            out += " "
        out += w[4]
        prev = w
    return out


def _lines(words):
    if _is_ocr(words):
        rows = {}
        for w in words:
            rows.setdefault(w[6], []).append(w)
        return [rows[k] for k in sorted(rows)]
    rows = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if rows and abs(w[1] - rows[-1][0][1]) <= 3:
            rows[-1].append(w)
        else:
            rows.append([w])
    return rows


# 列の見出し：「ア」「a」のほか、座標の「XB」「YB」のような英字の短い記号
LABEL = re.compile(r"^[(（]?(?:[ア-ンa-eA-E]|[A-Z][A-Za-z0-9]?)[)）]?$")
# OCRは見出しの「ア」を「アァ」のように読むことがある
HEADER_WORD = re.compile(r"^[(（]?(?:[ァ-ンa-eA-E]{1,2}|[A-Z][A-Za-z0-9]?)[)）]?$")


def _fix_symbols(stem):
    """読み取りで崩れやすい決まった記号を直す。基線ベクトルの成分「ΔX，ΔY，ΔZ」の Δ は「4」「A」と読まれる（令和8年 問9）。"""
    stem = re.sub(r"[4AΔ△]\s*X(\s*[，,]\s*)[4AΔ△]\s*Y(\s*[，,]\s*)[4AΔ△]\s*Z", r"ΔX\1ΔY\2ΔZ", stem)
    # 字の間を空けて組んだ数字（「電子地形図２５０００」が「2 5 0 0 0」になる）は詰める
    stem = re.sub(r"(?<![\d.,])\d(?: \d){2,}(?![\d.,])", lambda m: m.group(0).replace(" ", ""), stem)
    stem = stem.replace("∠ ", "∠")
    # 「円周率π」の π は「率」「兀」と読まれる
    return re.sub(r"円周率\s*[率兀元](?=\s*[＝=])", "円周率π", stem)


def _question(number, no, pg, text_heading):
    markers = _choice_markers(pg)
    notes = []
    choices, choice_mode = [], "text"
    if markers:
        line_h = (markers[-1][1] - markers[0][1]) / (CHOICE_COUNT - 1)
        top = markers[0]
        # 選択肢のすぐ上の1行に「ア イ ウ」のような列の見出しがあるか。選択肢が複数行だと line_h が大きく、
        # 問題文の最後の行まで入ってしまうので、見るのは番号の高さの数行分だけ。文の行は見出しにしない
        band = 5 * (top[3] - top[1])
        above = [w for w in pg.words if top[1] - band - 3 <= w[1] and w[3] < top[1] - 1 and w[0] > top[2] + 4]
        labels = None
        if len(above) >= 2 and all(LABEL.match(unicodedata.normalize("NFKC", w[4])) for w in above):
            labels = [((w[0] + w[2]) / 2, unicodedata.normalize("NFKC", w[4])) for w in sorted(above, key=lambda w: w[0])]
        if any(top[1] - band - 3 <= d["rect"].y0 < top[1] - 3 and d["rect"].x0 > top[2] + 4 for d in pg.glyphs):
            choice_mode = "official_image"
        for c, m in enumerate(markers):
            # 同じ行の語は上端が番号より少し上にずれることがある（m2 など）ので、3pt上から次の番号の3pt上まで
            y0, y1 = m[1] - 3, (markers[c + 1][1] - 3 if c + 1 < CHOICE_COUNT else _last_choice_end(pg, m, line_h))
            # 語の上下の中央で選択肢に振り分ける（OCRの語は上端が番号より上にはみ出すことがある）
            words = [w for w in pg.words if y0 <= (w[1] + w[3]) / 2 < y1 and w is not m]
            # 番号のすぐ右の「.」は番号の一部（R8では図形）。それ以外の字の図形が文字で読めなければ欠けあり
            stray = [d for d in pg.glyphs if y0 <= d["rect"].y0 < y1 and d["rect"].x0 > m[2] + 4 and not _covered(d["rect"], words)]
            if labels:
                # 列の見出しのある選択肢は「ア：…、イ：…」の形にする（列の意味を文字だけで伝えるため）
                cols = [[] for _ in labels]
                for w in words:
                    cx = (w[0] + w[2]) / 2
                    cols[min(range(len(labels)), key=lambda i: abs(labels[i][0] - cx))].append(w)
                text = "、".join(f"{lab}：{clean_text(_line_text(col))}" for (_, lab), col in zip(labels, cols) if col)
            else:
                text = clean_text("\n".join(_line_text(r) for r in _lines(words)))
            if stray or not text:
                choice_mode = "official_image"
            choices.append(text)
        if pg.ocr:
            choices = [_tidy_ocr_choice(c) for c in choices]
            if _uneven(choices, labels):
                choice_mode = "official_image"  # 読み落としのある選択肢は、公式PDFの画像で見せる
        if choice_mode == "text" and pg.ocr:
            choice_mode = "ocr"
        if choice_mode == "official_image":
            choices =[str(i) for i in range(1, CHOICE_COUNT + 1)]
            notes.append("choice_text_outlined")
    stem_top = markers[0][1] - 3 if markers else pg.limit
    stem_words = [w for w in pg.words if w[1] < stem_top]
    figure = None
    if pg.ocr and markers:
        # 紙を画像にしたページ：問題文と選択肢の間にある図だけを切り出す（図の中の字は問題文に入れない）
        # 選択肢が見つからない問は出題しないので、図も探さない
        fig_bottom = min([stem_top] + [w[1] - 2 for w in (above if markers and labels else [])])
        stem_end, figure = _ocr_figure(pg, stem_words, fig_bottom)
        # 図の中の字と選択肢の見出しは問題文に入れない（図のあとに続く文は残す）
        stem_words = [w for w in stem_words if w[1] < stem_end and not (figure is not None and figure.contains(((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)))]
    stem_glyphs = [d for d in pg.glyphs if d["rect"].y0 < stem_top and not _covered(d["rect"], stem_words)]
    # 本文が日本語の文字として取り出せていれば、残った小さな図形は図の一部（令和4年など）。本文は文字のまま使う
    stem_has_kana = any(re.search(r"[\u3040-\u30ff]", w[4]) for w in stem_words)
    if text_heading and (not stem_glyphs or stem_has_kana):
        stem_mode = "ocr" if pg.ocr else "text"
        rows = _lines(stem_words)
        lines = [_line_text(r) for r in rows]
        if lines:
            lines[0] = HEADING_TEXT.sub("", unicodedata.normalize("NFKC", lines[0])).strip()
        stem = clean_text("\n".join(lines))
        if pg.ocr:
            # 細い「〜」や小さい「a」の読み落としを、決まった言い回し（「次のa〜eの文」「ア〜エに入る」）から補う
            stem = re.sub(r"次の\s*[~〜～]\s*([b-e])\s*の", r"次の a ~ \1 の", stem)
            stem = re.sub(r"ア\s*([イウエオカ])に入る", r"ア ~ \1に入る", stem)
            stem = re.sub(r"(\d)\.\s+(?=\d)", r"\1.", stem)
            stem = re.sub(r"円周率\s*[兀元]", "円周率 π", stem)
            stem = _fix_symbols(stem)
    else:
        stem_mode, stem = "official_image", ""
        notes.append("stem_text_outlined")
    graphics = bool(pg.images) or any(not _is_glyph(d) for d in pg.drawings) or bool(stem_glyphs)
    body = pg.body_rect()
    crops = []
    if pg.ocr:
        body = pg.body_rect_words()
        graphics = figure is not None
    if pg.ocr and "official_image" not in (stem_mode, choice_mode):
        # 文字は読めている。図があれば、図だけを切り出す
        if figure is not None:
            crops.append((no, tuple(figure)))
        elif not body.is_empty:
            # OCRだけで共有済みとは判断しない。図のない問も原本画像を残す。
            crops.append((no, (body.x0 - MARGIN, body.y0 - MARGIN, body.x1 + MARGIN,
                               min(body.y1 + MARGIN, pg.limit))))
    elif not body.is_empty and (graphics or stem_mode != "text" or choice_mode != "text"):
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


def _ocr_figure(pg, stem_words, bottom):
    """紙を画像にしたページで、問題文と選択肢の間にある図・表の範囲を返す。

    問題文の行（字が詰まって並ぶ行）を見分け、その行と行の間（または最後の行と選択肢の間）で、
    字ではない線が2行分以上の高さで続くところを図・表とする。空欄の枠は文の行の中にあるので図にしない。
    図の中の地名・数値・「図13」などの見出しは、図の範囲に入れる。
    返り値 (問題文として読む範囲の下端のy（選択肢の見出しの行は除く）, 図の範囲 または None)。
    """
    import fitz

    from ..server import _ink_box

    # 選択肢のすぐ上の見出しの行（「ア　イ　ウ」）は図に入れない
    lines = sorted((r for r in _lines(stem_words) if r and min(w[1] for w in r) < bottom), key=lambda r: min(w[1] for w in r))
    while lines and _header_row(lines[-1]):
        bottom = min(w[1] for w in lines.pop()) - 2
    rows = []
    for r in lines:
        if min(w[1] for w in r) >= bottom:
            continue
        rows.append((min(w[1] for w in r), max(w[3] for w in r), min(w[0] for w in r), max(w[2] for w in r), sum(len(w[4]) for w in r), sum(w[2] - w[0] for w in r)))
    rows.sort()
    if len(rows) < 2:
        return bottom, None
    xs = [w[0] for w in pg.words] + [w[2] for w in pg.words]
    left, right = min(xs), max(xs)
    width = right - left
    # 図は字より右へはみ出すことがあるので、探す範囲は左右の余白をそろえたところまで
    right = max(right, pg.page.rect.width - left)
    # 行の高さは、幅の広い行（問題文）で測る（図の中の短いラベルは字が小さく、地図の中の字は行が高くなる）
    heights = sorted(y1 - y0 for y0, y1, x0, x1, *_ in rows if x1 - x0 >= 0.5 * width) or sorted(y1 - y0 for y0, y1, *_ in rows)
    line_h = heights[len(heights) // 4]
    # 文の行：幅が広く字が詰まった行。直前が文の行なら、短い行（段落の最後の行）も文の行
    text = []
    for i, (y0, y1, x0, x1, n, inked) in enumerate(rows):
        dense = n * line_h / max(1.0, x1 - x0)
        # 字の詰まり方（行の幅あたりの字数）と、語のすき間の少なさ（図の中の地名の行は、すき間が大きい）
        wide = (x1 - x0) >= 0.5 * width and dense >= 0.7 and inked >= 0.5 * (x1 - x0)
        follows = bool(text) and text[-1] == i - 1 and y0 - rows[i - 1][1] <= 1.4 * line_h and dense >= 0.7 and x0 <= left + 4 * line_h
        # 文の行は1行分の高さで、前の行と重ならない（地図の中の字は高さがまちまちで重なる）
        # 図の中の行のすぐ下に続く行も図の中（文は図のあと、行間を空けて始まる）
        single = y1 - y0 <= 1.6 * line_h and (i == 0 or y0 >= rows[i - 1][1] - 2) and (i == 0 or text[-1:] == [i - 1] or y0 - rows[i - 1][1] >= 1.5 * line_h)
        if i == 0 or ((wide or follows) and single and not _framed(pg, fitz.Rect(left, y0, right, y1), x0, x1)):
            text.append(i)
    best = None
    for k, i in enumerate(text):
        # OCRの語の枠は字の上下の端より少し内側のことがあり、空欄の枠は字より上下にはみ出す。
        # 文の行の字・枠の線が図に入らないよう、行の高さの6割ほど離す
        top = rows[i][1] + 0.6 * line_h
        end = rows[text[k + 1]][0] - 0.6 * line_h if k + 1 < len(text) else bottom
        if end - top < 2 * line_h:
            continue
        block = _ink_block(pg, fitz.Rect(left, top, right, end), line_h)
        if block is not None and (best is None or block[1] - block[0] > best[2]):
            best = (top, end, block[1] - block[0])
    if best is None:
        return bottom, None
    top, end, _ = best
    # 図のあと選択肢までが1行だけで、語が離れて並ぶ行なら、選択肢の列の見出し（「新点Aの高低角　新点Bの高低角」など）。
    # 問題文に入れると図の前に出てしまうので、図に含めて見せる
    after = [r for r in lines if min(w[1] for w in r) > end and min(w[1] for w in r) < bottom]
    if len(after) == 1:
        ws = sorted(after[0], key=lambda w: w[0])
        if sum(1 for a, b in zip(ws, ws[1:]) if b[0] - a[2] > 2 * line_h) >= 2:
            end = bottom
    return bottom, _ink_box(pg.page, fitz.Rect(left, top, right, end))


def _blank_words(pg, region, zoom, pad_x=1, pad_y=1):
    """region を灰色の画素にし、OCRで読めた語の位置（pad 分広げる）を白く消したもの（字ではない線だけが残る）。"""
    import fitz

    pix = pg.page.get_pixmap(clip=region, matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY, alpha=False)
    w, h = pix.width, pix.height
    data = bytearray(pix.samples)
    for wd in pg.words:
        r = fitz.Rect(wd[:4]) & region
        if r.is_empty:
            continue
        x0, x1 = max(0, int((r.x0 - region.x0 - pad_x) * zoom)), min(w, int((r.x1 - region.x0 + pad_x + 1) * zoom))
        for y in range(max(0, int((r.y0 - region.y0 - pad_y) * zoom)), min(h, int((r.y1 - region.y0 + pad_y + 1) * zoom))):
            data[y * w + x0:y * w + x1] = b"\xff" * (x1 - x0)
    return data, w, h


def _header_row(words):
    """選択肢の上の見出しの行（「ア　イ　ウ」）か。OCRが一部を読み違えても（「P/」など）、短い語が並ぶだけの行なら見出しとみなす。"""
    texts = [unicodedata.normalize("NFKC", w[4]).strip() for w in words]
    return len(texts) >= 2 and all(len(t) <= 2 for t in texts) and sum(1 for t in texts if HEADER_WORD.match(t)) * 2 >= len(texts)


def _framed(pg, row, x0, x1):
    """行の字の左右に、縦の線があるか（表の行・地図の中の行。文の行は左右に線が無い）。"""
    data, w, h = _blank_words(pg, row, 2)
    from ..server import INK

    if not w or not h:
        return False
    cols = [x for x in range(w) if sum(1 for y in range(h) if data[y * w + x] < INK) >= 0.7 * h]
    return any(c / 2 + row.x0 < x0 - 1 for c in cols) and any(c / 2 + row.x0 > x1 + 1 for c in cols)


def _ink_block(pg, region, line_h):
    """region で読めた語を消したあとに残る線のまとまりのうち、いちばん高いもの (上のy, 下のy)。2行分に満たなければ None。"""
    blocks = [b for b in _blocks(pg, region, line_h, 1, 1) if b[1] - b[0] >= 2 * line_h]
    if not blocks:
        return None
    b = max(blocks, key=lambda b: b[1] - b[0])
    return region.y0 + b[0], region.y0 + b[1]


def _blocks(pg, region, line_h, pad_x, pad_y, zoom=2):
    """字を消したあとに線が残る行の続き [(上, 下)]（region の上端からの距離、ポイント）。1行分より長く空けば分ける。"""
    from ..server import INK

    data, w, h = _blank_words(pg, region, zoom, pad_x=pad_x, pad_y=pad_y)
    blocks, cur, gap = [], None, 0
    for y in range(h):
        # 細い縦線（2倍で2〜3画素）も線として数える
        if sum(1 for v in data[y * w:(y + 1) * w] if v < INK) >= 3:
            if cur is None:
                cur = [y / zoom, y / zoom]
            cur[1], gap = y / zoom, 0
        elif cur is not None:
            gap += 1
            if gap > line_h * zoom:
                blocks.append(cur)
                cur = None
    if cur is not None:
        blocks.append(cur)
    return blocks


# ---- 図形の文字をOCRで読む（文字が取り出せないPDF） ----
#
# 1行ごとに、その行の「図形の文字」だけを白紙に描き直して読む（取り出せる数字・英字と
# 枠線・図は描かない）。OCRが返す1字ごとの位置で、どの図形の字かを対応づける
# （図形1つに字1つが対応したものだけを使う）。同じ形の字は文書全体で多数決をとり、
# 行ごとの読み違いをならす。どの読みも付かなかった字は「〓」にし、notes に ocr_unknown を残す。

OCR_ZOOM = 4
PARA_MARGIN = 110  # 本文の行はこれより左から始まる（R8は左端93pt・字下げ104pt。図の中のラベル・表の行と見分ける）
_ITEM = re.compile(r"^(?:[a-zア-オ][.．]|[（(][0-9０-９a-zア-オ]+[）)]|[①-⑳])")
_FULLWIDTH = str.maketrans({",": "，", "(": "（", ")": "）", ":": "：", ";": "；", "?": "？", "!": "！", "%": "％", "~": "～"})


_FLAT = set("ー一－-—―‐=＝_~～へヘ")  # 「へ」も横長で曲線を含むが、「～」にしない（「外側へ倒れこむ」）


def _cjk(c):
    return "\u3000" <= c <= "\u9fff" or "\uff00" <= c <= "\uffef"


class _El:
    """行を作る要素：図形の文字（glyph）か、取り出せた語（word）。"""

    __slots__ = ("rect", "glyph", "text", "sid", "under")

    def __init__(self, rect, glyph=None, text=None):
        self.rect, self.glyph, self.text, self.sid, self.under = rect, glyph, text, None, False


class _ShapeIndex:
    """形の番号付け（大きさで振り分けてから比べるので、字が多くても速い）。"""

    def __init__(self):
        self.buckets, self.count = {}, 0

    def id(self, d):
        s = _shape(d)
        key = (s[0], len(s[1]))
        reps = self.buckets.setdefault(key, [])
        for k, rep in reps:
            if _same_shape(s, rep):
                return k
        self.count += 1
        reps.append((self.count, s))
        return self.count


def _cluster_lines(els):
    rows = []
    for e in sorted(els, key=lambda e: ((e.rect.y0 + e.rect.y1) / 2, e.rect.x0)):
        c = (e.rect.y0 + e.rect.y1) / 2
        if rows and c - rows[-1][0] <= 7:
            rows[-1][1].append(e)
        else:
            rows.append([c, [e]])
    return [sorted(r[1], key=lambda e: e.rect.x0) for r in rows]


def _bbox(els):
    import fitz

    r = fitz.Rect()
    for e in els:
        r.include_rect(e.rect)
    return r


def _draw_glyphs(glyphs):
    """図形の文字だけを白紙に描き直してPNGにする（位置関係はそのまま）。"""
    import fitz

    r = _bbox([_El(g["rect"]) for g in glyphs]) + (-3, -3, 3, 3)
    doc = fitz.open()
    page = doc.new_page(width=r.width, height=r.height)
    sh = page.new_shape()
    off = r.tl
    move = fitz.Matrix(1, 0, 0, 1, -off.x, -off.y)
    for g in glyphs:
        for it in g["items"]:
            op = it[0]
            if op == "l":
                sh.draw_line(it[1] - off, it[2] - off)
            elif op == "c":
                sh.draw_bezier(it[1] - off, it[2] - off, it[3] - off, it[4] - off)
            elif op == "re":
                sh.draw_rect(fitz.Rect(it[1]).transform(move))
            elif op == "qu":
                sh.draw_quad(fitz.Quad(it[1]).transform(move))
        sh.finish(fill=(0, 0, 0), color=None, even_odd=bool(g.get("even_odd")), closePath=bool(g.get("closePath")))
    sh.commit()
    png = page.get_pixmap(matrix=fitz.Matrix(OCR_ZOOM, OCR_ZOOM), alpha=False).tobytes("png")
    doc.close()
    return png, off.x


def _glyph_char(ch, g, mid=None):
    """OCRの字を、図形の字（日本語の書体）として自然な形にそろえる。mid は行の中央の高さ。"""
    r = g["rect"]
    # 行の上半分にある小さな丸は度の記号（「。」と読まれやすい）
    if mid is not None and ch in "。o○0O°゜" and r.y1 < mid and r.width < 6 and r.height < 6:
        return "°"
    # 横長の「＝」は「王」と読まれやすい
    if ch == "王" and r.height < r.width * 0.7:
        return "＝"
    # 横長で曲線を含む字は「～」（単独だと「て」などに読まれやすい）。長音「ー」などはそのまま
    if r.height < r.width * 0.45 and ch not in _FLAT and any(it[0] == "c" for it in g["items"]):
        return "～"
    return ch.translate(_FULLWIDTH)


def _join(els, chars):
    """要素を左から順に文字にする。英数字どうしの間だけ空白を入れる。下線部は［ ］で囲む。"""
    out, prev = "", None
    for e in els:
        t = e.text if e.text is not None else chars.get(id(e), "")
        if prev is not None and prev.under and not e.under:
            out += "］"
        if prev is not None and t and out and not _cjk(out.rstrip("］")[-1:] or "あ") and not _cjk(t[0]) and e.rect.x0 - prev.rect.x1 > 1.5:
            out += " "
        if e.under and not (prev is not None and prev.under):
            out += "［"
        out += t
        prev = e
    if prev is not None and prev.under:
        out += "］"
    return out


def _cells(ln, gap=12):
    """行を、間のあいた所（表の列の境目）で区切る。"""
    cells = []
    for e in ln:
        if cells and e.rect.x0 - cells[-1][-1].rect.x1 <= gap:
            cells[-1].append(e)
        else:
            cells.append([e])
    return cells


class _OcrPage:
    """1問（1ページ）を、本文の行・図の範囲・選択肢の行に分ける。"""

    def __init__(self, number, no, pg, shapes):
        self.number, self.no, self.pg = number, no, pg
        self.notes = []
        heading = {id(d) for d in _top_glyph_run(pg)}
        markers = _choice_markers(pg)
        self.markers = markers
        body_top = max((d["rect"].y1 for d in pg.glyphs if id(d) in heading), default=0)
        boxes, graphics = [], [fitz_rect(b) for b in pg.images]
        for d in pg.drawings:
            if _is_glyph(d):
                continue
            r = d["rect"]
            if r.height <= 22 and r.width <= 120 and r.width > 1.5 and r.height > 1.5:
                boxes.append(r)  # 文中の枠（「ア」の空欄など）。行に文字があれば枠とみなす
            else:
                graphics.append(r)
        els = [_El(fitz_rect(w[:4]), text=w[4]) for w in pg.words if w[1] >= body_top - 1]
        for d in pg.glyphs:
            if id(d) in heading or d["rect"].y0 < body_top - 1:
                continue
            e = _El(d["rect"], glyph=d)
            e.sid = shapes.id(d)
            els.append(e)
        lines = _cluster_lines(els)
        # 下線：文字の行のすぐ下にある横線。図としては数えず、上にある字に印を付ける
        rest = []
        for g in graphics:
            # 表の罫線（ほかの線とつながっている線）は下線ではない
            touching = any(o is not g and o.x0 <= g.x1 + 1 and o.x1 >= g.x0 - 1 and o.y0 <= g.y1 + 1 and o.y1 >= g.y0 - 1 for o in graphics)
            marked = []
            if g.height <= 1.5 and g.width > 5 and not touching:
                near = {id(e) for e in els if -3 <= g.y0 - e.rect.y1 <= 4}
                for ln in lines:
                    # 本文・選択肢の行（左端から始まる行）の下の線だけを下線とする。図の中の線は図のまま
                    if _bbox(ln).x0 <= PARA_MARGIN and any(id(e) in near for e in ln):
                        marked += [e for e in ln if g.x0 - 1 <= (e.rect.x0 + e.rect.x1) / 2 <= g.x1 + 1]
            if not marked:
                rest.append(g)
                continue
            for e in marked:
                e.under = True
            self.notes.append("underline")
        graphics = rest
        for b in boxes:
            line = next((ln for ln in lines if _bbox(ln).intersects(b)), None)
            if not line or all(b.contains(e.rect) for e in line):
                graphics.append(b)  # 文字が枠の中にしかない＝表のます目
        choice_top = markers[0][1] - 3 if markers else self.pg.limit
        above = [ln for ln in lines if _bbox(ln).y1 <= choice_top + 1]
        self.choice_lines = [ln for ln in lines if _bbox(ln).y1 > choice_top + 1]

        def left(ln):
            # 行頭が枠（「ア」の空欄）なら枠の左端を行頭とする
            b = _bbox(ln)
            return min([b.x0] + [x.x0 for x in boxes if x.y0 < b.y1 and x.y1 > b.y0])

        self.left = left

        # 選択肢の列見出し（「ア イ ウ」）：選択肢のすぐ上の、短い字が間をあけて並ぶ行
        self.header = None
        if above and markers:
            ln = above[-1]
            b = _bbox(ln)
            cells = _cells(ln)
            if (b.y1 >= choice_top - 25 and left(ln) > PARA_MARGIN and len(cells) >= 2
                    and all(len(c) <= 2 for c in cells) and not any(g.y0 < b.y1 and g.y1 > b.y0 for g in graphics)):
                self.header = ln
                above = above[:-1]
        # 図・表の範囲：最初の図形（または本文の位置から外れた行）から選択肢の手前まで
        starts = [g.y0 for g in graphics if g.y1 <= choice_top + 1]
        starts += [_bbox(ln).y0 for ln in above if left(ln) > PARA_MARGIN]
        self.below_choices = any(g.y0 > choice_top for g in graphics)
        self.block = None
        stem = above
        if starts:
            top = min(starts)
            # 図のすぐ上のラベル行（点A・B・C、表の題など）は図の側に入れる
            for ln in reversed([ln for ln in above if _bbox(ln).y0 < top]):
                if _bbox(ln).y1 >= top - 12:
                    top = _bbox(ln).y0
                else:
                    break
            stem = [ln for ln in above if _bbox(ln).y1 <= top + 1]
            block = [ln for ln in above if _bbox(ln).y1 > top + 1]
            r = _bbox([e for ln in block for e in ln])
            for g in graphics:
                if g.y1 <= choice_top + 1 and (self.header is None or g.y1 <= _bbox(self.header).y0 + 1):
                    r.include_rect(g + (-0.5, -0.5, 0.5, 0.5))  # 縦横の線は幅0の範囲なので、広げてから含める
            self.block = r
        self.stem_lines = stem
        self.choice_content = self._choice_content()

    def jobs(self):
        """OCRする行（図形の文字を含む行）。"""
        out = []
        for ln in self.stem_lines + self.choice_content + ([self.header] if self.header else []):
            gl = [e for e in ln if e.glyph is not None]
            if gl:
                out.append((ln, gl))
        return out

    def _choice_content(self):
        if not self.markers:
            return []
        ids = {id(m) for m in self.markers}
        out = []
        for ln in self.choice_lines:
            m = next((e for e in ln if e.text is not None and e.rect.y0 > 0 and _is_marker(e, self.markers)), None)
            # 番号と、番号のすぐ右の「.」は除く
            rest = [e for e in ln if e is not m and not (m is not None and e.glyph is not None and e.rect.x0 <= m.rect.x1 + 4)]
            out.append(rest)
        del ids
        return out


def fitz_rect(r):
    import fitz

    return fitz.Rect(r)


def _is_marker(e, markers):
    return any(abs(e.rect.x0 - m[0]) < 0.5 and abs(e.rect.y0 - m[1]) < 0.5 for m in markers)


def _assign(gl, chars, offset_x):
    """OCRの字を、中心の位置がいちばん近い図形の字に割り当てる。{要素id: [字]}"""
    got = {id(e): [] for e in gl}
    for ch, x0, x1, conf in chars or []:
        cx = (x0 + x1) / 2 / OCR_ZOOM + offset_x
        e = min(gl, key=lambda e: abs((e.rect.x0 + e.rect.x1) / 2 - cx))
        got[id(e)].append(ch)
    return got


VISION_WEIGHT = 3  # Vision の1票は Tesseract の3票分
VISION_FIX = {"=": "＝", "'": "′", "’": "′", '"': "″", "”": "″"}  # 等号は全角。角度の分・秒の記号はプライムにそろえる


def _vision_reads(pages, jobs):
    """図形の字ごとに、Vision がその位置で読んだ1字を返す {要素id: 字}（Vision が使えないときは空）。"""
    if not vision.enabled():
        return {}
    out = {}
    syms = {}
    for p in pages:
        _, png, zoom, ox, oy = ocr._render(p.pg.page, "6")
        full = vision.annotate(png)
        syms[p.number] = vision.symbols(full, zoom, ox, oy) if full else []
    for p, ln, gl in jobs:
        for e in gl:
            r = e.rect
            # Vision の字の枠は行の高さいっぱいなので、横は字の中央、縦は重なりで比べる（小さな「′」「²」も拾う）
            hit = {t for x0, y0, x1, y1, t in syms.get(p.number, ()) if r.x0 - 0.5 <= (x0 + x1) / 2 <= r.x1 + 0.5 and y0 < r.y1 and y1 > r.y0}
            if len(hit) == 1:
                t = hit.pop()
                # 空欄の記号「エ」を Vision は英字の「I」と読む。「I」は Tesseract の読みに任せる
                if t != "I":
                    out[id(e)] = VISION_FIX.get(t, t)
    return out


def _ocr_questions(numbered, by_no):
    shapes = _ShapeIndex()
    pages = [_OcrPage(n, no, by_no[no], shapes) for n, no in numbered]
    jobs = [(p, ln, gl) for p in pages for ln, gl in p.jobs()]
    images = [_draw_glyphs([e.glyph for e in gl]) for _, _, gl in jobs]
    results = ocr.read_lines([png for png, _ in images])
    # Google Cloud Vision が使えるときは、ページ全体を読んだ字も、位置の重なる図形の字に1票ずつ（重み付きで）入れる。
    # Tesseract は「楕→椿」「署→賭」や R・α・β・π などを同じ形でいつも読み違えるので、多数決で Vision の読みを優先する
    seen = _vision_reads(pages, jobs)
    # 字の数が描いた字の数と同じ行は、左から順に1字ずつ対応づける（確実）。その行の字だけで形ごとの多数決をとる。
    # 数が合わない行は、OCRの字の位置でいちばん近い図形に割り当てる（位置はずれうるので多数決には使わない）
    votes, own = {}, {}
    for (p, ln, gl), (_, off), res in zip(jobs, images, results):
        if res is None:
            continue
        if len(res) == len(gl):
            mid = (_bbox(ln).y0 + _bbox(ln).y1) / 2
            for e, r in zip(gl, res):
                c = _glyph_char(r[0], e.glyph, mid)
                own[id(e)] = c
                votes.setdefault(e.sid, {}).setdefault(c, 0)
                votes[e.sid][c] += 1
        else:
            got = _assign(gl, res, off)
            mid = (_bbox(ln).y0 + _bbox(ln).y1) / 2
            for e in gl:
                if len(got[id(e)]) == 1:
                    own[id(e)] = _glyph_char(got[id(e)][0], e.glyph, mid)
    for (p, ln, gl) in jobs:
        mid = (_bbox(ln).y0 + _bbox(ln).y1) / 2
        for e in gl:
            ch = seen.get(id(e))
            if ch:
                c = _glyph_char(ch, e.glyph, mid)
                own[id(e)] = c
                votes.setdefault(e.sid, {}).setdefault(c, 0)
                votes[e.sid][c] += VISION_WEIGHT
    best = {sid: max(v.items(), key=lambda kv: (kv[1], kv[0]))[0] for sid, v in votes.items()}
    # どの読みも付かなかった字は、1字だけ描いてもう一度読む
    missing = {}
    for _, ln, gl in jobs:
        for e in gl:
            if e.sid not in best and id(e) not in own and e.sid not in missing:
                missing[e.sid] = (e.glyph, (_bbox(ln).y0 + _bbox(ln).y1) / 2)
    for sid, ch in zip(missing, ocr.read_chars([_draw_glyphs([g])[0] for g, _ in missing.values()])):
        if ch:
            best[sid] = _glyph_char(ch, *missing[sid])
    line_text, unknown = {"chars": {}}, {}
    for p, ln, gl in jobs:
        chars = {}
        for e in gl:
            c = best.get(e.sid) or own.get(id(e))
            if c is None:
                c = "〓"
                unknown[p.number] = unknown.get(p.number, 0) + 1
            elif c in "。°":
                # 句点と度の記号はこの書体では同じ形。行の上半分にあれば度とする
                c = _glyph_char("。", e.glyph, (_bbox(ln).y0 + _bbox(ln).y1) / 2)
            chars[id(e)] = c
        line_text["chars"].update(chars)
        line_text[id(ln)] = _join(ln, chars)
    return [_build_ocr_question(p, line_text, unknown.get(p.number, 0)) for p in pages]


def _paragraphs(lines, line_text, left=lambda ln: _bbox(ln).x0):
    """行をつなぐ。段落の1行目（字下げした行）と箇条（a. など）の1行目で改行する。

    R8の形：段落は1行目が字下げ・2行目以降が左端。箇条は1行目が左端（a.）・2行目以降が字下げ。
    """
    if not lines:
        return ""
    margin = min(left(ln) for ln in lines)
    parts, in_item = [], False
    for ln in lines:
        t = line_text.get(id(ln)) or _join(ln, {})
        x0 = left(ln)
        if _ITEM.match(t):
            parts.append(t)
            in_item = True
            continue
        if not parts or (x0 > margin + 5 and not in_item):
            parts.append(t)
            in_item = False
            continue
        prev = parts[-1]
        sep = " " if prev and prev[-1].isascii() and prev[-1].isalnum() and t[:1].isascii() and t[:1].isalnum() else ""
        parts[-1] = prev + sep + t
    # 次の行へ続く下線部は1つにまとめる
    return "\n".join(parts).replace("］［", "")


def _build_ocr_question(p, line_text, unknown):
    notes = ["ocr"] + sorted(set(p.notes))
    if unknown:
        notes.append(f"ocr_unknown:{unknown}")
    stem = _paragraphs(p.stem_lines, line_text, p.left)
    choices, choice_mode = [], "text"
    content = p.choice_content
    if p.markers:
        groups = [[] for _ in p.markers]
        for ln in content:
            y = _bbox(ln).y0 if ln else None
            if y is None:
                continue
            k = max((i for i, m in enumerate(p.markers) if m[1] - 3 <= y), default=None)
            if k is not None:
                groups[k].append(ln)
        labels = None
        if p.header is not None:
            labels = [((_bbox(c).x0 + _bbox(c).x1) / 2, _join(c, line_text.get("chars", {}))) for c in _cells(p.header)]
        for g in groups:
            if any(e.glyph is not None for ln in g for e in ln):
                choice_mode = "ocr"
            if labels and len(g) == 1:
                # 列見出しのある選択肢は「ア：…、イ：…」の形にする（列の意味を文字だけで伝えるため）
                # 字間より広いすき間で区切ったまとまりを、中央がいちばん近い見出しの列に入れる
                cols = [[] for _ in labels]
                for c in _cells(g[0], gap=6):
                    cx = (_bbox(c).x0 + _bbox(c).x1) / 2
                    cols[min(range(len(labels)), key=lambda i: abs(labels[i][0] - cx))].extend(c)
                parts = [f"{lab}：{_join(c, line_text['chars'])}" for (_, lab), c in zip(labels, cols) if c]
                choices.append("、".join(parts))
            else:
                choices.append(_paragraphs(g, line_text) if g else "")
    crops = []
    has_graphics = p.block is not None
    if p.below_choices:
        # 選択肢より下に図がある形は想定外。1問分をまるごと画像にする
        body = p.pg.body_rect()
        crops.append((p.no, (body.x0 - MARGIN, body.y0 - MARGIN, body.x1 + MARGIN, min(body.y1 + MARGIN, p.pg.limit))))
        has_graphics = True
        notes.append("graphics_below_choices")
    elif p.block is not None:
        body = p.pg.body_rect()
        crops.append((p.no, (body.x0 - MARGIN, p.block.y0 - MARGIN, body.x1 + MARGIN, p.block.y1 + MARGIN)))
    body = p.pg.body_rect()
    if not crops and not body.is_empty:
        # 図形文字のOCR結果だけを共有時の根拠にしない。
        crops.append((p.no, (body.x0 - MARGIN, body.y0 - MARGIN, body.x1 + MARGIN, min(body.y1 + MARGIN, p.pg.limit))))
    return RawQuestion(
        number=p.number,
        stem=_fix_symbols(stem),
        choices=choices,
        pages=[p.no],
        rect=(round(body.y0, 1), round(body.y1, 1)) if not body.is_empty else None,
        has_graphics=has_graphics,
        notes=notes,
        stem_mode="ocr",
        choice_mode=choice_mode,
        crops=crops,
    )


def parse_questions(doc):
    ocr.prefetch([doc[i] for i in range(doc.page_count)])
    pages = [(i + 1, _Page(doc[i])) for i in range(doc.page_count)]
    regions = _number_text(pages)
    if not regions:
        try:
            numbered = _number_glyphs(pages)
        except ParseError:
            # 字が図形になっていて、見出しの形でも問番号を確かめられない（令和7年など）：ページ全体をOCRで読む
            if not ocr.available():
                raise
            ocr.prefetch([doc[i] for i in range(doc.page_count)], force=True)
            pages = [(i + 1, _Page(doc[i], force_ocr=True)) for i in range(doc.page_count)]
            regions = _number_text(pages)
            if not regions:
                raise
        else:
            by_no = dict(pages)
            if ocr.available():
                return _ocr_questions(numbered, by_no)
            return [_question(n, no, by_no[no], False) for n, no in numbered]
    by_no = dict(pages)
    page_headings = {}
    for _, page_no, start_y, _ in regions:
        page_headings.setdefault(page_no, []).append(start_y)
    questions = []
    for n, no, y0, y1 in regions:
        first_region = _region(by_no[no], y0, y1)
        q = _question(n, no, first_region, True)
        # 令和4年度等では見出し・本文・図が1ページ、5択が次ページにある。
        # 次ページの先頭に公式の5択がそろうときだけ連結する。
        # 別問の見出しの下側を前問に混ぜない。
        next_page = by_no.get(no + 1)
        # 次ページの上半分が前問の続きで、下半分には新たな見出しがある場合もある。
        # 続きの範囲は「次の見出し」の直前で必ず切る。
        next_head = min(page_headings.get(no + 1, [next_page.limit])) if next_page else None
        continuation = _region(next_page, 0, next_head - 3) if next_page else None
        # 図・表の見出しや地図内の数字を、設問ページにある「一部の選択肢」
        # としてOCRが誤認識することがある。また「次のページに続く」は
        # OCRで欠ける場合がある。前問の5択が未完成で、次ページ先頭（次問見出し前）
        # に1〜5の選択肢がそろう場合のみ、公式ページを連結する。
        incomplete = len(q.choices) != CHOICE_COUNT or not all(q.choices)
        if (incomplete and continuation is not None and _choice_markers(continuation)):
            rest = _question(n, no + 1, continuation, False)
            if len(rest.choices) == CHOICE_COUNT and all(rest.choices):
                # ページをまたぐ設問は文章だけで図表の位置を復元できない。
                # 公式2ページを順番に添付し、正答の採点対象は同じ問番号に固定する。
                q.stem = (q.stem + "\n" + rest.stem).strip()
                q.choices = rest.choices
                q.choice_mode = rest.choice_mode
                q.pages = [no, no + 1]
                q.has_graphics = True
                q.notes.append("question_continues_next_page")
                q.crops = [
                    (no, (0, max(0, y0 - MARGIN), first_region.page.rect.width, first_region.limit)),
                    (no + 1, (0, 0, continuation.page.rect.width, continuation.limit)),
                ]
        questions.append(q)
    return mark_out_of_order(questions)
