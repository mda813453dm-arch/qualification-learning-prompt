"""宅地建物取引士（宅建）アダプタ。

形式（R7公式PDFで確認済みの形を土台にしている）:
- 問題見出し「【問 n】」、4択（行頭の「1 」〜「4 」）
- 正答表は「問 21 … 問 30」の行の後に10個の正答番号が並ぶ形
  （R7は問題PDFの最終ページ。正答が別PDFの年度にも対応できるよう、
  正答の読み取りは渡されたPDFの全ページから探す）
"""

import re
import unicodedata
import json
from functools import lru_cache
from pathlib import Path

from .. import fields
from .. import ocr
from ..core import ANSWER_SPECIAL, ParseError, mark_out_of_order, RawQuestion, clean_text, is_page_number_line, to_int

QUALIFICATION_ID = "q041"
SECTION = "年度共通"
CHOICE_COUNT = 4
QUESTION_COUNT = 50


@lru_cache(maxsize=1)
def _verified_key_documents():
    """提供されたRETIO公式PDF最終ページから照合した正答表。原本SHA一致時だけ使用。"""
    source = Path(__file__).with_name("takken_official_answers.json")
    return json.loads(source.read_text(encoding="utf-8"))["documents"]


def verified_answers(year, section, question_sha, answer_sha):
    """年度・区分・問題PDF・正答PDFをすべて固定し、異なる原本には適用しない。"""
    for record in _verified_key_documents():
        if (record["year"] == year and record["section"] == section
                and record["sha256"] == question_sha == answer_sha):
            vals = record["answers"]
            if len(vals) != QUESTION_COUNT or any(
                not (x == "all" or
                     (type(x) is int and 1 <= x <= CHOICE_COUNT) or
                     (isinstance(x, list) and len(x) > 1 and len(set(x)) == len(x)
                      and all(type(n) is int and 1 <= n <= CHOICE_COUNT for n in x)))
                for x in vals
            ):
                raise ParseError("VERIFIED_OFFICIAL_KEY_INVALID", year=year, section=section)
            return dict(enumerate(vals, 1))
    return None


# 日本語OCRが見出しの一字だけを誤認した箇所を、原本画像で確認した座標から補う。
# 一般的な推定補完はしない。原本SHA・年度・区分・前後の設問番号がすべて
# 一致した場合に限る。ページ番号は1始まりで、座標はPDFのpt単位。
_VERIFIED_IMAGE_HEADINGS = {
    (2016, "年度共通", "87923a2870184f9a0a26c76c056255aa94fa50242ff9aeda0a61eadf64699983"):
        ((16, 9, 599, 785, "都市計画法に関する次の記述のうち、正しいものはどれか。"),),
    (2020, "10月", "a6dd351660b249a88c9d641bc3f82f2e13c06f9edc429b50b179c90efac61af4"):
        ((49, 27, 347, 568, "土地に関する次の記述のうち、最も不適当なものはどれか。"),),
    (2021, "10月", "ad436ace2388e21860ea59b7bbd9482a0b4d15422737f3fc1b44291764569219"):
        ((20, 13, 60, 350, "土地区画整理法に関する次の記述のうち、誤っているものはどれか。"),
         (37, 21, 315, 706, "宅地建物取引業法第35条及び第37条の書面に関する問題"),
         (39, 22, 418, 789, "宅地建物取引業法第37条の2のクーリング・オフに関する問題")),
    (2022, "年度共通", "44baadbfaf0c5b3a872f107a4bc476d9c5a6516b3a6a0ca68678220c2271cf50"):
        ((44, 24, 385, 753, "宅地建物取引業法第37条の規定により交付すべき書面に関する問題"),),
}

_VERIFIED_FIELD_TOPICS = {
    (2020, "12月", "3e771375cee071c58baf64f51d5ca344163a45f1df00ef18abf2402c7bf24104"):
        {11: "借地借家法の規定及び判例に関する問題", 17: "建築基準法に関する問題"},
}


def recover_verified_missing_questions(doc, questions, year, section, source_sha):
    """原本の目視照合がある欠落見出しのみPNGの問題として復元する。"""
    patches = _VERIFIED_IMAGE_HEADINGS.get((year, section, source_sha), ())
    field_topics = _VERIFIED_FIELD_TOPICS.get((year, section, source_sha), {})
    for q in questions:
        if q.number in field_topics:
            q.classification_text = field_topics[q.number]
            q.notes.append("source_sha_pinned_field_topic_review")
    if not patches:
        return questions
    found = {q.number for q in questions}
    recovered = list(questions)
    for number, page_number, top, bottom, title in patches:
        if number in found:
            continue
        if number - 1 not in found or number + 1 not in found or not (1 <= page_number <= doc.page_count):
            continue
        page = doc[page_number - 1]
        if not (page.rect.y0 + 20 < top < bottom < page.rect.y1 - 15):
            continue
        previous = next(q for q in recovered if q.number == number - 1)
        # 直前の問題画像に、見出しの認識失敗でこの設問が混入しないよう切り離す。
        for i, (p, coords) in enumerate(previous.crops):
            if p == page_number and coords[1] < top < coords[3]:
                previous.crops[i] = (p, (coords[0], coords[1], coords[2], top - 10))
        recovered.append(RawQuestion(
            number=number,
            stem="",
            choices=["1", "2", "3", "4"],
            pages=[page_number],
            rect=(top, bottom),
            has_graphics=True,
            notes=["source_sha_pinned_image_heading_review"],
            stem_mode="official_image",
            choice_mode="official_image",
            crops=[(page_number, (page.rect.x0 + 16, top, page.rect.x1 - 16, bottom))],
            preserve_aspect=True,
            classification_text=title,
        ))
        found.add(number)
    return sorted(recovered, key=lambda q: q.number)

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
        mode, crops, classification_text = "text", [], None
        if read_by_ocr:
            # スキャン問題の字・選択肢の誤認を出題内容に混ぜない。
            # OCR文字は分野分類の補助にだけ使い、ユーザーには原本PDFの画像を表示する。
            classification_text = clean_text("\n".join(b[3] for b in body))
            mode, has_graphics = "official_image", True
            stem_lines, choices = [], [str(n) for n in range(1, CHOICE_COUNT + 1)]
            notes.append("official_original_image_question")
            notes.append("read_by_ocr")
            for p in pages:
                on_page = [b for b in body if b[0] + 1 == p]
                pr = doc[p - 1].rect
                # 次問見出しを下端とし、OCRで選択肢の末尾を読み落としても原本の字を欠かさない。
                following = items[end] if end < len(items) else None
                bottom = (following[1] - 9 if following and following[0] == p - 1
                          else pr.y1 - 24)
                top = min(b[1] for b in on_page) - 12 if p == pages[0] else pr.y0 + 22
                if bottom <= top + 25:
                    bottom = max(b[2] for b in on_page) + 10
                crops.append((p, (pr.x0 + 16, max(pr.y0, top), pr.x1 - 16, min(pr.y1, bottom))))

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
            preserve_aspect=read_by_ocr,
            classification_text=classification_text,
        ))
    return mark_out_of_order(questions)


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


_MARKER_LIKE = re.compile(r"^([0-9０-９OoIlS\]|｜]{1,2})(?:[ 　]+|[。．.、][ 　]*)")


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


def _answer_rows(text):
    """「問 a … 問 b」の見出しと同数の正答番号が並ぶ行から (問番号, 正答) を返す。"""
    text = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text))
    for m in _ANSWER_ROW.finditer(text):
        nums = [int(x) for x in re.findall(r"問\s*([0-9]{1,2})", m.group(1))]
        cells = [int(x) for x in re.findall(r"[1-4]", m.group(2))]
        if len(nums) == len(cells):
            yield from zip(nums, cells)


# 正答表の注記：「問48は正解肢のない問題」「1又は4のいずれも正解」「選択肢2と3のいずれも正解」など
_SPECIAL = re.compile(r"[問間]\s*([0-9]{1,2})(?:(?![問間]\s*[0-9]).){0,80}?(いずれも正解|正解肢の?ない|全員を?正解|複数解)")


def special_answers(text):
    """注記で1つの正答で採点できないとされた問番号。"""
    text = re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))
    return {int(m.group(1)) for m in _SPECIAL.finditer(text)}


def _ocr_answer_grid(page):
    """罫線のある正答表を、区切り方を変えて2回読み、食い違いのない問だけを返す。"""
    out, doubtful = {}, set()
    for psm in ("4", "11"):
        for n, c in _ocr_answer_grid_once(page, psm).items():
            if n in out and out[n] != c:
                doubtful.add(n)
            out.setdefault(n, c)
    return {n: c for n, c in out.items() if n not in doubtful}


def _ocr_answer_grid_once(page, psm):
    """罫線のある正答表（スキャンした紙）を、数字だけに絞って読み、位置で問番号と正答を対応づける。

    「問n」の見出しの真下（同じ列）にある1〜4の数字を、その問の正答とする。1つの見出しに2つの数字が
    対応したときは、その問は確かめられないものとして外す。
    """
    import fitz

    lines = ocr.page_ocr(page)
    top = next((ln[1] for ln in lines if "正解番号" in ln[2]), page.rect.y0)
    bottom = next((ln[0] for ln in lines if ln[0] > top and ("合否" in ln[2] or ln[2].startswith("※"))), page.rect.y1)
    clip = fitz.Rect(page.rect.x0, top, page.rect.x1, bottom)
    if clip.height < 20:
        return {}
    words = ocr.read_region(page, clip, psm=psm, whitelist="0123456789問")
    labels, used = [], set()
    for k, w in enumerate(words):
        m = re.fullmatch(r"問([0-9]{1,2})", w[4])
        if m:
            labels.append((int(m.group(1)), (w[0] + w[2]) / 2, (w[1] + w[3]) / 2, w[2] - w[0]))
            used.add(k)
        elif w[4] == "問" and k + 1 < len(words) and re.fullmatch(r"[0-9]{1,2}", words[k + 1][4]) and words[k + 1][0] - w[2] < 12:
            # 「問」と番号が別の語に分かれて読まれたとき
            nx = words[k + 1]
            labels.append((int(nx[4]), (w[0] + nx[2]) / 2, (w[1] + nx[3]) / 2, nx[2] - w[0]))
            used.update({k, k + 1})
    words = [w for k, w in enumerate(words) if k not in used]
    if len(labels) < 10:
        return {}
    width = sorted(lb[3] for lb in labels)[len(labels) // 2]
    found = {}
    for w in words:
        if not re.fullmatch(r"[1-4]", w[4]):
            continue
        cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        above = [lb for lb in labels if lb[2] < cy and abs(lb[1] - cx) <= width]
        if not above:
            continue
        row_y = max(lb[2] for lb in above)
        lb = min((lb for lb in above if abs(lb[2] - row_y) < 5), key=lambda lb: abs(lb[1] - cx))
        found.setdefault(lb[0], []).append(int(w[4]))
    return {n: v[0] for n, v in found.items() if len(v) == 1}


# 正答表の読み落としを補うときに、読み直す方式（Tesseract のページの区切り方）
_ANSWER_RETRY_PSM = ("4", "11")


def parse_answers(doc):
    """正答表を読む。「問 a … 問 b」の見出しと同数の正答番号が並ぶ行だけを採用する。

    OCRで読む正答表（スキャンした紙）は、読み落としがあれば区切り方を変えて読み直し、足りない問だけを補う。
    読み方によって正答が食い違った問は、正答が確かめられないものとして外す（出題しない）。
    """
    answers, doubtful = {}, set()
    for i in range(doc.page_count):
        page = doc[i]
        if not ocr.needs_ocr(page):
            for n, c in _answer_rows(page.get_text(sort=True)):
                if n in answers and answers[n] != c:
                    raise ParseError("ANSWER_TABLE_CONFLICT", question=n)
                answers[n] = c
            continue
        reads = [_page_text(page)]
        if len(dict(_answer_rows(reads[0]))) and len(answers) + len(dict(_answer_rows(reads[0]))) < QUESTION_COUNT:
            reads += ["\n".join(ln[2] for ln in ocr.page_ocr(page, psm)) for psm in _ANSWER_RETRY_PSM]
        elif "正解" in reads[0] and not dict(_answer_rows(reads[0])):
            reads += ["\n".join(ln[2] for ln in ocr.page_ocr(page, psm)) for psm in _ANSWER_RETRY_PSM]
        if "正解" in reads[0] and len(answers) + len(dict(_answer_rows(reads[0]))) < QUESTION_COUNT:
            grid = _ocr_answer_grid(page)
            reads.append(" ".join(f"問{n}" for n in grid) + " " + " ".join(str(c) for c in grid.values()) if grid else "")
            for n, c in grid.items():
                if n in answers and answers[n] != c:
                    doubtful.add(n)
                answers.setdefault(n, c)
        for text in reads:
            for n, c in _answer_rows(text):
                if n in answers and answers[n] != c:
                    doubtful.add(n)
                answers.setdefault(n, c)
    for n in doubtful:
        answers.pop(n, None)
    specials = set()
    for i in range(doc.page_count):
        specials |= special_answers(_page_text(doc[i]))
    for n in specials:
        answers[n] = ANSWER_SPECIAL
    if not answers:
        answers = _grid_answers(doc)
    if not answers:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def classify(question):
    """分野（fieldId）を内容から規則で分類する（qlp_parser/fields.py。分野の表は案・承認待ち）。"""
    return fields.classify_takken(question)
