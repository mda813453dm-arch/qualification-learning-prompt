"""FP技能検定3級 学科試験（日本FP協会）。問1〜30は正誤式（〇＝1、×＝2）、問31〜60は三答択一式。読み取りは fp_common.py。"""

from .. import fields
from .fp_common import parse_answers, parse_questions  # noqa: F401

QUALIFICATION_ID = "q003"
SECTION = "学科"
# 問によって選択肢の数が違う（正誤式は2つ、三答択一式は3つ）
CHOICE_COUNT = None
QUESTION_COUNT = 60


def classify(question):
    return fields.classify_fp(question, 5)
