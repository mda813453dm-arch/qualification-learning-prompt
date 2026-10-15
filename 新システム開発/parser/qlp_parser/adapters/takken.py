"""宅地建物取引士（宅建）アダプタ。

形式（R7公式PDFで確認済みの形を土台にしている）:
- 問題見出し「【問 n】」、4択（行頭の「1 」〜「4 」）
- 正答表は「問 21 … 問 30」の行の後に10個の正答番号が並ぶ形
  （R7は問題PDFの最終ページ。正答が別PDFの年度にも対応できるよう、
  正答の読み取りは渡されたPDFの全ページから探す）
"""

import re
import unicodedata

from .. import fields
from .. import ocr
from ..core import ParseError, RawQuestion, clean_text, is_page_number_line, to_int

QUALIFICATION_ID = "q041"
SECTION = "年度共通"
CHOICE_COUNT = 4
QUESTION_COUNT = 50

# OCRでは「【」が「{」「[」に、「問」が「間」に、「】」が「]】」に読まれることがある。行頭の汚れ（記号3字まで）も許す
HEADING = re.compile(r"^(?:[^\w【\[［〔{｛]|_){0,4}[【\[［〔{｛]\s*[問間]\s*([0-9０-９]{1,2})\s*[】\]］〕}｝]{1,2}")
# OCRでは番号の後の空白が「。」「.」に読まれることがある
CHOICE = re.compile(r"^([1-4１-４])(?:[ 　]+|[。．.、][ 　]*)")
# OCRで読んだ行は字下げ位置が数ptぶれるので、選択肢の番号の位置合わせを緩める
OCR_INDENT_TOL = 12
# 図形が「文字の囲み線」だけかを見分けるための目安（pt）
THIN = 1.5


def _lines(page):
    """ページの行を上から順に (y0, y1, text, x0) で返す。

    スキャンした紙・文字化けしたページは、ページ全体をOCRで読む（ocr.needs_ocr）。

    ふりがな（本文より小さい文字）は除く。ふりがなの行が選択肢の間に挟まると、
    前の選択肢の末尾に付いてしまうため。
    """
    if ocr.needs_ocr(page):
        return [ln[:4] for ln in ocr.page_ocr(page)]
    d = page.get_text("dict", sort=True)
    sizes = sorted(sp["size"] for b in d["blocks"] for ln in b.get("lines", []) for sp in ln["spans"] if sp["text"].strip())
    body_size = sizes[len(sizes) // 2] if sizes else 0
    pieces = []
    for b in d["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(sp["text"] for sp in ln["spans"] if sp["size"] >= body_size * 0.7).strip()
            if t:
                pieces.append((ln["bbox"][1], ln["bbox"][3], t, ln["bbox"][0]))
    # 同じ高さ（±3pt）の断片は1行にまとめ、左から順につなぐ（「瑕」「疵」のような分割対策）
    pieces.sort(key=lambda x: x[0])
    rows = []
    for pc in pieces:
        if rows and abs(pc[0] - rows[-1][0][0]) <= 3:
            rows[-1].append(pc)
        else:
            rows.append([pc])
    out = []
    for row in rows:
        row.sort(key=lambda x: x[3])
        out.append((min(x[0] for x in row), max(x[1] for x in row), "".join(x[2] for x in row), row[0][3]))
    return out


def _rect_key(r):
    return (round(r.x0), round(r.y0), round(r.x1), round(r.y1))


def _template_drawings(doc):
    """3ページ以上かつ半数以上のページに同じ位置で出てくる図形（トンボ・枠などの版面の飾り）。図として数えない。"""
    counts = {}
    for i in range(doc.page_count):
        for k in {_rect_key(d["rect"]) for d in doc[i].get_drawings()}:
            counts[k] = counts.get(k, 0) + 1
    need = max(3, (doc.page_count + 1) // 2)
    return {k for k, c in counts.items() if c >= need}


def _graphics_in(page, y0, y1, template=frozenset()):
    """y0〜y1の範囲に、文字以外の図（画像・表・図形）があるか。

    1本だけの細い線（下線・区切り線）は数えない。細い線が4本以上集まっていれば
    表や図とみなす。誤って「図なし」と判定するより、「図あり」で除外する方を選ぶ。
    """
    for img in page.get_image_info():
        r = img["bbox"]
        if r[3] > y0 and r[1] < y1:
            return True
    thin_lines = 0
    for dr in page.get_drawings():
        r = dr["rect"]
        if _rect_key(r) in template or not r.intersects(page.rect) or r.contains(page.rect):
            continue
        if not (r.y1 > y0 and r.y0 < y1):
            continue
        if r.width <= THIN or r.height <= THIN:
            thin_lines += 1
        else:
            return True
    return thin_lines >= 4


def parse_questions(doc):
    """全ページから問題を取り出す。見出しが重複・欠落していても止めず、問題ごとに記録する。"""
    ocr.prefetch([doc[i] for i in range(doc.page_count)])
    items = []  # (page_index, y0, y1, text, x0)
    ocr_pages = set()
    for i in range(doc.page_count):
        if ocr.needs_ocr(doc[i]):
            ocr_pages.add(i + 1)
        lines = _lines(doc[i])
        texts = [ln[2] for ln in lines]
        # 問題の見出しも選択肢もないページ（表紙・裏表紙・注意事項）と正答表のページは読まない
        if not any(HEADING.match(t) or CHOICE.match(t) for t in texts):
            continue
        if _ANSWER_ROW.search(re.sub(r"\s+", " ", unicodedata.normalize("NFKC", " ".join(texts)))):
            continue
        for y0, y1, t, x0 in lines:
            items.append((i, y0, y1, t, x0))

    template = _template_drawings(doc)
    starts = [k for k, it in enumerate(items) if HEADING.match(it[3])]
    questions = []
    for idx, k in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(items)
        head = items[k]
        number = to_int(HEADING.match(head[3]).group(1))
        body = [head[:3] + (HEADING.sub("", head[3]).strip(), head[4])] + items[k + 1:end]
        body = [b for b in body if b[3] and not is_page_number_line(b[3])]
        # 正答表のページに入ったら、そこで問題の範囲を打ち切る
        cut = next((j for j, b in enumerate(body) if "正解番号" in b[3] or "正 解" in b[3]), None)
        if cut is not None:
            body = body[:cut]

        read_by_ocr = any(b[0] + 1 in ocr_pages for b in body)
        starts_at, notes = _choice_starts(body, OCR_INDENT_TOL if read_by_ocr else 3)
        stem_lines = [b[3] for j, b in enumerate(body) if j < (starts_at[0] if starts_at else len(body))]
        choices = []
        for c, j in enumerate(starts_at):
            stop = starts_at[c + 1] if c + 1 < len(starts_at) else len(body)
            if c + 1 == len(starts_at):
                # 最後の選択肢の続きは字下げされた行だけ。字下げのない行（注意書きなど）で打ち切る
                k = j + 1
                while k < stop and body[k][4] >= body[j][4] + (2 if read_by_ocr else 4):
                    k += 1
                if k < stop:
                    notes.append("trailing_text_dropped")
                stop = k
            choices.append([(_MARKER_LIKE if read_by_ocr else CHOICE).sub("", body[j][3], count=1)] + [b[3] for b in body[j + 1:stop]])

        pages = sorted({b[0] + 1 for b in body}) or [head[0] + 1]
        # 問題の範囲（ページごと）に図があるか
        has_graphics = False
        for p in pages:
            on_page = [b for b in body if b[0] + 1 == p]
            y0 = min(b[1] for b in on_page)
            y1 = max(b[2] for b in on_page)
            if _graphics_in(doc[p - 1], y0, y1, template):
                has_graphics = True
        first = [b for b in body if b[0] + 1 == pages[0]]
        rect = (round(min(b[1] for b in first), 1), round(max(b[2] for b in first), 1)) if first else None
        mode, crops = "text", []
        if read_by_ocr:
            # OCRは読み違いがありうるので、問題の範囲を公式PDFの画像でも見せる（図の有無も画像で伝わる）
            mode, has_graphics = "ocr", True
            notes.append("read_by_ocr")
            for p in pages:
                on_page = [b for b in body if b[0] + 1 == p]
                pr = doc[p - 1].rect
                crops.append((p, (pr.x0 + 20, min(b[1] for b in on_page) - 6, pr.x1 - 20, max(b[2] for b in on_page) + 6)))

        questions.append(RawQuestion(
            number=number,
            stem=clean_text("\n".join(stem_lines)),
            choices=[clean_text("\n".join(c)) for c in choices],
            pages=pages,
            rect=rect,
            has_graphics=has_graphics,
            notes=notes,
            stem_mode=mode,
            choice_mode=mode,
            crops=crops,
        ))
    return questions


def _choice_starts(body, tol=3):
    """選択肢「1」〜「4」の行の位置を決める。

    - 選択肢は問題の末尾にあるので、2・3・4が順に続く「1」のうち最後のものを採る
      （本文中の「1 年以内…」のような行を選択肢と取り違えないため）
    - 2〜4は「1」と同じ字下げ位置（±3pt）の行だけを数える
      （折り返し行が「2 年間…」で始まっても選択肢と取り違えないため）
    """
    marks = [(j, to_int(CHOICE.match(b[3]).group(1)), b[4]) for j, b in enumerate(body) if CHOICE.match(b[3])]
    valid = []
    for a, (j1, n1, x1) in enumerate(marks):
        if n1 != 1:
            continue
        seq, want = [j1], 2
        for j, n, x in marks[a + 1:]:
            if n == want and abs(x - x1) <= tol:
                seq.append(j)
                want += 1
                if want > CHOICE_COUNT:
                    break
        if len(seq) == CHOICE_COUNT:
            valid.append(seq)
    if not valid and tol > 3:
        return _ocr_choice_starts(body, tol)
    if not valid:
        return [], []
    return valid[-1], (["multiple_choice_starts"] if len(valid) > 1 else [])


_MARKER_LIKE = re.compile(r"^([0-9０-９OoIlS]{1,2})(?:[ 　]+|[。．.、][ 　]*)")


def _ocr_choice_starts(body, tol):
    """OCRで番号を1つだけ読み違えた選択肢。番号らしい字で始まる行が同じ字下げで4行（本文の続きの行を挟んでよい）並び、
    そのうち3つ以上が順に1〜4と読めていれば、その4行を選択肢の始まりとする。"""
    cands = [j for j, b in enumerate(body) if _MARKER_LIKE.match(b[3])]
    best = None
    for a in range(len(cands) - CHOICE_COUNT + 1):
        win = cands[a:a + CHOICE_COUNT]
        xs = [body[j][4] for j in win]
        if max(xs) - min(xs) > tol:
            continue
        ok = sum(bool(CHOICE.match(body[j][3])) and to_int(CHOICE.match(body[j][3]).group(1)) == k for k, j in enumerate(win, 1))
        if ok >= CHOICE_COUNT - 1:
            best = win
    return (best, ["choice_number_ocr_corrected"]) if best else ([], [])


_ANSWER_ROW = re.compile(r"((?:問\s*[0-9]{1,2}\s*){2,10})((?:[1-4]\s*){2,10})")


def _page_text(page):
    if ocr.needs_ocr(page):
        return "\n".join(ln[2] for ln in ocr.page_ocr(page))
    return page.get_text(sort=True)


_GRID_ROW = re.compile(r"^(?:[1-4]\s+){9}[1-4]$")


def _grid_answers(doc):
    """問番号の見出しが文字として取り出せない正答表（令和6年度）。

    ページの文字が「1〜4が10個並ぶ行」だけで、それがちょうど5行（50問分）のときに限り、
    上の行から問1〜10、11〜20…の順とみなす（公式の正答表は10問ずつの行で並ぶ）。
    """
    for i in range(doc.page_count):
        rows = [ln.strip() for ln in unicodedata.normalize("NFKC", doc[i].get_text(sort=True)).splitlines() if ln.strip()]
        if len(rows) == QUESTION_COUNT // 10 and all(_GRID_ROW.match(r) for r in rows):
            cells = [int(x) for r in rows for x in r.split()]
            return {n: c for n, c in enumerate(cells, 1)}
    return {}


def parse_answers(doc):
    """正答表を読む。「問 a … 問 b」の見出しと同数の正答番号が並ぶ行だけを採用する。"""
    answers = {}
    for i in range(doc.page_count):
        text = unicodedata.normalize("NFKC", _page_text(doc[i]))
        text = re.sub(r"\s+", " ", text)
        for m in _ANSWER_ROW.finditer(text):
            nums = [int(x) for x in re.findall(r"問\s*([0-9]{1,2})", m.group(1))]
            cells = [int(x) for x in re.findall(r"[1-4]", m.group(2))]
            if len(nums) != len(cells):
                continue
            for n, c in zip(nums, cells):
                if n in answers and answers[n] != c:
                    raise ParseError("ANSWER_TABLE_CONFLICT", question=n)
                answers[n] = c
    if not answers:
        answers = _grid_answers(doc)
    if not answers:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def classify(question):
    """分野（fieldId）を内容から規則で分類する（qlp_parser/fields.py。分野の表は案・承認待ち）。"""
    return fields.classify_takken(question)
