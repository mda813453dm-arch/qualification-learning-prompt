"""資格非依存の択一PDF解析：検証できない入力は出題しない。"""
from types import SimpleNamespace
import pytest
from qlp_parser.adapters import generic_mc
from qlp_parser.core import ParseError

class Page:
    rect = SimpleNamespace(x0=0, y0=0, x1=600, y1=800)
    def __init__(self, blocks=None, text=""):
        self.blocks = blocks or []
        self.text = text
    def get_text(self, mode="text", sort=False):
        return self.blocks if mode == "blocks" else self.text

def block(text, y):
    return (30, y, 520, y + 19, text, 0, 0)

def test_simple_official_text_produces_image_packet():
    doc = [Page([
        block("問1  正しいものを選べ", 60),
        block("1. A", 95), block("2. B", 130), block("3. C", 165),
        block("問2  正しいものを選べ", 220),
        block("1. A", 250), block("2. B", 280),
    ])]
    out = generic_mc.parse_questions(doc)
    assert [q.number for q in out] == [1, 2]
    assert [len(q.choices) for q in out] == [3, 2]
    assert all(q.stem_mode == "official_image" and q.choice_mode == "official_image" for q in out)
    assert all(q.crops for q in out)

def test_incomplete_choices_not_guessed():
    doc = [Page([block("問1", 50), block("1. A", 80), block("3. C", 110)])]
    assert generic_mc.parse_questions(doc) == []

def test_explicit_answer_and_conflict():
    assert generic_mc.parse_answers([Page(text="問1 3\n問2 2")]) == {1:3,2:2}
    with pytest.raises(ParseError, match="GENERIC_ANSWER_CONFLICT"):
        generic_mc.parse_answers([Page(text="問1 3\n問1 2")])

def test_missing_answer_and_heading_rejected():
    with pytest.raises(ParseError, match="GENERIC_OFFICIAL_ANSWER_NOT_MACHINE_VERIFIABLE"):
        generic_mc.parse_answers([Page(text="正答欄なし")])
    with pytest.raises(ParseError, match="GENERIC_QUESTION_HEADINGS_NOT_FOUND"):
        generic_mc.parse_questions([Page([block("問題なし", 40)])])
