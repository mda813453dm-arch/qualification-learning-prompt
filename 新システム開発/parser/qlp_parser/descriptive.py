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
APPENDIX = re.compile(r"^(?:付録|附録|関数表|三角関数表|答案用紙|解答用紙)")
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
            if not lines or APPENDIX.match(lines[0]):
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
    if not re.search(r"第\s*"+str(number)+r"\s*問", raw):
        raise DescriptiveError("DESCRIPTIVE_TEXT_UNVERIFIED")
    return {
        "status": "ready", "kind": "descriptive", "year": year, "section": section,
        "number": number, "questionSha256": known, "pages": pages, "pageNumbers": nums,
        "text": raw[:40000], "textComplete": len(raw) <= 40000,
        "gradingMode": "none", "solutionAvailable": False,
        "notice": "原本問題・図表の閲覧用です。公式模範解答の存在は確認されていません。自動採点しません。",
    }
