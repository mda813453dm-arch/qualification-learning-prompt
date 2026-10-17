"""行政書士アダプタ。

形式（令和7年度の公式PDF・正解ページで確認済みの形を土台にしている）:
- 問題見出し「問題n」、5肢択一式（行頭の「1 」〜「5 」）
- 区分の見出し「［問題1 〜問題40は択一式（5 肢択一式）］」「［問題41〜問題43は択一式（多肢選択式）］」など。
  出題するのは5肢択一式の区分の問題だけ（多肢選択式・記述式は1つの正答番号で採点できない）
- 1ページ目は注意事項（「問題1」「問題2」という例が書かれている）なので、最初の区分の見出しより前は読まない
- 著作権の都合で公開されない問題（問題1・58〜60など）は、PDFにないので出題しない
- 正答はPDFではなく、試験研究センターの正解ページ（HTML）の表「問題 n｜正解」から読む
"""

import html
import re
import unicodedata

from .. import fields
from ..core import ANSWER_SPECIAL, ParseError, RawQuestion, clean_text, is_page_number_line, mark_out_of_order, to_int
from .takken import _graphics_in, _lines, _template_drawings

QUALIFICATION_ID = "q090"
SECTION = "年度共通"
CHOICE_COUNT = 5
QUESTION_COUNT = 60

HEADING = re.compile(r"^問題\s*([0-9０-９]{1,2})(?![0-9０-９])")
CHOICE = re.compile(r"^([1-5１-５])[ 　]+")
# 語句の組合せを表で選ぶ問題（「1会期特別臨時…」）。番号の後に空白がなく、表の列の区切りが文字から読めない
TABLE_ROW = re.compile(r"^([1-5１-５])(?=\S)")
TABLE_HEAD = re.compile(r"^[ア-オ\s　]+$")
BANNER = re.compile(r"［\s*問題\s*[0-9０-９]")
NOTE = re.compile(r"^[（(]注[）)]")
REIWA = re.compile(r"令和\s*(元|[0-9]{1,2})\s*年度")


def _banner_kind(text):
    t = re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))
    if "5肢択一式" in t:
        return "single"
    return "other"


def parse_questions(doc):
    """5肢択一式の区分にある問題を取り出す。"""
    items = []  # (page_index, y0, y1, text, x0)
    kind = None  # 最初の区分の見出しが出るまでは注意事項のページ
    for i in range(doc.page_count):
        for y0, y1, t, x0 in _lines(doc[i]):
            if BANNER.search(t):
                kind = _banner_kind(t)
                items.append((i, y0, y1, None, x0))  # 区分の切れ目（前の問題の終わり）
                continue
            if kind != "single" or is_page_number_line(t):
                continue
            items.append((i, y0, y1, t, x0))

    template = _template_drawings(doc)
    starts = [k for k, it in enumerate(items) if it[3] and HEADING.match(it[3])]
    questions = []
    for idx, k in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(items)
        stop = next((j for j in range(k + 1, end) if items[j][3] is None), end)
        head = items[k]
        number = to_int(HEADING.match(head[3]).group(1))
        body = [head[:3] + (HEADING.sub("", head[3]).strip(), head[4])] + items[k + 1:stop]
        body = [b for b in body if b[3]]
        notes = []
        # 選択肢の後の注記（「（注）＊ 裁判員の参加する…」）は、問題文の終わりに付ける
        footnotes = [b for b in body if NOTE.match(b[3])]
        body = [b for b in body if not NOTE.match(b[3])]
        starts_at = _choice_starts(body)
        choice_mode = "text"
        if not starts_at:
            table = _choice_starts(body, pattern=TABLE_ROW)
            if table:
                # 表の選択肢は公式PDFの画像で見せ、選択肢は番号だけを持つ（列の区切りを推測で補わない）
                choice_mode = "official_image"
                notes.append("choice_table")
                head = table[0]
                while head > 0 and TABLE_HEAD.match(body[head - 1][3]):
                    head -= 1
                stem_lines = [b[3] for b in body[:head]]
            else:
                notes.append("choices_not_found")
        if choice_mode == "text":
            stem_lines = [b[3] for j, b in enumerate(body) if j < (starts_at[0] if starts_at else len(body))]
        choices = [] if choice_mode == "text" else [str(n) for n in range(1, CHOICE_COUNT + 1)]
        for c, j in enumerate(starts_at):
            last = starts_at[c + 1] if c + 1 < len(starts_at) else len(body)
            if c + 1 == len(starts_at):
                n = j + 1
                while n < last and body[n][4] >= body[j][4] + 4:
                    n += 1
                if n < last:
                    notes.append("trailing_text_dropped")
                last = n
            choices.append([CHOICE.sub("", body[j][3], count=1)] + [b[3] for b in body[j + 1:last]])
        stem = clean_text("\n".join(stem_lines))
        if footnotes:
            stem += "\n" + "\n".join(clean_text(f[3]) for f in footnotes)

        region = body + footnotes
        pages = sorted({b[0] + 1 for b in region})
        has_graphics, crops = False, []
        for p in pages:
            on_page = [b for b in region if b[0] + 1 == p]
            y0, y1 = min(b[1] for b in on_page), max(b[2] for b in on_page)
            if _graphics_in(doc[p - 1], y0, y1, template):
                has_graphics = True
        if has_graphics or choice_mode == "official_image":
            # 表・図のある問題は、問題の範囲を公式PDFからそのまま切り出して見せる
            for p in pages:
                on_page = [b for b in region if b[0] + 1 == p]
                pr = doc[p - 1].rect
                crops.append((p, (pr.x0 + 20, min(b[1] for b in on_page) - 6, pr.x1 - 20, max(b[2] for b in on_page) + 6)))
        first = [b for b in region if b[0] + 1 == pages[0]]
        questions.append(RawQuestion(
            number=number,
            stem=stem,
            choices=[clean_text("\n".join(c)) if isinstance(c, list) else c for c in choices],
            pages=pages,
            rect=(round(min(b[1] for b in first), 1), round(max(b[2] for b in first), 1)),
            has_graphics=has_graphics,
            notes=notes,
            choice_mode=choice_mode,
            crops=crops,
        ))
    return mark_out_of_order(questions)


def _choice_starts(body, tol=3, pattern=CHOICE):
    """選択肢「1」〜「5」の行。5つが同じ字下げで順に並ぶ「1」のうち最後のものを採る（本文中の「1 項」などと取り違えないため）。"""
    marks = [(j, to_int(pattern.match(b[3]).group(1)), b[4]) for j, b in enumerate(body) if pattern.match(b[3])]
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
    return valid[-1] if valid else []


def _cells(page):
    """正解ページの表のセルを、上から順に文字だけにして返す。"""
    out = []
    for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", page, re.S | re.I):
        t = html.unescape(re.sub(r"<[^>]+>", "", c))
        out.append(re.sub(r"\s+", "", unicodedata.normalize("NFKC", t)))
    return out


def check_year_html(page, year):
    """正解ページの見出し（「令和7年度 行政書士試験問題の正解」）の年度が、指定の年度と一致するか確かめる。"""
    m = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
    m = REIWA.search(unicodedata.normalize("NFKC", html.unescape(m.group(1)))) if m else None
    if not m:
        raise ParseError("ANSWER_YEAR_NOT_FOUND")
    stated = 2019 if m.group(1) == "元" else 2018 + int(m.group(1))
    if stated != year:
        raise ParseError("ANSWER_YEAR_MISMATCH", stated=stated, requested=year)


def parse_answers_html(page):
    """「問題n」のセルの次のセルが正解。1〜5の数字だけを正答とする。

    「全員正解」などは1つの正答で採点できないので出題しない。多肢選択式（ア〜エ）・記述式は読まない。
    """
    cells = _cells(page)
    answers = {}
    for k, c in enumerate(cells[:-1]):
        m = re.fullmatch(r"問題([0-9]{1,2})", c)
        if not m:
            continue
        n, v = int(m.group(1)), cells[k + 1]
        if n in answers:
            continue  # 記述式の正解例の表にも「問題44」が出てくる
        if re.fullmatch(r"[1-5]", v):
            answers[n] = int(v)
        elif "全員正解" in v or "いずれも" in v or "又は" in v:
            answers[n] = ANSWER_SPECIAL
    if len([v for v in answers.values() if v != ANSWER_SPECIAL]) < 10:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def parse_answers(doc):
    raise ParseError("ANSWER_PAGE_REQUIRED")


def classify(question):
    """分野は試験の区分の問番号の範囲で決める（qlp_parser/fields.py）。"""
    return fields.classify_gyosei(question)
