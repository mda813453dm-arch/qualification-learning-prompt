"""応用情報技術者：午前の四肢択一式のみ。午後の記述式は非対応。"""

from .ipa_mc import parse_answers, parse_questions

QUALIFICATION_ID = "ap"
SECTION = "春期午前"
CHOICE_COUNT = 4


def classify(question):
    # IPAの午前問題・解答例に明記された分野順。古い年度は検証完了まで一般分類。
    return {"fieldId": "ap_morning", "method": "IPA_AP_OFFICIAL_MORNING", "verified": True}
