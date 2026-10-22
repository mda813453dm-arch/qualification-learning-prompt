"""IPAの四肢択一式問題・公式解答例の共通解析。

科目Bの擬似言語や表・図を含む問題も、公式PDFの問題範囲を画像で残す。
記述式の午後問題はこのアダプタでは扱わない。
"""

import re
import unicodedata

from ..core import ParseError
from . import itpass

ANSWER = {"ア": 1, "イ": 2, "ウ": 3, "エ": 4}
ANSWER_ROW = re.compile(r"問\s*([0-9]{1,3})\s*([アイウエ])")


def parse_questions(doc):
    questions = itpass.parse_questions(doc)
    # 午後の記述式・長文設問を四択として誤って採点しない。
    if not questions:
        raise ParseError("IPA_MULTIPLE_CHOICE_QUESTIONS_NOT_FOUND")
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
