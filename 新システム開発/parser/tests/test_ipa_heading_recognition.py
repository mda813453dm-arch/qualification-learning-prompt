"""IPA見出しのOCR揺れと誤認識の回帰テスト。"""
from qlp_parser.adapters import itpass, ipa_mc


def test_ocr_confused_question_heading():
    for regex in (itpass.HEADING, ipa_mc.QUESTION):
        for label in ("問1", "問 12", "間12", "間 １２", "問100"):
            assert regex.match(label), label
        for non_heading in ("問題 12", "間違い 12", "問1234", "間12年", "問12に関する"):
            assert not regex.match(non_heading), non_heading
