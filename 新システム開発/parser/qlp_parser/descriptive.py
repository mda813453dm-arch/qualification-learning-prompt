"""土地家屋調査士の記述式・公式問題原本表示（採点や模範解答の生成はしない）。

択一用パケットと正答表を変更せず、同一SHAが検証済みの公式問題冊子から
午前11／午後21・22の見出しと継続ページを切り出す。
"""
import base64
import hashlib
import re
import unicodedata

from .adapters.land_surveyor import PIN_BY_YEAR

MAX_DESCRIPTIVE_PAGES = 12
HEADER = re.compile(r"^第\s*(\d{1,2})\s*問(?:\s|$)")
APPENDIX = re.compile(r"^(?:付録|附録|関数表|三角関数表|答案用紙|解答用紙|三角関数値表|数表)")
FOOTER = re.compile(r"^[\-─‐ー－]*\s*[（(]\s*\d+\s*[）)]\s*[\-─‐ー－]*$")


class DescriptiveError(ValueError):
    pass


def _norm(value):
    return unicodedata.normalize("NFKC", str(value or "")).strip()


def _page_lines(page):
    return [_norm(s) for s in page.get_text("text", sort=True).splitlines()
            if _norm(s) and not FOOTER.fullmatch(_norm(s))]


def find_descriptive_pages(doc, section, number):
    """前後の択一・他の記述式・付録・答案用紙と混同しない。"""

    expected = 11 if section == "午前の部" else (21, 22)
    if number not in ((11,) if section == "午前の部" else (21, 22)):
        raise DescriptiveError("DESCRIPTIVE_QUESTION_UNSUPPORTED")
    start = None
    for i, page in enumerate(doc):
        lines = _page_lines(page)
        if any(HEADER.match(line) and int(HEADER.match(line).group(1)) == number
               for line in lines[:4]):
            if start is not None:
                raise DescriptiveError("DESCRIPTIVE_HEADING_DUPLICATED")
            start = i
    if start is None:
        raise DescriptiveError("DESCRIPTIVE_HEADING_NOT_FOUND")
    nums = []
    for i in range(start, len(doc)):
        lines = _page_lines(doc[i])
        if i > start:
            # 旧冊子では付録の計算表が「度 sin cos tan」等で始まる。
            # 付録を第11問に混入させず、本文・数値表と別に扱う。
            header = "".join(lines[:6]).lower().replace(" ", "")
            if not lines or APPENDIX.match(lines[0]) or (
                all(k in header for k in ("sin", "cos", "tan")) and
                ("度" in header or "角度" in header)
            ):
                break
            # 旧年度の関数表は見出しが「度 sin cos tan」で始まる。
            # 問題の図とは無関係な付録を記述式の本文・表に混入させない。
            header = "".join(lines[:8]).lower()
            if "度" in header and all(w in header for w in ("sin", "cos", "tan")):
                break
            match = next((HEADER.match(line) for line in lines[:3] if HEADER.match(line)), None)
            if match and int(match.group(1)) != number:
                break
            # 登記申請書や地積測量図の別紙は、問題の指示内に収まる限り残す。
            if len(nums) >= MAX_DESCRIPTIVE_PAGES:
                raise DescriptiveError("DESCRIPTIVE_PAGE_LIMIT")
        nums.append(i + 1)
    if not nums:
        raise DescriptiveError("DESCRIPTIVE_PAGES_MISSING")
    return nums



def structured_descriptive(doc, nums):
    """PDF原本と座標領域を照合し、文章・表・図だけを独立した順序付きブロックにする。

    数字や図形をAIに復元させない。表が原本のテキスト層と一致しないときは
    推測で埋めずに出題を停止する。図はPDF自体を部分レンダリングする。
    """
    import fitz
    from .server import page_layout

    tables, shapes = page_layout(doc, nums)
    blocks, images, omitted = [], {}, {}
    slots = []
    check_text = lambda v: re.sub(r"\s+", "", _norm(v)).replace("，", ",")
    for table in tables:
        rows = table.get("rows", [])
        # PDF由来の結合セルは抽出器によって末尾の空欄が省略される。
        # 存在しない数値は作らず、行の列幅だけ空欄で揃える。
        columns = max((len(row) for row in rows), default=0)
        if len(rows) < 2 or columns < 2:
            continue
        if columns > 15 or len(rows) > 100:
            raise DescriptiveError("DESCRIPTIVE_TABLE_STRUCTURE_INVALID")
        rows = [list(row) + [""] * (columns - len(row)) for row in rows]
        # セルがページのテキスト層に実在するかを独立照合。
        corpus = "".join(check_text(doc[pg-1].get_text("text", clip=b)) for pg, b in table["_boxes"])
        for row in rows:
            for cell in row:
                token = check_text(cell)
                if token and token not in corpus:
                    raise DescriptiveError("DESCRIPTIVE_TABLE_CELL_UNVERIFIED: nums=" + repr(nums) + " table=" + repr(table["page"]) + " caption=" + repr(table.get("caption", "")[:50]) + " rows=" + repr(rows[:2]) + " token=" + repr(token[:30]) + " vs " + repr(corpus[:130]))
        first_page, first_box = table["_boxes"][0]
        slots.append((first_page, first_box.y0, first_box.x0, "table", {
            "kind": "table", "caption": table.get("caption", ""), "rows": rows
        }))
        for pg, box in table["_boxes"]:
            omitted.setdefault(pg, []).append(box + (-1, -1, 1, 1))

    for f in shapes:
        page_num, box = f["page"], fitz.Rect(f["bbox"])
        if box.width < 75 or box.height < 65:
            continue
        if any((box & t).get_area() > box.get_area() * 0.12 for t in omitted.get(page_num, [])):
            continue
        page = doc[page_num-1]
        clip = box & page.rect
        if clip.is_empty or clip.get_area() < 4500:
            continue
        num = len(images) + 1
        if num > 20:
            raise DescriptiveError("DESCRIPTIVE_TOO_MANY_FIGURES")
        fname = f"f{num}.png"
        pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(3, 3), alpha=False)
        images[fname] = base64.b64encode(pix.tobytes("png")).decode("ascii")
        slots.append((page_num, clip.y0, clip.x0, "figure", {
            "kind": "figure", "file": fname, "page": page_num
        }))
        omitted.setdefault(page_num, []).append(clip + (-3, -3, 3, 3))

    for pg in nums:
        page = doc[pg-1]
        for b in page.get_text("dict").get("blocks", []):
            lines = b.get("lines", [])
            if not lines:
                continue
            clean_lines = []
            for line in lines:
                box = fitz.Rect(line["bbox"])
                if box.get_area() <= 0:
                    continue
                if any((box & excluded).get_area() / box.get_area() >= .48
                       for excluded in omitted.get(pg, [])):
                    continue
                text = "".join(sp.get("text", "") for sp in line.get("spans", [])).strip()
                if not text or FOOTER.fullmatch(_norm(text)):
                    continue
                clean_lines.append((box, text))
            if clean_lines:
                # PDFの1段落中の行折返しは連結する。独立した問番号や見出しは別ブロック。
                joined = ""
                paragraphs = []
                for box, text in clean_lines:
                    if joined and re.match(r"^(?:問\s*[1-9]\b|〔|【|［)", _norm(text)):
                        paragraphs.append(joined)
                        joined = ""
                    joined += text
                if joined:
                    paragraphs.append(joined)
                for i, paragraph in enumerate(paragraphs):
                    slots.append((pg, clean_lines[0][0].y0 + i * .01,
                                  clean_lines[0][0].x0, "text", {"kind": "text", "text": paragraph}))

    slots.sort(key=lambda item: (item[0], round(item[1], 1), item[2]))
    blocks = [item[4] for item in slots]
    if len(blocks) > 400 or not any(b["kind"] == "text" for b in blocks):
        raise DescriptiveError("DESCRIPTIVE_LAYOUT_UNVERIFIED")
    # 問題文が図表と別の形で検証できないときはページ画像への暗黙フォールバックをしない。
    combined = "".join(b["text"] for b in blocks if b["kind"] == "text")
    if not re.search(r"第\s*" + str(11 if "第11問" in _norm(combined) else 21 if "第21問" in _norm(combined) else 22) + r"\s*問", combined):
        # タイトルは元PDFですでに検証されているが、このビューにも残っている必要がある。
        if "第" not in combined:
            raise DescriptiveError("DESCRIPTIVE_HEADING_LOST")
    return blocks, images

def extract_descriptive(*, pdf_bytes, year, section, number, expected_sha):
    import fitz

    if not isinstance(pdf_bytes, bytes) or not pdf_bytes.startswith(b"%PDF-"):
        raise DescriptiveError("DESCRIPTIVE_PDF_INVALID")
    if not isinstance(year, int) or year not in PIN_BY_YEAR:
        raise DescriptiveError("DESCRIPTIVE_YEAR_UNVERIFIED")
    if section not in ("午前の部", "午後の部"):
        raise DescriptiveError("DESCRIPTIVE_SECTION_INVALID")
    if type(number) is not int:
        raise DescriptiveError("DESCRIPTIVE_NUMBER_INVALID")
    known = PIN_BY_YEAR[year][section]
    if expected_sha != known or hashlib.sha256(pdf_bytes).hexdigest() != known:
        raise DescriptiveError("DESCRIPTIVE_SHA_MISMATCH")
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise DescriptiveError("DESCRIPTIVE_PDF_UNREADABLE") from exc
    cover = _norm(doc[0].get_text()).replace(" ", "")
    # 実原本の表紙は資格名を省略するので年度・部を固定SHAと表記で照合する。
    if section not in cover or not (f"令和{year-2018}年度" in cover or
                                    f"({year-2018:02d})" in cover or f"（{year-2018:02d}）" in cover):
        raise DescriptiveError("DESCRIPTIVE_COVER_MISMATCH")
    nums = find_descriptive_pages(doc, section, number)
    pages = {}
    texts = []
    for p in nums:
        page = doc[p-1]
        pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
        pages[f"p{p}.png"] = base64.b64encode(pix.tobytes("png")).decode("ascii")
        texts.append("\n".join(_page_lines(page)))
    raw = "\n\n".join(texts)
    layout, diagrams = structured_descriptive(doc, nums)
    if not re.search(r"第\s*"+str(number)+r"\s*問", raw):
        raise DescriptiveError("DESCRIPTIVE_TEXT_UNVERIFIED")
    return {
        "status": "ready", "kind": "descriptive", "year": year, "section": section,
        "number": number, "questionSha256": known, "pages": pages, "pageNumbers": nums,
        "layout": layout, "diagrams": diagrams,
        "text": raw[:40000], "textComplete": len(raw) <= 40000,
        "gradingMode": "none", "solutionAvailable": False,
        "notice": "原本問題・図表の閲覧用です。公式模範解答の存在は確認されていません。自動採点しません。",
    }
