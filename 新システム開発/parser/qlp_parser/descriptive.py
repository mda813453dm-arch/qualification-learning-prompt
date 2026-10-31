"""土地家屋調査士の記述式・公式問題原本表示（採点や模範解答の生成はしない）。

択一用パケットと正答表を変更せず、同一SHAが検証済みの公式問題冊子から
午前11／午後21・22の見出しと継続ページを切り出す。
"""
import base64
import hashlib
import re
import unicodedata

from .adapters.land_surveyor import PIN_BY_YEAR
from .scanned_descriptive import SCANNED_DESCRIPTIVE

MAX_DESCRIPTIVE_PAGES = 12
HEADER = re.compile(r"^第\s*(\d{1,2})\s*問(?:\s|$)")
APPENDIX = re.compile(r"^(?:付録|附録|関数表|三角関数表|答案用紙|解答用紙|三角関数値表|数表)")
FOOTER = re.compile(r"^[\-─‐ー－]*\s*[（(]\s*\d+\s*[）)]\s*[\-─‐ー－]*$")


class DescriptiveError(ValueError):
    pass


def _norm(value):
    return unicodedata.normalize("NFKC", str(value or "")).translate(
        {ord(ch):None for ch in "\u200b\u200c\u200d\ufeff"}).strip()


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



def _figure_confidence(page, box):
    """独立した図だけを選ぶ。サイズのみでは採用しない。

    描画命令の種類・図形の空間分布・文字の占有率を照合する。
    単なる下線や枠付き文章は図と認定しない。
    """
    import fitz
    rect = fitz.Rect(box)
    if rect.is_empty or rect.width < 75 or rect.height < 65:
        return False
    drawings = []
    for d in page.get_drawings():
        dr = fitz.Rect(d["rect"])
        if dr.intersects(rect):
            drawings.append(d)
    images = sum(bool(page.get_image_rects(img[0]) and
                      any(fitz.Rect(ir).intersects(rect) for ir in page.get_image_rects(img[0])))
                 for img in page.get_images())
    if not drawings and not images:
        return False
    text_lines = []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            lr = fitz.Rect(line["bbox"])
            if lr.intersects(rect):
                content = "".join(span.get("text", "") for span in line.get("spans", []))
                if content.strip():
                    text_lines.append((lr, content.strip()))
    text_chars = sum(len(t) for _, t in text_lines)
    area = rect.width * rect.height
    # 長文の枠や文字だらけの領域を図として切り出さない。
    if text_chars > max(120, area / 190):
        return False
    # 直線の方向が二方向以上に分布する、または画像が存在する。
    vertical = horizontal = diagonal = 0
    for d in drawings:
        for item in d.get("items", []):
            if not item or item[0] != "l":
                continue
            a, b = item[1], item[2]
            dx, dy = abs(a.x-b.x), abs(a.y-b.y)
            if dx < 1 and dy > 6: vertical += 1
            elif dy < 1 and dx > 6: horizontal += 1
            elif dx > 6 and dy > 6: diagonal += 1
    if images:
        return True
    if diagonal >= 2 and (horizontal + vertical + diagonal) >= 3:
        return True
    if vertical >= 2 and horizontal >= 2 and text_chars <= 65:
        return True
    return False


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
                    # 登記記録の結合セルでは、PDFのテキスト層が視覚行の順序と
                    # 異なることがある。行列は原本の罫線から採り、セルを構成する
                    # 数値および文字を独立に照合する。並びを推測・追加しない。
                    numeric = re.findall(r"\d+(?:\.\d+)?", token)
                    if any(num not in corpus for num in numeric) or any(
                            c.isalpha() and c not in corpus for c in token):
                        raise DescriptiveError("DESCRIPTIVE_TABLE_CELL_UNVERIFIED")
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
        if any(((box & t).width * (box & t).height) > (box.width * box.height) * 0.12 for t in omitted.get(page_num, [])):
            continue
        page = doc[page_num-1]
        clip = box & page.rect
        if clip.is_empty or (clip.width * clip.height) < 4500:
            continue
        if not _figure_confidence(page, clip):
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
                if (box.width * box.height) <= 0:
                    continue
                if any(((box & excluded).width * (box & excluded).height) / (box.width * box.height) >= .48
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
    # PDFのテキストブロック境界は意味上の改行ではない。
    # 句点で文を確定し、表・図・見出しの前後だけを独立させる。
    blocks = []
    pending = ""
    def flush():
        nonlocal pending
        if pending.strip():
            blocks.append({"kind": "text", "text": pending.strip()})
        pending = ""
    for _, _, _, _, item in slots:
        if item["kind"] != "text":
            flush()
            blocks.append(item)
            continue
        raw = item["text"].strip()
        if not raw:
            continue
        if re.match(r"^(?:第\\s*\\d+\\s*問|問\\s*[1-9]\\b|〔|【|［)", _norm(raw)):
            flush()
        pending += raw
        # 「。」で段落を分ける。「、」では切らない。
        parts = re.split(r"(?<=[。！？])(?=[^」』）])", pending)
        for part in parts[:-1]:
            if part.strip():
                blocks.append({"kind": "text", "text": part.strip()})
        pending = parts[-1]
    flush()
    if len(blocks) > 400 or not any(b["kind"] == "text" for b in blocks):
        raise DescriptiveError("DESCRIPTIVE_LAYOUT_UNVERIFIED")
    # 問題文が図表と別の形で検証できないときはページ画像への暗黙フォールバックをしない。
    combined = "".join(b["text"] for b in blocks if b["kind"] == "text")
    if not re.search(r"第\s*" + str(11 if "第11問" in _norm(combined) else 21 if "第21問" in _norm(combined) else 22) + r"\s*問", combined):
        # タイトルは元PDFですでに検証されているが、このビューにも残っている必要がある。
        if "第" not in combined:
            raise DescriptiveError("DESCRIPTIVE_HEADING_LOST")
    return blocks, images

def _extract_scanned_descriptive(doc, *, year, section, number, known, source):
    """Render only the audited original pages; never OCR or reconstruct measurements.

    This path deliberately does not generate selectable prose, answer numbers,
    official solutions, or any grading packet. The static intervals can only be
    used with the matching immutable 2007-2014 source PDF.
    """
    import fitz

    _, total_pages, question_ranges = source
    if len(doc) != total_pages:
        raise DescriptiveError("DESCRIPTIVE_SCANNED_PAGE_COUNT_MISMATCH")
    if number not in question_ranges:
        raise DescriptiveError("DESCRIPTIVE_QUESTION_UNSUPPORTED")
    first, last = question_ranges[number]
    if not 1 <= first <= last <= total_pages or last-first+1 > MAX_DESCRIPTIVE_PAGES:
        raise DescriptiveError("DESCRIPTIVE_SCANNED_PAGE_RANGE_INVALID")
    nums = list(range(first, last+1))
    pages, diagrams = {}, {}
    layout = [
        {"kind":"text", "text":f"第{number}問　過去問原本の画像表示"},
        {"kind":"text", "text":"画像中心の保存版PDFです。本文・数値表・図面は画像を拡大して確認してください。文字のOCR復元や自動採点は行いません。"},
    ]
    for index, page_number in enumerate(nums, 1):
        page = doc[page_number-1]
        if page.rect.is_empty or page.rect.width < 200 or page.rect.height < 200:
            raise DescriptiveError("DESCRIPTIVE_SCANNED_PAGE_INVALID")
        png = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False).tobytes("png")
        encoded = base64.b64encode(png).decode("ascii")
        pages[f"p{page_number}.png"] = encoded
        filename = f"f{index}.png"
        diagrams[filename] = encoded
        layout.append({"kind":"figure", "page":page_number, "file":filename,
                       "caption":f"保存版原本 {page_number}ページ"})
    return {
        "status":"ready", "kind":"descriptive", "year":year, "section":section,
        "number":number, "questionSha256":known, "pages":pages,
        "pageNumbers":nums, "layout":layout, "diagrams":diagrams,
        "text":f"第{number}問　保存版原本の{first}〜{last}ページを画像で表示しています。",
        "textComplete":False, "gradingMode":"none", "solutionAvailable":False,
        "notice":"画像原本を閲覧する記述式です。模範解答は生成せず、自動採点もしません。",
    }


def extract_descriptive(*, pdf_bytes, year, section, number, expected_sha):
    import fitz

    if not isinstance(pdf_bytes, bytes) or not pdf_bytes.startswith(b"%PDF-"):
        raise DescriptiveError("DESCRIPTIVE_PDF_INVALID")
    if section not in ("午前の部", "午後の部"):
        raise DescriptiveError("DESCRIPTIVE_SECTION_INVALID")
    if not isinstance(year, int) or (year not in PIN_BY_YEAR and year not in SCANNED_DESCRIPTIVE):
        raise DescriptiveError("DESCRIPTIVE_YEAR_UNVERIFIED")
    if type(number) is not int:
        raise DescriptiveError("DESCRIPTIVE_NUMBER_INVALID")
    scanned_source = SCANNED_DESCRIPTIVE.get(year, {}).get(section)
    known = scanned_source[0] if scanned_source else PIN_BY_YEAR[year][section]
    if expected_sha != known or hashlib.sha256(pdf_bytes).hexdigest() != known:
        raise DescriptiveError("DESCRIPTIVE_SHA_MISMATCH")
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise DescriptiveError("DESCRIPTIVE_PDF_UNREADABLE") from exc
    if scanned_source:
        return _extract_scanned_descriptive(doc, year=year, section=section,
                                           number=number, known=known, source=scanned_source)
    cover = _norm(doc[0].get_text()).replace(" ", "")
    # 実原本の表紙は資格名を省略するので年度・部を固定SHAと表記で照合する。
    year_label = (year - 2018) if year >= 2019 else (year - 1988)
    era_label = (f"令和{year_label}年度" if year >= 2019 else f"平成{year_label}年度")
    covers_year = (era_label in cover or (year == 2019 and "令和元年度" in cover) or
                   f"({year_label:02d})" in cover or f"（{year_label:02d}）" in cover or
                   (year == 2016 and re.search(r"^28試験問題", re.sub(r"[\s\x00-\x1f]", "", cover))))
    if section not in cover or not covers_year:
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
    try:
        layout, diagrams = structured_descriptive(doc, nums)
    except DescriptiveError as exc:
        # Some archived answer-form tables cannot be reconstructed as editable
        # rows without swapping cells. For SHA-pinned historical scans, retain
        # every verified original page as a zoomable image instead of guessing.
        # Never apply this fallback to other exceptions or unpinned sources.
        if str(exc) not in ("DESCRIPTIVE_TABLE_STRUCTURE_INVALID", "DESCRIPTIVE_TABLE_CELL_UNVERIFIED") or not 2015 <= year <= 2021:
            raise
        layout = [
            {"kind":"text", "text":f"第{number}問　原本図表・本文"},
            {"kind":"text", "text":"表の位置関係を保持するため、以下は照合済みPDFのページ画像で表示します。"},
        ]
        diagrams = {}
        for index, page_number in enumerate(nums, 1):
            name = f"f{index}.png"
            diagrams[name] = pages[f"p{page_number}.png"]
            layout.append({"kind":"figure", "page":page_number, "file":name,
                           "caption":f"原本PDF {page_number}ページ"})
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
