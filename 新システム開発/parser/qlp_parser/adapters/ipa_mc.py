"""IPAの四肢択一式問題・公式解答例の共通解析。

科目Bの擬似言語や表・図を含む問題も、公式PDFの問題範囲を画像で残す。
記述式の午後問題はこのアダプタでは扱わない。
"""

import re
import unicodedata

from ..core import ParseError, RawQuestion, clean_text, to_int
from . import itpass

MARKS = "アイウエオカキクケコ"
ANSWER = {mark: i + 1 for i, mark in enumerate(MARKS)}
ANSWER_ROW = re.compile(r"問\s*([0-9]{1,3})\s*([アイウエオカキクケコ])")
QUESTION = re.compile(r"^問\s*([0-9０-９]{1,3})(?![0-9０-９])")
LABEL = re.compile(r"(?<!\S)([アイウエオカキクケコ])(?=\s|$)")


def parse_questions(doc):
    questions = itpass.parse_questions(doc)
    # 午後の記述式・長文設問を四択として誤って採点しない。
    if not questions:
        raise ParseError("IPA_MULTIPLE_CHOICE_QUESTIONS_NOT_FOUND")
    return questions


def parse_fe_b_questions(doc):
    """科目Bは正答肢が最大10個。解答群を公式画像で完全表示する。

    1問に複数の画像ページがあっても、次の問の見出し直前までを維持する。
    """
    lines = []
    for pi, page in enumerate(doc):
        for ln in itpass._lines(page):
            lines.append((pi, *ln))
    starts = [i for i, row in enumerate(lines) if QUESTION.match(row[3])]
    if not starts:
        raise ParseError("IPA_FE_B_QUESTION_HEADING_NOT_FOUND")
    questions = []
    for j, start in enumerate(starts):
        body = lines[start:starts[j + 1] if j + 1 < len(starts) else len(lines)]
        number = to_int(QUESTION.match(body[0][3]).group(1))
        options = []
        seen_group = False
        for row in body:
            text = unicodedata.normalize("NFKC", row[3])
            if "解答群" in text:
                seen_group = True
            if seen_group:
                options.extend(LABEL.findall(text))
        found = sorted({ANSWER[m] for m in options})
        if not found or found != list(range(1, found[-1] + 1)):
            # 中途半端な解答群は画像があっても誤った選択肢数になるので採用しない。
            continue
        count = found[-1]
        pages = sorted(set(row[0] + 1 for row in body))
        crops = []
        for p in pages:
            rows = [row for row in body if row[0] + 1 == p]
            page = doc[p - 1]
            y0 = min(row[1] for row in rows) - 8
            y1 = max(row[2] for row in rows) + 8
            crops.append((p, (page.rect.x0 + 18, max(page.rect.y0, y0),
                              page.rect.x1 - 18, min(page.rect.y1, y1))))
        stem_lines = []
        for row in body:
            if "解答群" in row[3]:
                break
            stem_lines.append(row[3])
        questions.append(RawQuestion(
            number=number, stem=clean_text("\n".join(stem_lines)),
            choices=list(MARKS[:count]), pages=pages,
            has_graphics=True, stem_mode="official_image", choice_mode="official_image",
            notes=["ipa_fe_b_full_official_question_crop"], crops=crops,
            preserve_aspect=True,
        ))
    return questions


def parse_answers(doc):
    answers = {}
    for page in doc:
        # 公式の表の行単位で認識する。文字の読み取り不可や同一問の矛盾は失敗させる。
        for line in page.get_text("text", sort=True).splitlines():
            normalized = unicodedata.normalize("NFKC", line)
            for number, mark in ANSWER_ROW.findall(normalized):
                n, correct = int(number), ANSWER[mark]
                if n in answers and answers[n] != correct:
                    raise ParseError("IPA_OFFICIAL_ANSWER_CONFLICT", question=n)
                answers[n] = correct
    if not answers:
        # 正答PDFがテキストで読めない場合、推測せず取り込みを停止する。
        raise ParseError("IPA_OFFICIAL_ANSWER_TABLE_UNREADABLE")
    return answers
