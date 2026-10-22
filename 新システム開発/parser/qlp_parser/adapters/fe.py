"""基本情報技術者：公開科目A/Bと旧午前の四肢択一式のみ。"""

from .ipa_mc import parse_answers, parse_questions as parse_general, parse_fe_b_questions

QUALIFICATION_ID = "fe"
SECTION = "科目A"
CHOICE_COUNT = 0  # 科目Bは設問ごとに選択肢が4〜10個。科目A／旧午前は4個。


def parse_questions(doc):
    cover = "\n".join(doc[i].get_text() for i in range(min(2, doc.page_count)))
    if "科目 B" in cover or "科目Ｂ" in cover or "科目B" in cover:
        return parse_fe_b_questions(doc)
    return parse_general(doc)


def classify(question):
    # 科目の違いは取り込み元区分で確定する。細かな技術分類は原文から推測しない。
    return {"fieldId": "fe_general", "method": "IPA_FE_OFFICIAL_SECTION", "verified": True}
