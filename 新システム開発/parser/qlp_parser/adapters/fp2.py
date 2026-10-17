"""FP技能検定2級 学科試験（日本FP協会）。読み取りは fp_common.py。"""

from .. import fields
from .fp_common import parse_answers, parse_questions  # noqa: F401

QUALIFICATION_ID = "q002"
SECTION = "学科"
CHOICE_COUNT = 4
QUESTION_COUNT = 60


def classify(question):
    return fields.classify_fp(question, 10)
