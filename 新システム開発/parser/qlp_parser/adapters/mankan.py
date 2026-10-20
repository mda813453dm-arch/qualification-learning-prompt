"""マンション管理士アダプタ。

形式（令和7年度の公式PDFで確認した形を土台にしている。運営者がアップした公式PDF）:
- 問題見出し「〔問 n〕」、4択（行頭の「1 」〜「4 」）。宅建と同じ形なので、問題の読み方は宅建アダプタを使う
- 1ページ目は表紙（「令和7 年度 マンション管理士試験 問題」）、2ページ目は法律の略称の一覧
- 正解は別PDF（1ページの表「問題｜正解｜問題｜正解」。見出し「令和７年度マンション管理士試験正解」）
- 問46〜50はマンション管理適正化法の問題（管理業務主任者試験の合格者は免除）
"""

import re
import unicodedata

from .. import fields
from ..core import ANSWER_SPECIAL, ParseError
from . import takken

QUALIFICATION_ID = "q018"
SECTION = "main"
CHOICE_COUNT = 4
QUESTION_COUNT = 50

ERA_YEAR = re.compile(r"(令和|平成)\s*(元|[0-9]{1,2})\s*年度")


def _norm(s):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s))


def _stated_year(text):
    m = ERA_YEAR.search(_norm(text))
    if not m:
        return None
    n = 1 if m.group(2) == "元" else int(m.group(2))
    return (2018 if m.group(1) == "令和" else 1988) + n


def parse_questions(doc):
    return takken.parse_questions(doc)


def check_year(doc, year):
    head = doc[0].get_text()
    if "マンション管理士" not in _norm(head):
        raise ParseError("ANSWER_TITLE_NOT_FOUND")
    stated = _stated_year(head)
    if stated is None:
        raise ParseError("ANSWER_YEAR_NOT_FOUND")
    if stated != year:
        raise ParseError("ANSWER_YEAR_MISMATCH", stated=stated, requested=year)


def check_question(qdoc, adoc, year, section):
    """問題PDFの表紙がマンション管理士試験で、年度が同じか確かめる（管理業務主任者試験の問題と取り違えないため）。"""
    head = _norm(qdoc[0].get_text())
    if "マンション管理士試験" not in head:
        raise ParseError("QUESTION_TITLE_NOT_FOUND")
    stated = _stated_year(head)
    if stated != year:
        raise ParseError("QUESTION_YEAR_MISMATCH", stated=stated, requested=year)


def parse_answers(doc):
    """正解の表を読む。見出し「問題」の列ごとに、同じ高さの「問番号 正解」の組を取る。

    正解が1〜4の数字1つでない問（「全員正解」「1又は3」など）は ANSWER_SPECIAL。
    """
    page = doc[0]
    words = [(w[0], (w[1] + w[3]) / 2, _norm(w[4])) for w in page.get_text("words") if w[4].strip()]
    heads = sorted(x for x, _, t in words if t == "問題")
    if not heads:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    top = min(y for x, y, t in words if t == "問題")
    answers = {}
    for k, left in enumerate(heads):
        right = heads[k + 1] if k + 1 < len(heads) else page.rect.x1 + 1
        col = [(x, y, t) for x, y, t in words if left - 15 <= x < right - 15 and y > top + 3]
        rows = {}
        for x, y, t in col:
            rows.setdefault(round(y / 4), []).append((x, t))
        for cells in rows.values():
            cells = [t for _, t in sorted(cells)]
            if len(cells) < 2 or not re.fullmatch(r"[0-9]{1,2}", cells[0]):
                continue
            n, v = int(cells[0]), "".join(cells[1:])
            answers[n] = int(v) if re.fullmatch(r"[1-4]", v) else ANSWER_SPECIAL
    if len([v for v in answers.values() if v != ANSWER_SPECIAL]) < 10:
        raise ParseError("ANSWER_TABLE_NOT_FOUND")
    return answers


def classify(question):
    return fields.classify_mankan(question)
