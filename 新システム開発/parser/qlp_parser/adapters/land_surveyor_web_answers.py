"""Archive website answer-table reader for 2007-2009 land surveyor exams.

The site is a *secondary* source, not a Ministry certification. The 2007/2008
20-answer table is the archived old "morning" which the study system labels
"afternoon" (22 questions incl. two written). The 10-answer table is the
archived old "afternoon" which the study system labels "morning".

Only a complete, unambiguous, year-scoped table that matches the independently
reviewed answer transcription is accepted. A withdrawn question is excluded.
"""
from html.parser import HTMLParser
import html
import re
import unicodedata

from ..core import ParseError, ANSWER_SPECIAL

ANSWER_INDEX = "https://izuki.net/chousashi-past-tests/"
ARCHIVE_WEB_YEARS = (2007, 2008, 2009)
EXPECTED = {
    2007: {
        "午前の部": [2, 2, 4, 2, 5, 5, 2, 1, 1, 1],
        "午後の部": [3, 4, 3, 2, 3, 2, 5, 5, 2, 3, 2, 2, 5, 2, 1, 4, 1, 1, 3, 3],
    },
    2008: {
        "午前の部": [5, 4, 2, 1, 2, 3, 4, 1, 5, 4],
        "午後の部": [3, 2, 2, 3, 4, 4, 5, 2, 5, 4, 1, 4, 1, 3, 2, 3, 5, 2, ANSWER_SPECIAL, 3],
    },
    2009: {
        "午前の部": [5, 1, 1, 4, 3, 2, 2, 1, 5, 2],
        "午後の部": [5, 2, 2, 4, 2, 1, 2, 4, 5, 1, 5, 5, 5, 1, 4, 2, 2, 2, 1, 1],
    },
}
_COUNTS = {"午前の部": 10, "午後の部": 20}
_HEADING = re.compile(r"平成(19|20|21)年度[:：]解答")
_QUESTION = re.compile(r"第(\d{1,2})問")


def norm(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", html.unescape(str(text))))


class _Tables(HTMLParser):
    """Read HTML heading-scoped <table> elements, never adjacent year tables."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.year = None
        self.heading = None
        self.hlevel = 0
        self.table_depth = 0
        self.rows = []
        self.row = None
        self.cell = None
        self.tables = {year: [] for year in ARCHIVE_WEB_YEARS}

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ("h2", "h3", "h4"):
            self.heading = []
            self.hlevel = int(tag[1])
        if tag == "table":
            self.table_depth += 1
            if self.table_depth == 1:
                self.rows = []
        elif tag == "tr" and self.table_depth == 1:
            self.row = []
        elif tag in ("th", "td") and self.table_depth == 1 and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.heading is not None:
            self.heading.append(data)
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("h2", "h3", "h4") and self.heading is not None:
            heading = norm("".join(self.heading))
            m = _HEADING.search(heading)
            if m:
                self.year = 1988 + int(m.group(1))
            elif tag == "h2":
                self.year = None
            self.heading = None
        elif tag in ("td", "th") and self.cell is not None:
            if self.row is not None:
                self.row.append(norm("".join(self.cell)))
            self.cell = None
        elif tag == "tr" and self.table_depth == 1:
            if self.row:
                self.rows.append(self.row)
            self.row = None
        elif tag == "table" and self.table_depth:
            self.table_depth -= 1
            if not self.table_depth:
                if self.year in self.tables and self.rows:
                    self.tables[self.year].append(self.rows)
                self.rows = []


def extract_year(page, year):
    if year not in ARCHIVE_WEB_YEARS:
        raise ParseError("ANSWER_YEAR_NOT_VALIDATED", year=year)
    if not isinstance(page, str) or len(page) < 500 or "土地家屋調査士" not in page:
        raise ParseError("ANSWER_HTML_INVALID")
    parser = _Tables()
    parser.feed(page)
    parser.close()
    chosen = {}
    for table in parser.tables.get(year, []):
        found = {}
        for row in table:
            # Table must have exactly two meaningful columns: question number and answer.
            if len(row) < 2:
                continue
            match = _QUESTION.fullmatch(row[0])
            if not match:
                continue
            number = int(match.group(1))
            value = row[1]
            if number in found:
                raise ParseError("ANSWER_ROW_DUPLICATED", year=year, number=number)
            if re.fullmatch(r"[1-5]", value):
                found[number] = int(value)
            elif value == "没問":
                found[number] = ANSWER_SPECIAL
            else:
                raise ParseError("ANSWER_VALUE_UNVERIFIED", year=year, number=number, value=value[:30])
        count = len(found)
        section = "午前の部" if count == 10 else "午後の部" if count == 20 else None
        if not section:
            if found:
                raise ParseError("ANSWER_TABLE_INCOMPLETE", year=year, found=count)
            continue
        if section in chosen:
            raise ParseError("ANSWER_TABLE_DUPLICATED", year=year, section=section)
        if sorted(found) != list(range(1, _COUNTS[section] + 1)):
            raise ParseError("ANSWER_ROWS_OUT_OF_ORDER_OR_MISSING", year=year, section=section)
        chosen[section] = [found[n] for n in range(1, count + 1)]
    if set(chosen) != set(_COUNTS):
        raise ParseError("ANSWER_SECTION_INCOMPLETE", year=year, found=list(chosen))
    expected = EXPECTED[year]
    if chosen != expected:
        raise ParseError("WEB_ANSWER_DIFFERS_FROM_AUDITED_SOURCE", year=year)
    # For the unique 2008 cancelled question, no numeric grading is allowed.
    if year == 2008 and chosen["午後の部"][18] != ANSWER_SPECIAL:
        raise ParseError("CANCELLED_QUESTION_LOST", year=year)
    return chosen


def check_year_html(page, year):
    extract_year(page, year)


def parse_answers_html(page, year, section):
    answers = extract_year(page, year)
    if section not in _COUNTS:
        raise ParseError("SECTION_NOT_SUPPORTED", section=section)
    return {n: value for n, value in enumerate(answers[section], start=1)}
