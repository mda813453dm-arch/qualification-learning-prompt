"""土地家屋調査士の公式PDFを取り込む（2025年度の検証済みPDFのみ）。

既存の integration/verify_surveyor_2025.py・morning_complete_question_audit.py
で確認したSHAと正答を出典とする。図の抽出は既存の共通
core.render_crops を使い、設問のある元のPDFページをそのまま高解像度で示す。

午前（択一1～10）・午後（択一1～20）の正答は一つのPDFに左右2列で
載っている。必ずPDF内の座標と部別の列を同時検証し、別の部を混ぜない。
記述式（午前11・午後21/22）は本アダプタでは出題・採点しない。
"""
import re
import unicodedata

from ..core import ParseError, RawQuestion

QUALIFICATION_ID = "land_surveyor"
SECTION = "午後の部"
CHOICE_COUNT = 5
BY_SECTION = True

# 2025年度に利用者提供の公式PDFを検査した記録。PDF本体はGitHubに置かない。
PIN_2025 = {
    "午前の部": "4a90ae3875c14c1eeda4b3ac9a32c6387b69b5cc15d0f5b62a99514af78267d0",
    "午後の部": "928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c",
    "正答": "3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad",
}
EXPECTED_2025 = {
    "午前の部": [5, 4, 4, 3, 2, 4, 2, 1, 2, 3],
    "午後の部": [1, 5, 2, 1, 4, 5, 3, 1, 5, 4, 3, 5, 5, 2, 2, 3, 3, 4, 3, 4],
}
SECTIONS = {"午前の部": (10, "l1"), "午後の部": (20, "l3")}
HEADING = re.compile(r"^第\s*([0-9]+)\s*問(?:\s|$)")
OPTION = re.compile(r"(?<!\w)([1-5])\s+\S")
ANSWER_HEADING = re.compile(r"^第\s*([0-9]+)\s*問$")


def _norm(value):
    return unicodedata.normalize("NFKC", str(value or ""))


def check_source_hashes(year, section, question_sha, answer_sha):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED", section=section)
    # 他年度は公式PDFと正答の原本を突合してから追加する。
    if year != 2025:
        raise ParseError("YEAR_NOT_VALIDATED", year=year)
    if question_sha != PIN_2025[section] or answer_sha != PIN_2025["正答"]:
        raise ParseError("SOURCE_PDF_PIN_MISMATCH", year=year, section=section)


def check_question(doc, answer_doc, year, section):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED")
    cover = _norm(doc[0].get_text("text", sort=True)).replace(" ", "")
    # 公式の問題表紙は「午前（07）試験問題」など。資格名は印字されない。
    # 資格の同一性は上のSHAと公式資料の検証記録で固定する。
    if section not in cover:
        raise ParseError("EXAM_SECTION_MISMATCH", section=section)
    era = re.search(r"令和\s*(\d+)\s*年度", cover)
    short = re.search(r"[（(]\s*(\d{1,2})\s*[）)]", cover)
    if (not era and not short) or int((era or short).group(1)) + 2018 != year:
        raise ParseError("QUESTION_YEAR_MISMATCH")
    answer_cover = _norm(answer_doc[0].get_text("text", sort=True)).replace(" ", "")
    if ("土地家屋調査士" not in answer_cover or
            "午前の部" not in answer_cover or "午後の部" not in answer_cover):
        raise ParseError("ANSWER_QUALIFICATION_SECTION_MISMATCH")
    a_year = re.search(r"令和\s*(\d+)\s*年度", answer_cover)
    if not a_year or int(a_year.group(1)) + 2018 != year:
        raise ParseError("ANSWER_YEAR_MISMATCH")


def parse_questions(doc, section):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED")
    count, _ = SECTIONS[section]
    found = {}
    for page_index, page in enumerate(doc):
        lines = [_norm(v).strip() for v in page.get_text("text", sort=True).splitlines() if v.strip()]
        if not lines:
            continue
        match = HEADING.match(lines[0])
        if not match:
            continue
        n = int(match.group(1))
        if n > count:
            continue  # 記述式問は番号を検出しても選択式の正答を結合しない
        if n in found:
            raise ParseError("QUESTION_NUMBER_DUPLICATED", number=n)
        choices = [int(m.group(1)) for m in OPTION.finditer("\n".join(lines))]
        if "12345" not in "".join(map(str, choices)):
            raise ParseError("CHOICE_SEQUENCE_NOT_VERIFIED", number=n)
        # 文字や図を再生成せず、元のPDFの問題・表・選択肢が全て
        # 同じ順番で入る問単位の原本画像を共通切抜器に渡す。
        rect = page.rect
        crop = (rect.x0 + 18, rect.y0 + 30, rect.x1 - 18, rect.y1 - 42)
        found[n] = RawQuestion(
            number=n,
            stem="公式試験問題の本文・図表・選択肢を、下の原本画像で確認してください。拡大して読めます。",
            choices=[str(j) for j in range(1, 6)],
            pages=[page_index + 1],
            rect=(crop[1], crop[3]),
            has_graphics=True,
            notes=["original_question_image", "no_generated_figure"],
            stem_mode="official_image",
            choice_mode="official_image",
            crops=[(page_index + 1, crop)],
        )
    if sorted(found) != list(range(1, count + 1)):
        raise ParseError("QUESTION_SET_INCOMPLETE", found=sorted(found), expected=count)
    return list(found.values())


def parse_answers(doc, section):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED")
    count, _ = SECTIONS[section]
    answers = {}
    for page in doc:
        words = page.get_text("words", sort=True)
        mid = page.rect.width / 2
        for w in words:
            m = ANSWER_HEADING.match(_norm(w[4]).strip())
            if not m or ((w[0] < mid) != (section == "午前の部")):
                continue
            n = int(m.group(1))
            matches = [v for v in words if
                       abs((v[1] + v[3]) - (w[1] + w[3])) <= 2.2 and
                       v[0] > w[2] + 8 and
                       (v[0] < mid if section == "午前の部" else True) and
                       re.fullmatch(r"[1-5]", _norm(v[4]).strip())]
            if len(matches) != 1:
                raise ParseError("ANSWER_ROW_UNVERIFIED", number=n, matches=len(matches))
            if n in answers:
                raise ParseError("ANSWER_TABLE_DUPLICATED", number=n)
            answers[n] = int(_norm(matches[0][4]).strip())
    if sorted(answers) != list(range(1, count + 1)):
        raise ParseError("ANSWER_TABLE_INCOMPLETE", found=sorted(answers), expected=count)
    # 他列の1問ズレや同年度の別資料と結合した場合は、検証済み正答と
    # 食い違うため全件を止める。
    if [answers[i] for i in range(1, count + 1)] != EXPECTED_2025[section]:
        raise ParseError("ANSWER_KEY_DIFFERS_FROM_AUDITED_SOURCE")
    return answers


def classify(question, section):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED")
    return {
        "fieldId": SECTIONS[section][1], "unitId": None,
        "method": "official_exam_section", "evidence": section, "verified": True,
    }
