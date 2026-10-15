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


def build_result(*, qualification_id, year, section, question_source, question_sha,
                 answer_source, answer_sha, raw_questions, answers, choice_count,
                 classify, figures=None):
    """分解結果と正答を結合し、出題用パケットと除外一覧を作る。

    answers: {問番号: 正答番号}（同年度・同区分の公式正答から読んだもの）
    classify: 問題 -> {"fieldId": str|None, "method": str, "verified": bool}
    figures: {問番号: [図の情報]}（図の切り出しは測量士補アダプタで実装予定）
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
        elif not q.stem.strip():
            reason = "STEM_EMPTY"
        elif len(q.choices) != choice_count or any(not c.strip() for c in q.choices):
            reason = "CHOICES_INCOMPLETE"
        elif q.number not in answers:
            reason = "OFFICIAL_ANSWER_NOT_FOUND"
        elif not 1 <= answers[q.number] <= len(q.choices):
            reason = "OFFICIAL_ANSWER_OUT_OF_RANGE"
        elif q.has_graphics and not figures.get(q.number):
            # 図が要るかもしれない問題は、図を返せるまで出題しない（安全側）
            reason = "FIGURE_REQUIRED_NOT_AVAILABLE"
        if reason:
            excluded.append({"questionNumber": q.number, "reason": reason, "pages": q.pages})
            continue
        cls = classify(q)
        packets.append({
            "sourceMode": "runtime_official_pdf",
            "qualificationId": qualification_id,
            "year": year,
            "section": section,
            "questionId": f"{qualification_id}:{year}:{section}:{q.number}",
            "questionNumber": q.number,
            "fieldId": cls.get("fieldId"),
            "stem": q.stem,
            "choices": list(q.choices),
            "correctAnswer": answers[q.number],
            "diagramRequired": bool(figures.get(q.number)),
            "figures": figures.get(q.number, []),
            "questionPdfUrl": question_source.url,
            "answerPdfUrl": answer_source.url,
            "questionPdfSha256": question_sha,
            "answerPdfSha256": answer_sha,
            "evidence": {"questionPdfPages": q.pages, "questionRect": q.rect, "field": cls.get("method"), "notes": list(q.notes)},
            "verification": {
                "questionText": "runtime_pdf_checked",
                "choices": "runtime_pdf_checked",
                "answer": "same_year_official_answer_checked",
                "visual": "question_level_pdf_graphics_checked",
                "field": "verified" if cls.get("verified") else "unverified",
            },
        })
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
