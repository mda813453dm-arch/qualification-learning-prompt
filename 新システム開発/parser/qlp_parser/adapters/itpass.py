"""ITパスポート試験（IPA）アダプタ。

形式（令和8年度の公開問題で確認）:
- 問題冊子は紙をスキャンした画像だけのPDF（ページ全体をOCRで読む）。見出し「問n」、4択「ア」〜「エ」。
  選択肢は1行に1つのほか、1行に2つ・4つ並ぶことがある（「ア 価値=… イ 価値=…」）。
- 冊子の後ろに、擬似言語の記述形式などの参考ページ（見出しの無いページ）が付く。問題には入れない。
- 正答は別PDFの「解答例」。問番号と正解（ア〜エ）が表になっている（文字を取り出せる）。
- 公開問題の問1〜35はストラテジ系、問36〜55はマネジメント系、問56〜100はテクノロジ系（出題順で分野が決まる）。
- OCRは読み違いがありうるので、問題の範囲を公式PDFの画像でも見せる（宅建・賃管のスキャン年度と同じ）。
"""

import re
import unicodedata

from .. import fields
from .. import ocr
from ..core import ParseError, RawQuestion, clean_text, is_page_number_line, mark_out_of_order, to_int

QUALIFICATION_ID = "q006"
SECTION = "公開問題"
CHOICE_COUNT = 4
QUESTION_COUNT = 100

HEADING = re.compile(r"^問\s*([0-9０-９]{1,3})(?![0-9０-９])\s*")
MARKS = "アイウエ"
# Vision は選択肢の記号「エ」を英字の「I」と読むことがある
MARK_ALIASES = {"I": "エ", "H": "エ", "工": "エ"}
# 分野の切れ目の案内「問1から問34までは、ストラテジ系の問題です。」（年度によって切れ目が違う）
BANNER = re.compile(r"問\s*([0-9]{1,3})\s*から\s*問\s*([0-9]{1,3})\s*までは.{0,3}?(ストラテジ|マネジメント|テクノロジ)系")
BANNER_FIELD = {"ストラテジ": "s", "マネジメント": "m", "テクノロジ": "t"}
PAGE_NO = re.compile(r"^[\s\-－‐ー—|]*[0-9０-９]{1,3}[\s\-－‐ー—|]*$")


def _text_lines(page):
    """文字を取り出せるページの行 [(y0, y1, 文字, x0, 語[(x0, y0, x1, y1, 文字)])]。"""
    words = sorted(page.get_text("words"), key=lambda w: (round(w[1]), w[0]))
    rows = []
    for w in words:
        box = (w[0], w[1], w[2], w[3], w[4])
        if rows and abs(w[1] - rows[-1][0][1]) <= 3:
            rows[-1].append(box)
        else:
            rows.append([box])
    out = []
    for ws in rows:
        ws.sort(key=lambda b: b[0])
        out.append((min(b[1] for b in ws), max(b[3] for b in ws), _join(ws), ws[0][0], ws))
    return out


def _lines(page):
    lines = ocr.page_ocr(page) if ocr.needs_ocr(page) else _text_lines(page)
    bottom = page.rect.y0 + page.rect.height * 0.92
    return [ln for ln in lines if ln[2].strip() and ln[0] < bottom and not PAGE_NO.match(ln[2]) and not is_page_number_line(ln[2])]


def _join(ws):
    """語をつなぐ。語の間が空いているところ（字の高さの3分の1より広い）にだけ空白を入れる。"""
    text = ""
    for k, w in enumerate(ws):
        if k and w[0] - ws[k - 1][2] > 0.35 * (w[3] - w[1]):
            text += " "
        text += w[4]
    return text


def _mark(ws, k):
    """k番目の語が選択肢の記号なら、その記号（ア〜エ）と、記号の後ろに続く字を返す。違えば None。"""
    t = ws[k][4]
    head = MARK_ALIASES.get(t[0], t[0]) if t else ""
    if head not in MARKS:
        return None
    h = ws[k][3] - ws[k][1]
    if k and ws[k][0] - ws[k - 1][2] <= 0.6 * h:
        return None  # 語の途中（「アナログ」の「ア」など）
    rest = t[1:]
    if rest and re.match(r"[\u30a0-\u30ffー]", rest):
        return None  # カタカナの語の頭（「アジャイル」「ウォーターフォール」）
    if rest and k + 1 < len(ws) and not rest[0].isspace():
        # 記号と本文が1語になっている（「イ生まれ」）。記号の後ろが空いていないものは、本文の語とみなす
        if t[0] in MARK_ALIASES:
            return None
    if t[0] in MARK_ALIASES and len(t) > 1:
        return None
    return head, rest


def _choices(body):
    """問の行から、選択肢「ア」〜「エ」の位置を決める。返り値は [(行, 語の位置, 記号の後ろの字)] 4つ、または None。

    選択肢は問の末尾にあるので、イ・ウ・エが順に続く「ア」のうち最後のものを採る（本文中の「ア」を取り違えないため）。
    """
    cands = []
    for i, ln in enumerate(body):
        ws = ln[5]
        for k in range(len(ws)):
            m = _mark(ws, k)
            if m:
                cands.append((i, k, m[0], m[1]))
    best = None
    for a, c in enumerate(cands):
        if c[2] != "ア":
            continue
        seq, want = [c], 1
        for d in cands[a + 1:]:
            if want < 4 and d[2] == MARKS[want]:
                seq.append(d)
                want += 1
        if len(seq) == 4:
            best = seq
    return [(i, k, rest) for i, k, _, rest in best] if best else None


def parse_questions(doc):
    ocr.prefetch([doc[i] for i in range(doc.page_count)])
    items = []  # (ページ番号0始まり, y0, y1, 文字, x0, 語)
    for i in range(doc.page_count):
        for y0, y1, t, x0, ws in _lines(doc[i]):
            items.append((i, y0, y1, t.strip(), x0, ws))
    ranges = []
    for it in items:
        m = BANNER.search(unicodedata.normalize("NFKC", it[3]))
        if m:
            ranges.append((int(m.group(1)), int(m.group(2)), BANNER_FIELD[m.group(3)]))
    items = [it for it in items if not BANNER.search(unicodedata.normalize("NFKC", it[3]))]
    starts = [k for k, it in enumerate(items) if HEADING.match(it[3])]
    ocr_pages = {i + 1 for i in range(doc.page_count) if ocr.needs_ocr(doc[i])}
    questions = []
    for idx, k in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(items)
        head = items[k]
        number = to_int(HEADING.match(head[3]).group(1))
        # 見出しの「問n」を除いた行から始める（語のリストからも「問」と番号を除く）
        hws = list(head[5])
        while hws and (hws[0][4].startswith("問") or hws[0][4].isdigit()):
            if hws[0][4].startswith("問") and len(hws[0][4]) > 1 and not hws[0][4][1:].isdigit():
                break
            hws = hws[1:]
        body = [head[:3] + (HEADING.sub("", head[3]).strip(), hws[0][0] if hws else head[4], hws)]
        for it in items[k + 1:end]:
            # 次のページに移るとき、選択肢がそろっていれば、その先（参考ページなど）は問に入れない
            if it[0] != body[-1][0] and _choices(body):
                break
            body.append(it)
        body = [b for b in body if b[3]]
        notes = []
        # 表・図の中の字（本文より大きく字下げされた行）は問題文に入れない（表・図は公式PDFの画像で見せる）
        indent = head[4]
        if any(b[4] > indent + 45 for b in body):
            notes.append("table_text_dropped")
        body = [b for b in body if b[4] <= indent + 45]
        marks = _choices(body)
        if marks:
            stem = [b[3] for b in body[:marks[0][0]]]
            choices = []
            for c, (i, kk, rest) in enumerate(marks):
                ni, nk = (marks[c + 1][0], marks[c + 1][1]) if c + 1 < len(marks) else (len(body), 0)
                part = []
                for j in range(i, min(ni, len(body) - 1) + 1):
                    ws = body[j][5]
                    lo = kk + 1 if j == i else 0
                    hi = nk if j == ni else len(ws)
                    if lo == 0 and hi == len(ws):
                        part.append(body[j][3])  # 行全体：読み取った行の文字をそのまま使う（空白の入れ方が正確）
                    elif j == i and kk == 0 and hi == len(ws):
                        part.append(re.sub(r"^\s*\S\s*", "", body[j][3], count=1) if not rest else rest + _join(ws[lo:hi]))
                    else:
                        seg = ws[lo:hi]
                        part.append((rest if j == i else "") + (_join(seg) if seg else ""))
                choices.append(clean_text("\n".join(part)))
        else:
            # 選択肢の記号を読み落とした（「イ」を「1」と読む、「エ」が抜けるなど）：選択肢は公式PDFの画像で見せ、
            # 選択肢の文は持たない（記号だけ）。問題文は、行頭の「ア」の行の手前まで
            first_a = next((i for i, b in enumerate(body) if b[5] and _mark(b[5], 0) and _mark(b[5], 0)[0] == "ア"), len(body))
            stem, choices = [b[3] for b in body[:first_a]], list(MARKS)
            notes.append("choice_text_outlined")
        choices = _fix_items(stem, choices)
        # OCRで選択肢の本文が空になったときも、原本の問題画像で
        # ア〜エを読む。空の選択肢を問題データとして登録しない。
        if len(choices) != CHOICE_COUNT or any(not choice.strip() for choice in choices):
            choices = list(MARKS)
            notes.append("choice_text_outlined")
        stem = _keep_items(stem)
        pages = sorted({b[0] + 1 for b in body}) or [head[0] + 1]
        crops = []
        for p in pages:
            on_page = [b for b in body if b[0] + 1 == p]
            pr = doc[p - 1].rect
            crops.append((p, (pr.x0 + 20, min(b[1] for b in on_page) - 6, pr.x1 - 20, max(b[2] for b in on_page) + 6)))
        read_by_ocr = any(p in ocr_pages for p in pages)
        mode = "ocr" if read_by_ocr else "text"
        choice_mode = "official_image" if "choice_text_outlined" in notes else mode
        if read_by_ocr:
            notes.append("read_by_ocr")
        field = next((f for lo, hi, f in ranges if lo <= number <= hi), None)
        if field:
            notes.append(f"field:{field}")
        first = [b for b in body if b[0] + 1 == pages[0]]
        questions.append(RawQuestion(
            number=number,
            stem="\n".join(stem),  # _keep_items で項目ごとに整えてある
            choices=choices,
            pages=pages,
            rect=(round(min(b[1] for b in first), 1), round(max(b[2] for b in first), 1)) if first else None,
            # 図・表があっても無くても、問題の範囲を公式PDFの画像で見せる（OCRの読み違い・図の有無を画像で伝える）
            has_graphics=True,
            notes=notes,
            stem_mode=mode,
            choice_mode=choice_mode,
            crops=crops,
        ))
    return mark_out_of_order(questions)


ITEM = re.compile(r"^[a-e][ 　]")


def _keep_items(stem):
    """本文の項目「a …」「b …」を、それぞれ行の頭から始める（折り返しは項目の中でつなぐ）。"""
    groups = []
    for ln in stem:
        if not groups or ITEM.match(ln):
            groups.append([ln])
        else:
            groups[-1].append(ln)
    return [clean_text("\n".join(g)) for g in groups]


def _fix_items(stem, choices):
    """本文に「a」「b」「c」の項目があるとき、選択肢の中の大文字「C」「B」（小文字の読み違い）を小文字にする。"""
    labels = {m for m in re.findall(r"(?m)^([a-e])[ 　]", "\n".join(stem))}
    if not labels:
        return choices
    out = []
    for c in choices:
        c = re.sub(r"(?<![A-Za-z])([A-E])(?![A-Za-z])", lambda m: m.group(1).lower() if m.group(1).lower() in labels else m.group(1), c)
        # 項目の組合せだけの選択肢（「a, b」）の末尾に付いた汚れの点を除く
        if re.fullmatch(r"[a-e](?:\s*[,，、]\s*[a-e])*\s*[.．]", c):
            c = re.sub(r"\s*[.．]$", "", c)
        out.append(c)
    return out


ANSWER_MARK = {"ア": 1, "イ": 2, "ウ": 3, "エ": 4}


def parse_answers(doc):
    """解答例の表を読む。「問n」の語の右にある、同じ高さの「ア」〜「エ」を、その問の正解とする。"""
    answers = {}
    for i in range(doc.page_count):
        page = doc[i]
        if ocr.needs_ocr(page):
            ws = [w for ln in ocr.page_ocr(page) for w in ln[4]]
        else:
            ws = [tuple(w[:5]) for w in page.get_text("words")]
        ws = [(w[0], w[1], w[2], w[3], unicodedata.normalize("NFKC", w[4]).strip()) for w in ws if w[4].strip()]
        # 「問」と番号が別の語になっていれば1語にする
        merged = []
        for w in sorted(ws, key=lambda w: (round((w[1] + w[3]) / 2), w[0])):
            if merged and merged[-1][4] == "問" and w[4].isdigit() and abs((w[1] + w[3]) - (merged[-1][1] + merged[-1][3])) < 6:
                p = merged.pop()
                w = (p[0], min(p[1], w[1]), w[2], max(p[3], w[3]), "問" + w[4])
            merged.append(w)
        heads = [w for w in merged if re.fullmatch(r"問[0-9]{1,3}", w[4])]
        marks = [w for w in merged if w[4] in ANSWER_MARK]
        for h in heads:
            cy = (h[1] + h[3]) / 2
            row = [m for m in marks if abs((m[1] + m[3]) / 2 - cy) <= 4 and 0 < m[0] - h[2] < 150]
            if not row:
                continue
            m = min(row, key=lambda m: m[0])
            n = int(h[4][1:])
            # 隣の列の問より、この問の方が近い記号だけを採る
            closer = [g for g in heads if g is not h and abs((g[1] + g[3]) / 2 - cy) <= 4 and g[2] < m[0] and g[2] > h[2]]
            if closer:
                continue
            if n in answers and answers[n] != ANSWER_MARK[m[4]]:
                raise ParseError("ANSWER_TABLE_CONFLICT", question=n)
            answers[n] = ANSWER_MARK[m[4]]
    if not answers:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def classify(question):
    return fields.classify_itpass(question)
