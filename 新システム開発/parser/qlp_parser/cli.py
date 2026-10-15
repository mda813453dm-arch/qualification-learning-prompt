"""経路A・Bの共通の入口。

使い方:
  python -m qlp_parser.cli --adapter takken --year 2025 \
      --question-pdf R7.pdf --question-url https://... [--question-sha256 ...] \
      [--answer-pdf R7.pdf --answer-url https://... --answer-sha256 ...]

正答PDFを省略すると、問題PDFに正答表が入っているものとして扱う。
結果はJSONで標準出力に出す。失敗も status=unavailable と理由コードで返し、成功を装わない。
"""

import argparse
import json
import sys
from pathlib import Path

from . import PARSER_VERSION
from .adapters import ADAPTERS
from .core import ParseError, PdfSource, build_result, open_pdf


def run(adapter_name, year, question, answer=None, section=None):
    adapter = ADAPTERS.get(adapter_name)
    if adapter is None:
        return {"status": "unavailable", "reason": "ADAPTER_NOT_FOUND", "parserVersion": PARSER_VERSION}
    answer = answer or question
    try:
        qdoc, qsha = open_pdf(question)
        adoc, asha = (qdoc, qsha) if answer is question else open_pdf(answer)
        raw = adapter.parse_questions(qdoc)
        answers = adapter.parse_answers(adoc)
    except ParseError as e:
        return {"status": "unavailable", "reason": e.code, "detail": e.detail, "parserVersion": PARSER_VERSION}
    return build_result(
        qualification_id=adapter.QUALIFICATION_ID,
        year=year,
        section=section or adapter.SECTION,
        question_source=question,
        question_sha=qsha,
        answer_source=answer,
        answer_sha=asha,
        raw_questions=raw,
        answers=answers,
        choice_count=adapter.CHOICE_COUNT,
        classify=adapter.classify,
    )


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--section")
    ap.add_argument("--question-pdf", required=True)
    ap.add_argument("--question-url")
    ap.add_argument("--question-sha256")
    ap.add_argument("--answer-pdf")
    ap.add_argument("--answer-url")
    ap.add_argument("--answer-sha256")
    a = ap.parse_args(argv)
    q = PdfSource(Path(a.question_pdf).read_bytes(), a.question_url, a.question_sha256)
    ans = PdfSource(Path(a.answer_pdf).read_bytes(), a.answer_url, a.answer_sha256) if a.answer_pdf else None
    result = run(a.adapter, a.year, q, ans, a.section)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0 if result["status"] in ("ready", "partial") else 1


if __name__ == "__main__":
    sys.exit(main())
