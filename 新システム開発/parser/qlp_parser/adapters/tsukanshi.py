"""第59回通関士試験の公式PDFから検証済み択一式のみを安全に出題する。

複数空欄・複数選択・計算式は単一番号で採点できないため自動出題しない。
2025年度の公式問題と正答のSHA-256を必ず照合する。
"""
import re
import unicodedata

from ..core import ANSWER_SPECIAL, ParseError, RawQuestion

QUALIFICATION_ID = 'q098'
SECTION = '通関業法'
CHOICE_COUNT = 5
BY_SECTION = True

VERIFIED = {
    2025: {
        '通関業法': '3bca0e67602bca9f9df1934010819879cc6296c5c4495e704dd6c8f34856a925',
        '関税法等': '9ad59c538312318c51dd34ab201ad5d2b3a13096a4b3fcda4fdc625ee1fc7067',
        '通関実務': 'ee682781e74678220163186307dd354fd3098bafe118465a64104ddbfb0a2a7c',
        'answer': '2e525a3f1584df4dc4135febb93b229a79df626149b4755a846448e9cc8590d1',
    },
}
SECTION_MARK = {'通関業法': '1', '関税法等': '2', '通関実務': '3'}
FIELD = {'通関業法': 'f04', '関税法等': 'f01', '通関実務': 'f05'}
START = {'通関業法': 11, '関税法等': 16, '通関実務': 13}
END = {'通関業法': 20, '関税法等': 30, '通関実務': 17}
_HEADING = re.compile(r'^\s*第\s*(\d{1,2})\s*問(?=\s|\W|$)')
_ANSWER_Q = re.compile(r'^第\s*(\d{1,2})\s*問$')
_ANSWER_ONE = re.compile(r'^択一式\s*1点\s*([0-5])$')


def norm(s):
    return unicodedata.normalize('NFKC', str(s or '')).replace('\u3000', ' ').strip()


def check_source_hashes(year, section, qsha, asha):
    expected = VERIFIED.get(year)
    if not expected or section not in SECTION_MARK:
        raise ParseError('TSUKANSHI_YEAR_OR_SECTION_UNVERIFIED')
    if qsha != expected[section] or asha != expected['answer']:
        raise ParseError('TSUKANSHI_SOURCE_HASH_MISMATCH')


def check_question(qdoc, adoc, year, section):
    if year != 2025 or not qdoc.page_count or not adoc.page_count:
        raise ParseError('TSUKANSHI_SOURCE_UNVERIFIED')
    cover = norm(qdoc[0].get_text())
    answers = norm(adoc[0].get_text())
    mark = SECTION_MARK[section]
    if '第59回通関士試験' not in cover.replace(' ', '') or not re.search(r'≪\s*' + mark + r'\s*≫', cover):
        raise ParseError('TSUKANSHI_QUESTION_COVER_MISMATCH')
    if '第59回通関士試験' not in answers.replace(' ', '') or '正答及び配点' not in answers:
        raise ParseError('TSUKANSHI_ANSWER_COVER_MISMATCH')


def _headings(doc):
    found = []
    for page_number, page in enumerate(doc, start=1):
        for block in page.get_text('dict')['blocks']:
            if 'lines' not in block:
                continue
            for line in block['lines']:
                if 'spans' not in line:
                    continue
                raw = ''.join(span.get('text', '') for span in line['spans'])
                m = _HEADING.match(norm(raw))
                if m:
                    found.append((int(m.group(1)), page_number, line['bbox'][1]))
    return sorted(found, key=lambda x: (x[1], x[2]))


# 2025年の択一式は文字層を持つ。文章はPDFのテキストを表示し、
# 真の図表だけを原本PDFから切り出す。
# 以下の切出し座標はハッシュ検証済み2025年版だけに使用する。
_TABLE_CLIPS = {
    ('通関実務', 15): (94, 347, 532, 538),  # 付属の関税率表の部・類表題
    ('通関実務', 16): (100, 144, 445, 471),  # 関税率表の各類と物品の対応表
}
_CHOICE_START = re.compile(r'^[\s\u3000]*([1-5１-５])[ \t\u3000]+(?=\S)')
_PAGE_DECOR = re.compile(r'^[―ー－\-\s]*[0-9０-９]{1,3}[―ー－\-\s]*$')


def _join_wrapped(left, right):
    # 改行はPDFの物理的な折り返しなので結合。英数字同士だけ空白を残す。
    sep = (' ' if left and right and left[-1].isascii() and left[-1].isalnum()
           and right[0].isascii() and right[0].isalnum() else '')
    return left + sep + right


def _text_and_options(lines):
    if not lines or not _HEADING.match(lines[0]):
        return '', []
    lines = [_HEADING.sub('', lines[0], count=1).strip()] + lines[1:]
    stem, choices = '', []
    for line in lines:
        m = _CHOICE_START.match(line)
        if m:
            number = int(unicodedata.normalize('NFKC', m.group(1)))
            if number == len(choices) + 1:
                choices.append(line[m.end():].strip())
                continue
        if choices:
            choices[-1] = _join_wrapped(choices[-1], line)
        else:
            stem = _join_wrapped(stem, line)
    return stem, choices


def parse_questions(doc, section):
    import fitz

    if section not in START:
        raise ParseError('TSUKANSHI_SECTION_UNVERIFIED')
    headings = _headings(doc)
    seen = set()
    raw = []
    for i, (number, first_page, first_top) in enumerate(headings):
        if not START[section] <= number <= END[section]:
            continue
        if number in seen:
            raise ParseError('TSUKANSHI_QUESTION_NUMBER_DUPLICATED', question=number)
        seen.add(number)
        next_head = headings[i + 1] if i + 1 < len(headings) else None
        last_page = next_head[1] if next_head else doc.page_count
        crops, pages, segments = [], [], []
        for pn in range(first_page, last_page + 1):
            page = doc[pn - 1]
            top = max(0, first_top - 2) if pn == first_page else 32
            bottom = (next_head[2] - 2 if next_head and pn == last_page
                      else page.rect.height - 23)
            if bottom - top <= 5:
                continue
            pages.append(pn)
            def read(a, b):
                if b <= a:
                    return ''
                return page.get_text('text', sort=True,
                    clip=fitz.Rect(40, a, page.rect.width - 35, b))
            table = _TABLE_CLIPS.get((section, number))
            if table and pn == first_page:
                # 表は文字で読んだふりをせず、原本の表だけ別画像で表示する。
                segments.extend((read(top, table[1] - 3), read(table[3] + 3, bottom)))
                crops.append((pn, table))
            else:
                segments.append(read(top, bottom))
        lines = [line.strip() for line in '\n'.join(segments).splitlines()
                 if line.strip() and not _PAGE_DECOR.fullmatch(line.strip())]
        stem, choices = _text_and_options(lines)
        # 不完全なテキストは空のダミー選択肢で埋めない。build_resultで除外する。
        if len(stem) < 25 or len(choices) != 5 or any(len(c) < 10 for c in choices):
            raw.append(RawQuestion(number=number, stem=stem, choices=choices,
                pages=pages, notes=['2025_verified_source', 'text_extraction_incomplete']))
            continue
        raw.append(RawQuestion(number=number, stem=stem, choices=choices,
            pages=pages, has_graphics=bool(crops), stem_mode='text',
            choice_mode='text', crops=crops, preserve_aspect=True,
            notes=['official_single_choice_only', '2025_verified_source',
                   'verified_pdf_text_direct']))
    if not raw:
        raise ParseError('TSUKANSHI_VERIFIED_SINGLE_CHOICE_NOT_FOUND')
    return raw


def parse_answers(adoc, section, year):
    if year != 2025 or section not in SECTION_MARK:
        raise ParseError('TSUKANSHI_ANSWER_SECTION_UNVERIFIED')
    page = adoc[0]
    if not hasattr(page, 'find_tables'):
        raise ParseError('TSUKANSHI_ANSWER_TABLE_UNREADABLE')
    found = {}
    for table in page.find_tables().tables:
        for row in table.extract():
            cells = [norm(v) for v in row]
            target_indices = ([0] if section == '通関業法' and len(cells) == 2
                else [0] if section == '関税法等' and len(cells) >= 5
                else [3] if section == '通関実務' and len(cells) >= 5
                else [])
            for col in target_indices:
                if col + 1 >= len(cells):
                    continue
                q = _ANSWER_Q.fullmatch(cells[col])
                ans = _ANSWER_ONE.fullmatch(cells[col + 1])
                if not q or not ans:
                    continue
                number, value = int(q.group(1)), int(ans.group(1))
                if not START[section] <= number <= END[section]:
                    continue
                value = ANSWER_SPECIAL if value == 0 else value
                if number in found and found[number] != value:
                    raise ParseError('TSUKANSHI_ANSWER_CONFLICT', question=number)
                found[number] = value
    expected_count = END[section] - START[section] + 1
    if len(found) != expected_count:
        raise ParseError('TSUKANSHI_ANSWER_TABLE_INCOMPLETE', found=len(found), expected=expected_count)
    return found


def classify(question, section):
    return {'fieldId': FIELD[section], 'method': '2025_official_section_verified', 'verified': True}
