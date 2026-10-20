"""中小企業診断士 第1次試験アダプタ。

形式（令和8・7・6年度、令和元年度の公式PDFで確認した形を土台にしている。parser/tools/shindan_probe.py）:
- 1科目1冊。表紙（1ページ目）に「令和8 年度 第1 次試験問題」と科目名（「財務・会計」など、大きい字）
- 問題見出しは行だけの「第n問」（古い年度は「第1 問」）。選択肢は行頭の「ア　」〜「エ　」または「オ　」
  （「〔解答群〕」の後に並ぶ形もある。その場合は続きの行も同じ字下げで「　　ｄ：…」と始まる）
- 「（設問1）」「（設問2）」に分かれる問は、1つの正答で採点できないので出題しない
- 正解は科目ごとの別PDF（1ページの表「問題｜設問｜正解｜配点」）。2段組みの年度・科目があるので、
  見出し「問題」の位置で段を分けて読む
"""

import re
import unicodedata

from .. import fields
from ..core import ANSWER_SPECIAL, ParseError, RawQuestion, clean_text, is_page_number_line, to_int
from .takken import _graphics_in, _lines, _template_drawings

QUALIFICATION_ID = "q021"
SECTION = "main"
CHOICE_COUNT = None  # 4択の問と5択の問が混ざる

HEADING = re.compile(r"^第\s*([0-9０-９]{1,2})\s*問\s*$")
CHOICE = re.compile(r"^([ア-オ])[ 　]+")
KANA = "アイウエオ"
SUBQUESTION = re.compile(r"^[（(]\s*設問\s*[0-9０-９]")
ERA_YEAR = re.compile(r"(令和|平成)\s*(元|[0-9]{1,2})\s*年度")

# 科目（試験の区分）。表紙・正解PDFの科目名の書き方は年度で少し違うので、見分けの語で決める（上ほど優先）
SUBJECTS = [
    ("中小企業経営", "中小企業経営・中小企業政策"),
    ("経済学", "経済学・経済政策"),
    ("財務", "財務・会計"),
    ("企業経営理論", "企業経営理論"),
    ("運営管理", "運営管理（オペレーション・マネジメント）"),
    ("経営法務", "経営法務"),
    ("経営情報", "経営情報システム"),
]


def _norm(s):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s))


def subject_of(text):
    """文字列に含まれる科目名（正式な名前）。見つからなければ None。"""
    t = _norm(text)
    return next((name for key, name in SUBJECTS if key in t), None)


def _stated_year(text):
    m = ERA_YEAR.search(_norm(text))
    if not m:
        return None
    n = 1 if m.group(2) == "元" else int(m.group(2))
    return (2018 if m.group(1) == "令和" else 1988) + n


def cover_subject(doc):
    """表紙の大きい字（本文の倍以上）から科目名を読む。注意事項の文中の語と取り違えないため。"""
    d = doc[0].get_text("dict")
    big = " ".join(sp["text"] for b in d["blocks"] for ln in b.get("lines", []) for sp in ln["spans"] if sp["size"] >= 18)
    return subject_of(big)


def check_question(qdoc, adoc, year, section):
    """問題PDFの表紙の年度・科目と、正解PDFの見出しの年度・科目がそろっているか確かめる。"""
    qhead = qdoc[0].get_text()
    stated = _stated_year(qhead)
    if stated != year:
        raise ParseError("QUESTION_YEAR_MISMATCH", stated=stated, requested=year)
    qs = cover_subject(qdoc)
    if not qs:
        raise ParseError("SUBJECT_NOT_FOUND")
    as_ = subject_of(_answer_title(adoc))
    if as_ != qs:
        raise ParseError("SUBJECT_MISMATCH", question=qs, answer=as_)
    want = subject_of(section or "")
    if want and want != qs:
        raise ParseError("SUBJECT_MISMATCH", question=qs, requested=section)


def _answer_title(doc):
    """正解PDFの表より上の見出し（「令和８年度 中小企業診断士 第１次試験」「Ｃ 企業経営理論」）。"""
    page = doc[0]
    words = page.get_text("words")
    top = min((w[1] for w in words if _norm(w[4]) == "問題"), default=page.rect.y1)
    return " ".join(w[4] for w in words if w[1] < top - 2)


def check_year(doc, year):
    stated = _stated_year(_answer_title(doc))
    if stated is None:
        raise ParseError("ANSWER_YEAR_NOT_FOUND")
    if stated != year:
        raise ParseError("ANSWER_YEAR_MISMATCH", stated=stated, requested=year)


def parse_questions(doc):
    subject = cover_subject(doc)
    items = []  # (page_index, y0, y1, text, x0)
    for i in range(1, doc.page_count):  # 1ページ目は表紙
        for y0, y1, t, x0 in _lines(doc[i]):
            if not is_page_number_line(t):
                items.append((i, y0, y1, t, x0))

    template = _template_drawings(doc)
    starts = [k for k, it in enumerate(items) if HEADING.match(it[3])]
    questions = []
    for idx, k in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(items)
        number = to_int(HEADING.match(items[k][3]).group(1))
        body = items[k + 1:end]
        notes = [f"subject:{subject}"] if subject else []
        if not body:
            continue
        starts_at = _choice_starts(body)
        if any(SUBQUESTION.match(b[3]) for b in body):
            notes.append("subquestions")
            starts_at = []
        elif not starts_at:
            notes.append("choices_not_found")
        stem_end = starts_at[0] if starts_at else len(body)
        stem_lines = [b[3] for b in body[:stem_end] if not re.fullmatch(r"[〔［\[]\s*解答群\s*[〕］\]]", b[3].strip())]
        choices = []
        for c, j in enumerate(starts_at):
            last = starts_at[c + 1] if c + 1 < len(starts_at) else len(body)
            if c + 1 == len(starts_at):
                # 最後の選択肢の続きは、選択肢の記号より左に出ない行だけ（解答群の「　　ｄ：歩留り」は記号と同じ位置から始まる）
                n = j + 1
                while n < last and body[n][4] >= body[j][4] - 1:
                    n += 1
                if n < last:
                    notes.append("trailing_text_dropped")
                last = n
            choices.append(clean_text("\n".join([CHOICE.sub("", body[j][3], count=1)] + [b[3] for b in body[j + 1:last]])))

        pages = sorted({b[0] + 1 for b in body})
        has_graphics, crops = False, []
        for p in pages:
            on_page = [b for b in body if b[0] + 1 == p]
            if _graphics_in(doc[p - 1], min(b[1] for b in on_page), max(b[2] for b in on_page), template):
                has_graphics = True
        if has_graphics:
            # 表・図・空欄の枠のある問題は、問題の範囲を公式PDFからそのまま切り出して見せる
            for p in pages:
                on_page = [b for b in body if b[0] + 1 == p]
                pr = doc[p - 1].rect
                crops.append((p, (pr.x0 + 20, min(b[1] for b in on_page) - 6, pr.x1 - 20, max(b[2] for b in on_page) + 6)))
        first = [b for b in body if b[0] + 1 == pages[0]]
        questions.append(RawQuestion(
            number=number,
            stem=clean_text("\n".join(stem_lines)),
            choices=choices,
            pages=pages,
            rect=(round(min(b[1] for b in first), 1), round(max(b[2] for b in first), 1)),
            has_graphics=has_graphics,
            notes=notes,
            crops=crops,
        ))
    return questions


def _choice_starts(body, tol=3):
    """選択肢「ア」から同じ字下げで順に続く行（3つ以上）。問題の末尾にあるので、最後の「ア」からの並びを採る。"""
    marks = [(j, KANA.index(CHOICE.match(b[3]).group(1)), b[4]) for j, b in enumerate(body) if CHOICE.match(b[3])]
    valid = []
    for a, (j1, n1, x1) in enumerate(marks):
        if n1 != 0:
            continue
        seq = [j1]
        for j, n, x in marks[a + 1:]:
            if abs(x - x1) > tol:
                continue
            if n != len(seq):
                break
            seq.append(j)
        if len(seq) >= 3:
            valid.append(seq)
    return valid[-1] if valid else []


def parse_answers(doc):
    """正解の表を読む。{問番号: 正答番号（ア=1）}。

    - 「設問1」「設問2」に分かれる問は入れない（問題側でも出題しない）
    - 正解が1つのカナでない問（「ア・イ」「全員正解」など）は ANSWER_SPECIAL
    """
    page = doc[0]
    words = [(w[0], (w[1] + w[3]) / 2, _norm(w[4])) for w in page.get_text("words") if w[4].strip()]
    cols = sorted(x for x, _, t in words if t == "問題")
    if not cols:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    answers = {}
    for x, y, t in words:
        m = re.fullmatch(r"第([0-9]{1,2})問", t)
        if not m:
            continue
        left = max((c for c in cols if c <= x + 15), default=cols[0])
        right = min((c for c in cols if c > left + 15), default=page.rect.x1 + 1)
        row = sorted((wx, wt) for wx, wy, wt in words if abs(wy - y) <= 3 and x < wx < right - 15)
        cells = [wt for _, wt in row]
        if len(cells) < 2:
            continue
        n = int(m.group(1))
        if cells[0] != "-" and "設問" in cells[0]:
            continue
        v = cells[1] if cells[0] in ("-", "－", "ー", "―") else cells[0]
        answers[n] = KANA.index(v) + 1 if len(v) == 1 and v in KANA else ANSWER_SPECIAL
    if len([v for v in answers.values() if v != ANSWER_SPECIAL]) < 10:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def classify(question):
    """分野は科目（表紙の科目名）。"""
    return fields.classify_shindan(question)
