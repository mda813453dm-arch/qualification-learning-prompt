"""基本情報技術者：公開科目A/Bと旧午前の四肢択一式のみ。"""

from .ipa_mc import parse_answers, parse_questions

QUALIFICATION_ID = "fe"
SECTION = "科目A"
CHOICE_COUNT = 4


def classify(question):
    # 科目の違いは取り込み元区分で確定する。細かな技術分類は原文から推測しない。
    return {"fieldId": "fe_general", "method": "IPA_FE_OFFICIAL_SECTION", "verified": True}
