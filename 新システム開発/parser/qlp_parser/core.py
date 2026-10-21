"""資格に依存しない部分：PDF検査、文字抽出、パケット組み立て、不合格判定。

検査規則は src/official-pdf-runtime-ingestion.js と
公式PDFランタイム分解API仕様_20261014.md §5 を移植したもの。
1問の失敗で全体を止めず、その問だけ除外して理由を返す。
"""

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field

from . import PARSER_VERSION
from .question_view import compact_svg

PDF_MAGIC = b"%PDF-"


class ParseError(Exception):
    """PDF全体を処理できないときの失敗。code は理由コード。"""

    def __init__(self, code, **detail):
        super().__init__(code)
        self.code = code
        self.detail = detail


@dataclass
class PdfSource:
    data: bytes
    url: str | None = None
    expected_sha256: str | None = None


@dataclass
class RawQuestion:
    """アダプタが返す1問分の分解結果（正答・分野は未結合）。"""

    number: int
    stem: str
    choices: list
    pages: list
    rect: tuple | None = None  # 問題の範囲（最初のページ上）。図の判定用
    has_graphics: bool = False  # 問題の範囲に画像・図形があるか
    notes: list = field(default_factory=list)
    # 文字が取り出せない（アウトライン化された）PDFでは、本文・選択肢を公式PDFの画像で見せる
    stem_mode: str = "text"  # "text" | "ocr"（読み間違いがありうる） | "official_image"
    choice_mode: str = "text"  # "text" | "ocr" | "official_image"（選択肢は番号だけを持つ）
    crops: list = field(default_factory=list)  # 切り出す範囲 [(ページ番号, (x0, y0, x1, y1))]
    preserve_aspect: bool = False  # MCP画面でタップ拡大できる原本ページは、左右余白を人工追加しない
    classification_text: str | None = None  # OCRからの分野推定にのみ利用。公式原本画像の出題本文としては扱わない

    @property
    def needs_image(self):
        return self.has_graphics or "official_image" in (self.stem_mode, self.choice_mode)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def open_pdf(source):
    """PDFとして有効か、既知のSHA-256と一致するかを確かめて開く。"""
    import fitz  # PyMuPDF。経路A・Bとも同じ版を使う

    data = source.data
    if not isinstance(data, (bytes, bytearray)) or not data.startswith(PDF_MAGIC):
        raise ParseError("PDF_INVALID")
    digest = sha256(data)
    if source.expected_sha256 and source.expected_sha256.lower() != digest:
        raise ParseError("PDF_HASH_MISMATCH", expected=source.expected_sha256, actual=digest)
    try:
        doc = fitz.open(stream=bytes(data), filetype="pdf")
    except Exception as e:  # noqa: BLE001  壊れたPDFは種類を問わず同じ扱い
        raise ParseError("PDF_OPEN_FAILED", error=type(e).__name__) from e
    if doc.page_count < 1:
        raise ParseError("PDF_EMPTY")
    return doc, digest


_LIST_MARKER = re.compile(r"^(?:[アイウエオカキクケコ][ 　]|[（(][0-9０-９一二三四五六七八九十]+[）)]|[①-⑳]|[一二三四五六七八九十][ 　])")
_PAGE_NUMBER = re.compile(r"^[\s\-－‐ー—]*[0-9０-９]{1,3}[\s\-－‐ー—]*$")


def clean_text(text):
    """PDFの折り返しをつなぎ、表示用に整える。

    箇条（ア〜、(1)、①など）の行頭では改行を残す。全角・半角の統一はしない
    （公式の表記を変えないため）。
    """
    lines = [ln.rstrip() for ln in text.replace("\r", "").split("\n")]
    out = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if out and not _LIST_MARKER.match(s):
            prev = out[-1]
            # 英数字どうしの間だけ空白を入れ、日本語の折り返しは詰める
            if prev and prev[-1].isascii() and prev[-1].isalnum() and s[0].isascii() and s[0].isalnum():
                out[-1] = prev + " " + s
            else:
                out[-1] = prev + s
        else:
            out.append(s)
    return "\n".join(out)


def is_page_number_line(line):
    return bool(_PAGE_NUMBER.match(line))


def to_int(s):
    return int(unicodedata.normalize("NFKC", s))


_TEXT_CHECK = {"text": "runtime_pdf_checked", "ocr": "ocr_unverified", "official_image": "official_pdf_image"}
CROP_ZOOM = 3  # 80番の実機確認で読めた倍率（PDF描画倍率3倍）


def render_crops(doc, raw_questions, file_prefix):
    """アダプタが決めた範囲を公式PDFから切り出してPNGにする。描き直しはしない（77番：原図優先）。

    返り値: ({問番号: [図の情報]}, {ファイル名: PNGのバイト列})
    真っ白な画像になった範囲は図として返さない（その問は図なしとして除外される）。
    """
    import fitz

    figures, assets = {}, {}
    for q in raw_questions:
        for page_no, rect in q.crops:
            page = doc[page_no - 1]
            clip = fitz.Rect(rect) & page.rect
            if clip.is_empty:
                continue
            pix = page.get_pixmap(matrix=fitz.Matrix(CROP_ZOOM, CROP_ZOOM), clip=clip, alpha=False)
            if pix.is_unicolor:
                continue
            if not q.preserve_aspect:
                pix = _pad_landscape(pix)
            data = pix.tobytes("png")
            name = f"{file_prefix}-q{q.number}-p{page_no}.png"
            assets[name] = data
            fig = {
                "kind": "official_pdf_crop",
                "file": name,
                "page": page_no,
                "rect": [round(v, 1) for v in clip],
                "zoom": CROP_ZOOM,
                "width": pix.width,
                "height": pix.height,
                "sha256": sha256(data),
            }
            # 同じ範囲を本文に入れられるSVGにもする（ChatGPTは外部の画像を出さないが、本文中のSVGはその位置に出す）
            svg = compact_svg(page, clip)
            if svg:
                svg_bytes = svg.encode("utf-8")
                svg_name = name[:-4] + ".svg"
                assets[svg_name] = svg_bytes
                fig["svgFile"] = svg_name
                fig["svgSha256"] = sha256(svg_bytes)
            figures.setdefault(q.number, []).append(fig)
    return figures, assets


# ChatGPTは縦長の画像を横長の枠に切り詰めて表示する（上下が切れる。2026-10-17、測量士補R8 問26）。
# 縦長の図は左右に白い余白を足して横長にし、枠の中に全体が入るようにする（図そのものは変えない）
FIGURE_MIN_ASPECT = 1.8


def _pad_landscape(pix):
    import fitz

    if pix.width >= pix.height * FIGURE_MIN_ASPECT:
        return pix
    width = int(round(pix.height * FIGURE_MIN_ASPECT))
    out = fitz.Pixmap(pix.colorspace, fitz.IRect(0, 0, width, pix.height), False)
    out.clear_with(255)
    pix.set_origin((width - pix.width) // 2, 0)
    out.copy(pix, pix.irect)
    return out


OUT_OF_ORDER = "question_number_out_of_order"


def mark_out_of_order(questions):
    """OCRで読んだ問番号を、問の並びで確かめる。

    問題は問番号の順に並んでいるので、文書の順に番号を並べたとき、最も長い増加列（どの選び方でも必ず入る問）に
    入らない番号は、読み違いのおそれがある（例：問13を「問18」と読む）。その問は出題しない（正答を取り違えないため）。
    どちらが読み違いか決められないとき（11, 12, 18, 14 の 18 と 14）は両方出さない。questions は文書の順。
    """
    nums = [q.number for q in questions]
    n = len(nums)
    f = [1] * n  # f[i]: i で終わる最長の増加列の長さ
    for i in range(n):
        for j in range(i):
            if nums[j] < nums[i]:
                f[i] = max(f[i], f[j] + 1)
    g = [1] * n  # g[i]: i から始まる最長の増加列の長さ
    for i in reversed(range(n)):
        for j in range(i + 1, n):
            if nums[i] < nums[j]:
                g[i] = max(g[i], g[j] + 1)
    longest = max(f, default=0)
    on_some = [f[i] + g[i] - 1 == longest for i in range(n)]
    per_level = {}
    for i in range(n):
        if on_some[i]:
            per_level[f[i]] = per_level.get(f[i], 0) + 1
    for i, q in enumerate(questions):
        if "read_by_ocr" not in q.notes and q.stem_mode != "ocr":
            continue
        if not (on_some[i] and per_level[f[i]] == 1):
            q.notes.append(OUT_OF_ORDER)
    return questions


# 公式の正答表の注記で「正解肢なし（全員正解）」「複数の選択肢を正解とする」とされた問の印（parse_answers が返す）
ANSWER_SPECIAL = -1


def build_result(*, qualification_id, year, section, question_source, question_sha,
                 answer_source, answer_sha, raw_questions, answers, choice_count,
                 classify, figures=None):
    """分解結果と正答を結合し、出題用パケットと除外一覧を作る。

    answers: {問番号: 正答番号}（同年度・同区分の公式正答から読んだもの）
    classify: 問題 -> {"fieldId": str|None, "method": str, "verified": bool}
    figures: {問番号: [図の情報]}（render_crops の結果）
    """
    figures = figures or {}
    packets, excluded = [], []
    counts = {}
    for q in raw_questions:
        counts[q.number] = counts.get(q.number, 0) + 1
    for q in sorted(raw_questions, key=lambda x: x.number):
        reason = None
        if counts[q.number] > 1:
            # 同じ問番号が2か所にあると、どちらが本物か決められないので両方出さない
            reason = "QUESTION_NUMBER_DUPLICATED"
        elif OUT_OF_ORDER in q.notes:
            reason = "QUESTION_NUMBER_UNVERIFIED"
        elif q.stem_mode != "official_image" and not q.stem.strip():
            reason = "STEM_EMPTY"
        elif (len(q.choices) != choice_count if choice_count else not 2 <= len(q.choices) <= 5) or any(not c.strip() for c in q.choices):
            reason = "CHOICES_INCOMPLETE"
        elif q.number not in answers:
            reason = "OFFICIAL_ANSWER_NOT_FOUND"
        elif answers[q.number] == ANSWER_SPECIAL:
            # 詳細不明の特殊正答は出題しない。公式資料と照合済みの複数解は下で処理する。
            reason = "OFFICIAL_ANSWER_SPECIAL_CASE"
        elif not (answers[q.number] == "all" or
                  (type(answers[q.number]) is int and 1 <= answers[q.number] <= len(q.choices)) or
                  (isinstance(answers[q.number], list) and len(answers[q.number]) >= 2
                   and len(set(answers[q.number])) == len(answers[q.number])
                   and all(type(n) is int and 1 <= n <= len(q.choices) for n in answers[q.number]))):
            reason = "OFFICIAL_ANSWER_OUT_OF_RANGE"
        elif q.needs_image and not figures.get(q.number):
            # 図が要るかもしれない問題・文字を画像で見せる問題は、画像を返せるまで出題しない（安全側）
            reason = "FIGURE_REQUIRED_NOT_AVAILABLE"
        cls = None if reason else classify(q)
        if not reason and not cls.get("fieldId"):
            # 分野が決まらない問題は出題しない（仕様：fieldId未確定のまま実践問題を進めない）
            reason = "FIELD_UNCLASSIFIED"
        if reason:
            excluded.append({"questionNumber": q.number, "reason": reason, "pages": q.pages})
            continue
        official_answer = answers[q.number]
        special = isinstance(official_answer, list) or official_answer == "all"
        accepted = (list(range(1, len(q.choices) + 1)) if official_answer == "all"
                    else list(official_answer) if isinstance(official_answer, list)
                    else [official_answer])
        packet = {
            "sourceMode": "runtime_official_pdf",
            "qualificationId": qualification_id,
            "year": year,
            "section": section,
            "questionId": f"{qualification_id}:{year}:{section}:{q.number}",
            "questionNumber": q.number,
            "fieldId": cls.get("fieldId"),
            "unitId": cls.get("unitId"),
            "stem": q.stem,
            "stemMode": q.stem_mode,
            "choices": list(q.choices),
            "choiceMode": q.choice_mode,
            "correctAnswer": accepted[0],
            "diagramRequired": bool(figures.get(q.number)),
            "figures": figures.get(q.number, []),
            "questionPdfUrl": question_source.url,
            "answerPdfUrl": answer_source.url,
            "questionPdfSha256": question_sha,
            "answerPdfSha256": answer_sha,
            "evidence": {"questionPdfPages": q.pages, "questionRect": q.rect, "field": cls.get("method"), "fieldEvidence": cls.get("evidence"), "notes": list(q.notes)},
            "verification": {
                "questionText": _TEXT_CHECK[q.stem_mode],
                "choices": _TEXT_CHECK[q.choice_mode],
                "answer": "same_year_official_answer_checked",
                "visual": "official_pdf_crop_rendered" if figures.get(q.number) else "question_level_pdf_graphics_checked",
                "field": "verified" if cls.get("verified") else "unverified",
            },
        }
        if special:
            packet["acceptedAnswers"] = accepted
            packet["allCorrect"] = official_answer == "all"
            packet["correctAnswerLabel"] = ("正解肢なし（全員正解）" if official_answer == "all"
                                             else "または".join(str(n) for n in accepted))
        packets.append(packet)
    status = "ready" if packets and not excluded else ("partial" if packets else "unavailable")
    return {
        "status": status,
        "parserVersion": PARSER_VERSION,
        "qualificationId": qualification_id,
        "year": year,
        "section": section,
        "questionPdfSha256": question_sha,
        "answerPdfSha256": answer_sha,
        "packetCount": len(packets),
        "packets": packets,
        "excluded": excluded,
    }
