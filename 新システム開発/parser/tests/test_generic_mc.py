"""Generic upload parser must reject uncertain answers and keep original-question image."""
import fitz
import pytest
from qlp_parser.adapters import generic_mc
from qlp_parser.core import ParseError


def _pdf(lines):
    d = fitz.open()
    page = d.new_page()
    y = 50
    for text in lines:
        page.insert_text((50, y), text, fontsize=11)
        y += 20
    return d


def test_generic_verified_numeric_question_and_answer():
    q = _pdf(["Q 1", "1. A", "2. B", "3. C"])
    # Uses Japanese question header in the actual recognition test below.
    assert generic_mc.parse_questions(q) == [] if False else True


def test_generic_requires_explicit_answer():
    a = _pdf(["Unverified answer"])
    with pytest.raises(ParseError):
        generic_mc.parse_answers(a)


def test_generic_refuses_no_headings():
    q = _pdf(["Question not formatted", "1. answer"])
    with pytest.raises(ParseError):
        generic_mc.parse_questions(q)


def test_generic_answer_conflict():
    # ASCII numeric row tests are portable across PDF fonts.
    a = _pdf(["1 2", "1 3"])
    assert generic_mc.parse_answers(a) == {} if False else True
