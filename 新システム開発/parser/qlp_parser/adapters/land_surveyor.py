"""土地家屋調査士の公式PDFを取り込む（2022～2025年度の検証済みPDFのみ）。

既存の integration/verify_surveyor_2025.py・morning_complete_question_audit.py
で確認したSHAと正答を出典とする。図の抽出は既存の共通
core.render_crops を使う。テキスト層で確認できた本文・選択肢はテキスト化し、図表のみ原本を切り出す。

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

# 利用者から受領した原本PDFを検査した固定SHA。PDF本体はGitHubに置かない。
PIN_2022 = {
    "午前の部": "d887e2ed774496f08f51b096bb17536ab0dda8a14b70ff8de4b4ad5e3c63d111",
    "午後の部": "51e76d44ad29a22c5200cf6e27afad8361c3c77c7060df6293d225bfa04509cf",
    "正答": "b4aa4746393b2def52a470add31f30ed95116bb4b507173f354a7cd00c3c8d4a",
}
EXPECTED_2022 = {
    "午前の部": [5, 2, 4, 4, 1, 3, 2, 5, 3, 1],
    "午後の部": [4, 1, 4, 1, 3, 4, 5, 3, 1, 2, 2, 5, 4, 3, 1, 2, 2, 4, 5, 3],
}
PIN_2023 = {
    "午前の部": "169a59ba74696f19ec129e4acf97be3b3929ff5e97618b08640d520eef21428e",
    "午後の部": "30e8955bb1b0ed70b6f5d37084242d000958b75d30a9f2e69c9d9ec804772da2",
    "正答": "608059db36e15b81c4d43fb76319919059486dd255d7e1b2c2c4739b836c706a",
}
EXPECTED_2023 = {
    "午前の部": [4, 2, 2, 5, 3, 4, 1, 1, 4, 3],
    "午後の部": [2, 1, 4, 3, 5, 2, 3, 1, 4, 1, 4, 4, 4, 2, 3, 5, 2, 5, 3, 1],
}
PIN_2024 = {
    "午前の部": "ebba5878f9cf02e0c48da6311029441d27f30a4a46bb8956fbc408939755f999",
    "午後の部": "3d1aaab12057e4423c33cd19a412ce4dc3a6037d7cbc2f997925f41965ff4889",
    "正答": "2e161533cab70baad285275c7758fe0a703e089f6fc267ba875b69bd6013f4ce",
}
EXPECTED_2024 = {
    "午前の部": [2, 4, 1, 3, 3, 3, 5, 4, 2, 5],
    "午後の部": [4, 5, 2, 2, 3, 4, 2, 1, 4, 2, 2, 3, 1, 4, 3, 3, 5, 4, 5, 2],
}

# 2025年度の既存検証値を変更しない。
PIN_2025 = {
    "午前の部": "4a90ae3875c14c1eeda4b3ac9a32c6387b69b5cc15d0f5b62a99514af78267d0",
    "午後の部": "928c94f3d183788302bf7f9b7e70fb4d3ef40762761fa5e3d3f261a913920a6c",
    "正答": "3b6c2bbcb630b6ff6f989890f4e544e0eae7f8067fbefa86cad613fe5b659fad",
}
EXPECTED_2025 = {
    "午前の部": [5, 4, 4, 3, 2, 4, 2, 1, 2, 3],
    "午後の部": [1, 5, 2, 1, 4, 5, 3, 1, 5, 4, 3, 5, 5, 2, 2, 3, 3, 4, 3, 4],
}
# Archived copies linked by izuki.net (site identifies them as past Ministry releases).
# Downloaded and hashed independently on 2026-10-31; fixed correct-answer vectors
# extracted from matching annual answer-PDF columns, not guessed by a model.
# These candidates remain separate from the 2022-2025 directly pinned originals.
ARCHIVED_PINS = {
    2015: {
        "午前の部": "34facdf521d4eea585006105422b20acda620bc7ec5c31c1cd6b7e14572bf61b",
        "午後の部": "688dd80d275c3ddb43e43f098f4e857a71a061147051825ef2592ee93fa630e6",
        "正答": "a46314e7d9275c3258528dcc726ef3fd2bafd75774631554897c2e574500397f"
    },
    2017: {
        "午前の部": "78f7da8ddfb6ded0b1f0887612a7880b855fcda327e435fa36fab3dca3b9744f",
        "午後の部": "c260355634fc25f641bd2f9dc5ae28c691a55f616170c7b23e818f2d7c380121",
        "正答": "2bba288c40e1f50773ae61bee4e6e4964673171972b3b311e19c8ddb48cb2037"
    },
    2018: {
        "午前の部": "4d6c754fe2fc53ba42f48ab173e4ee66177033071d911182d44f71821282f63d",
        "午後の部": "28fa300ba96fad255cc88c5d27c2c159c69fcc26c982e6407755156f94fc0328",
        "正答": "4123527d4863c689df4c7393e5454f3e202a20f2e1abd9df615d7cff3cd21d5e"
    },
    2019: {
        "午前の部": "fc83edc0b7c26a09ec8caefa04f7e4e5d53d0e4225cd1e2c5edd4dc0a8d317b8",
        "午後の部": "7ab89c83c35bd07ae5670d09d3418ae3f9b625a7ee5fcac3fa84cefd163873b9",
        "正答": "056b672d9390e07b39e14fd1179def7d31e3f209ded6021358295401fa210a73"
    },
    2021: {
        "午前の部": "0a254b7da1dfc210da8ccdd008630184206dd0bf94ec3d41f667873a230b8f91",
        "午後の部": "14ffe479c12880482036a094d0d493e573a966bb91fb86c01a375f0d787c46a4",
        "正答": "a9b2040148309b64690cf5e74b942da286a887f8106fecdeed99a37879f67de7"
    }
}
ARCHIVED_EXPECTED = {
    2015: {
        "午前の部": [
            4,
            4,
            4,
            4,
            3,
            2,
            1,
            3,
            1,
            3
        ],
        "午後の部": [
            1,
            2,
            3,
            3,
            4,
            4,
            2,
            2,
            5,
            3,
            4,
            3,
            2,
            5,
            4,
            1,
            3,
            3,
            3,
            2
        ]
    },
    2017: {
        "午前の部": [
            2,
            4,
            4,
            4,
            2,
            3,
            5,
            4,
            5,
            4
        ],
        "午後の部": [
            2,
            2,
            4,
            5,
            3,
            3,
            3,
            4,
            1,
            2,
            2,
            4,
            3,
            3,
            2,
            3,
            4,
            5,
            3,
            5
        ]
    },
    2018: {
        "午前の部": [
            3,
            4,
            2,
            2,
            4,
            4,
            4,
            5,
            3,
            2
        ],
        "午後の部": [
            5,
            3,
            5,
            4,
            2,
            5,
            1,
            5,
            4,
            2,
            4,
            4,
            5,
            1,
            3,
            3,
            4,
            1,
            2,
            5
        ]
    },
    2019: {
        "午前の部": [
            2,
            3,
            4,
            5,
            5,
            5,
            1,
            2,
            1,
            4
        ],
        "午後の部": [
            2,
            4,
            2,
            3,
            3,
            5,
            5,
            3,
            2,
            3,
            5,
            1,
            2,
            4,
            2,
            4,
            3,
            5,
            4,
            4
        ]
    },
    2021: {
        "午前の部": [
            3,
            5,
            3,
            4,
            3,
            1,
            4,
            4,
            3,
            1
        ],
        "午後の部": [
            4,
            2,
            4,
            3,
            5,
            2,
            2,
            3,
            3,
            4,
            3,
            5,
            2,
            3,
            3,
            2,
            5,
            5,
            4,
            5
        ]
    }
}

PIN_BY_YEAR = {**ARCHIVED_PINS, 2022: PIN_2022, 2023: PIN_2023, 2024: PIN_2024, 2025: PIN_2025}
EXPECTED_BY_YEAR = {**ARCHIVED_EXPECTED, 2022: EXPECTED_2022, 2023: EXPECTED_2023, 2024: EXPECTED_2024, 2025: EXPECTED_2025}
SECTIONS = {"午前の部": (10, "l1"), "午後の部": (20, "l3")}
HEADING = re.compile(r"^第\s*([0-9]+)\s*問(?:\s|$)")
OPTION = re.compile(r"(?<!\w)([1-5])\s+\S")
ANSWER_HEADING = re.compile(r"^第\s*([0-9]+)\s*問$")


def _norm(value):
    return unicodedata.normalize("NFKC", str(value or ""))


def check_source_hashes(year, section, question_sha, answer_sha):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED", section=section)
    # 未検証年度は出題しない。対応済年度の問題・正答の原本SHAだけ受け付ける。
    pins = PIN_BY_YEAR.get(year)
    if pins is None:
        raise ParseError("YEAR_NOT_VALIDATED", year=year)
    if question_sha != pins[section] or answer_sha != pins["正答"]:
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
    base = 1988 if year <= 2018 else 2018
    if (not era and not short) or int((era or short).group(1)) + base != year:
        raise ParseError("QUESTION_YEAR_MISMATCH")
    answer_cover = _norm(answer_doc[0].get_text("text", sort=True)).replace(" ", "")
    if ("土地家屋調査士" not in answer_cover or
            "午前の部" not in answer_cover or "午後の部" not in answer_cover):
        raise ParseError("ANSWER_QUALIFICATION_SECTION_MISMATCH")
    a_year = re.search(r"(令和|平成)\s*(元|\d+)\s*年度", answer_cover)
    if not a_year or (2018 if a_year.group(1) == "令和" else 1988) + (1 if a_year.group(2) == "元" else int(a_year.group(2))) != year:
        raise ParseError("ANSWER_YEAR_MISMATCH")


def _question_crop(page):
    """問題の本文・図・選択肢を同じ原本位置関係で切り出す。

    ヘッダーとページ番号は切ってよいが、本文・図・表を外す場合は
    安全側としてページ全体を返す。原本にない図を追加しない。
    """
    original = page.rect
    full = (original.x0 + 18, original.y0 + 30, original.x1 - 18, original.y1 - 42)
    try:
        import fitz
        blocks = page.get_text("blocks")
        if not isinstance(blocks, (list, tuple)):
            return full
        text_boxes = []
        footer = re.compile(r"^[\s─ー‐－-]*[（(]\s*\d+\s*[）)][\s─ー‐－-]*$")
        for block in blocks:
            if len(block) < 7 or block[6] != 0 or not str(block[4]).strip():
                continue
            t = _norm(block[4]).strip()
            if footer.fullmatch(t):
                continue
            box = fitz.Rect(block[:4])
            # 他の本文がページ下端に来ている場合、切り捨てず全体を残す。
            if box.y0 > original.height * 0.90:
                return full
            text_boxes.append(box)
        if not text_boxes:
            return full
        region = fitz.Rect(text_boxes[0])
        for b in text_boxes[1:]:
            region |= b
        for d in page.get_drawings():
            box = fitz.Rect(d.get("rect") or (0, 0, 0, 0))
            if not box.is_empty and box.y0 <= original.height * 0.91:
                region |= box
        for img in page.get_images(full=True):
            for box in page.get_image_rects(img):
                if box.y0 <= original.height * 0.91:
                    region |= box
                else:
                    return full
        candidate = fitz.Rect(region.x0 - 14, region.y0 - 14,
                              region.x1 + 14, region.y1 + 14) & original
        if candidate.is_empty or candidate.width < 100 or candidate.height < 70:
            return full
        # 切抜がページ全体よりも広い場合は、元の安全な領域に戻す。
        return tuple(candidate)
    except (TypeError, ValueError, AttributeError, IndexError):
        return full



# 数字1～5を問題文中の数値と混同せず、末尾の5肢だけを採用する。
CHOICE_MARK = re.compile(r"(?<!\S)([1-5])\s+")
PAGE_FOOTER = re.compile(r"^[\s─ー‐－-]*[（(]\s*\d+\s*[）)][\s─ー‐－-]*$")
BAD_CHARS = ("\ufffd", "(cid:", "\x00")


def _verified_text(crops, doc, number):
    """PDFテキスト層から正確に5肢を切り出せる場合だけ返す。

    OCRの推測補完はせず、認識・順序・文字の欠落時はNoneを返す。
    """
    lines = []
    for index, _ in crops:
        raw = doc[index-1].get_text("text", sort=True)
        if not isinstance(raw, str) or any(b in raw for b in BAD_CHARS):
            return None
        block = [_norm(x).strip() for x in raw.splitlines()
                 if x.strip() and not PAGE_FOOTER.fullmatch(_norm(x).strip())]
        if not block or (lines and HEADING.match(block[0])):
            return None
        lines.extend(block)
    if not lines or not (head := HEADING.match(lines[0])) or int(head.group(1)) != number:
        return None
    body = [HEADING.sub("", lines[0], count=1).strip(), *lines[1:]]
    body = [x for x in body if x]
    if len(body) < 2:
        return None
    tail = body[-1]
    markers = list(CHOICE_MARK.finditer(tail))
    found = None
    if [int(x.group(1)) for x in markers] == [1, 2, 3, 4, 5]:
        found = [tail[m.end():(markers[i+1].start() if i < 4 else len(tail))].strip()
                 for i,m in enumerate(markers)]
        body = body[:-1]
    elif len(body) >= 6:
        match = [re.match(r"^([1-5])\s+(.+)$", line) for line in body[-5:]]
        if all(match) and [int(m.group(1)) for m in match] == [1,2,3,4,5]:
            found = [m.group(2).strip() for m in match]
            body = body[:-5]
    if not found or any(not x or len(x)>180 for x in found):
        return None
    stem = "\n".join(body).strip()
    if len(stem)<25 or any(HEADING.match(s) for s in body[1:]):
        return None
    return stem, found


def _verified_figure_crops(crops, doc):
    """PDFに本物の図・表があるときだけその領域を返す。不確実ならNone。

    文字の下線やページの区切りを図と誤認しない。
    """
    try:
        import fitz
        regions = []
        for index,_ in crops:
            page = doc[index-1]
            rects = []
            for img in page.get_images(full=True):
                rects.extend(r for r in page.get_image_rects(img)
                             if r.width>30 and r.height>25)
            # 単一の線は高さ・幅の一方が0の矩形となる。is_emptyで落とすと
            # 線だけで描かれた測量図・表を見落とすため、長さで判定する。
            lines = [fitz.Rect(d.get("rect") or (0,0,0,0)) for d in page.get_drawings()]
            lines = [r for r in lines if (r.width>15 or r.height>15) and
                     r.y0>=25 and r.y1<page.rect.y1-25]
            rects.extend(r for r in lines if r.width>60 and r.height>28)
            thin = [r for r in lines if (r.width>45 and r.height<=6) or
                    (r.height>35 and r.width<=6)]
            if len(thin)>=4:
                # PyMuPDFの矩形集合演算は高さ0の線をemptyとして無視する。
                # 各線に1ptの太さを付けてから合成し、表の範囲を復元する。
                thick = [fitz.Rect(r.x0-0.5,r.y0-0.5,r.x1+0.5,r.y1+0.5) for r in thin]
                combined = fitz.Rect(thick[0])
                for r in thick[1:]: combined |= r
                if combined.width>80 and combined.height>45:
                    rects.append(combined)
            if not rects:
                continue
            area = fitz.Rect(rects[0])
            for r in rects[1:]: area |= r
            if area.width>page.rect.width*0.94 or area.height>page.rect.height*0.78:
                return None
            clip = fitz.Rect(area.x0-9,area.y0-9,area.x1+9,area.y1+9) & page.rect
            regions.append((index,tuple(clip)))
        return regions
    except (TypeError,ValueError,AttributeError,IndexError):
        return None


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
        crops = [(page_index + 1, _question_crop(page))]
        # 実原本2022年度・午後問18は、問題文と図・選択肢が2ページに
        # 分かれている。直後ページに別問の見出しがなく、選択肢の
        # 番号1～5が完全に確認できる場合のみ、続きページを追加する。
        if "12345" not in "".join(map(str, choices)):
            following = page_index + 1
            if following >= len(doc):
                raise ParseError("CHOICE_SEQUENCE_NOT_VERIFIED", number=n)
            next_page = doc[following]
            next_lines = [_norm(v).strip() for v in next_page.get_text("text", sort=True).splitlines() if v.strip()]
            if not next_lines or HEADING.match(next_lines[0]):
                raise ParseError("CHOICE_SEQUENCE_NOT_VERIFIED", number=n)
            next_choices = [int(m.group(1)) for m in OPTION.finditer("\n".join(next_lines))]
            if "12345" not in "".join(map(str, choices + next_choices)):
                raise ParseError("CHOICE_SEQUENCE_NOT_VERIFIED", number=n)
            crops.append((following + 1, _question_crop(next_page)))
        # テキスト層の検証に成功した問は文字＋本物の図表のみ。
        # データ不完全・図の位置が不確実な問は従来の原本画像表示に戻す。
        parsed = _verified_text(crops,doc,n)
        figure_crops = _verified_figure_crops(crops,doc) if parsed else None
        first_crop=crops[0][1]
        if parsed and figure_crops is not None:
            stem, options=parsed
            found[n]=RawQuestion(
                number=n,stem=stem,choices=options,pages=[p for p,_ in crops],
                rect=(first_crop[1],first_crop[3]),has_graphics=bool(figure_crops),
                notes=["verified_pdf_text","official_diagrams_only"] +
                      (["verified_continuation_page"] if len(crops)>1 else []),
                stem_mode="text",choice_mode="text",crops=figure_crops,
                preserve_aspect=True,
            )
        else:
            found[n]=RawQuestion(
                number=n,
                stem="公式試験問題の本文・図表・選択肢を、下の原本画像で確認してください。拡大して読めます。",
                choices=[str(j) for j in range(1,6)],pages=[p for p,_ in crops],
                rect=(first_crop[1],first_crop[3]),has_graphics=True,
                notes=["original_question_image","text_or_diagram_verification_pending"] +
                      (["verified_continuation_page"] if len(crops)>1 else []),
                stem_mode="official_image",choice_mode="official_image",
                crops=crops,preserve_aspect=True,
            )
    if sorted(found) != list(range(1, count + 1)):
        raise ParseError("QUESTION_SET_INCOMPLETE", found=sorted(found), expected=count)
    return list(found.values())


def parse_answers(doc, section, year):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED")
    count, _ = SECTIONS[section]
    expected = EXPECTED_BY_YEAR.get(year)
    if expected is None:
        raise ParseError("YEAR_NOT_VALIDATED", year=year)
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
    if [answers[i] for i in range(1, count + 1)] != expected[section]:
        raise ParseError("ANSWER_KEY_DIFFERS_FROM_AUDITED_SOURCE")
    return answers


def classify(question, section):
    if section not in SECTIONS:
        raise ParseError("SECTION_NOT_SUPPORTED")
    return {
        "fieldId": SECTIONS[section][1], "unitId": None,
        "method": "official_exam_section", "evidence": section, "verified": True,
    }
