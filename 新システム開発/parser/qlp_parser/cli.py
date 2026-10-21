"""経路A・Bの共通の入口。

使い方:
  python -m qlp_parser.cli --adapter takken --year 2025 \
      --question-pdf R7.pdf --question-url https://... [--question-sha256 ...] \
      [--answer-pdf R7.pdf --answer-url https://... --answer-sha256 ...]

正答PDFを省略すると、問題PDFに正答表が入っているものとして扱う。
--assets-dir を付けると、公式PDFから切り出した図（PNG）をそこへ書き出す。
結果はJSONで標準出力に出す。失敗も status=unavailable と理由コードで返し、成功を装わない。
"""

import argparse
import json
import sys
from pathlib import Path

from . import PARSER_VERSION
from .adapters import ADAPTERS
from .core import ParseError, PdfSource, build_result, open_pdf, render_crops, sha256


def _is_html_answer(adapter, source):
    return hasattr(adapter, "parse_answers_html") and not bytes(source.data[:5]).startswith(b"%PDF")


def _verified_sha(source):
    digest = sha256(source.data)
    if source.expected_sha256 and source.expected_sha256.lower() != digest:
        raise ParseError("ANSWER_HASH_MISMATCH", expected=source.expected_sha256, actual=digest)
    return digest


def run(adapter_name, year, question, answer=None, section=None, assets=None):
    """assets に dict を渡すと、切り出したPNG（ファイル名 -> バイト列）をそこに入れる。"""
    adapter = ADAPTERS.get(adapter_name)
    if adapter is None:
        return {"status": "unavailable", "reason": "ADAPTER_NOT_FOUND", "parserVersion": PARSER_VERSION}
    answer = answer or question
    try:
        qdoc, qsha = open_pdf(question)
        if answer is not question and _is_html_answer(adapter, answer):
            # 正答がウェブページで公開されている資格（行政書士）。ページそのものを公式の正答として読む
            asha = _verified_sha(answer)
            page = bytes(answer.data).decode("utf-8", errors="replace")
            adapter.check_year_html(page, year)
            raw = adapter.parse_questions(qdoc)
            answers = adapter.parse_answers_html(page)
        else:
            adoc, asha = (qdoc, qsha) if answer is question else open_pdf(answer)
            if getattr(adapter, "BY_SECTION", False):
                # 正答PDFに午前・午後など複数区分が載っている資格。
                # 部ごとの列と、実PDFのハッシュ・年度・問題冊子を先に照合する。
                fixed_section = section or adapter.SECTION
                adapter.check_source_hashes(year, fixed_section, qsha, asha)
                adapter.check_question(qdoc, adoc, year, fixed_section)
                raw = adapter.parse_questions(qdoc, fixed_section)
                answers = adapter.parse_answers(adoc, fixed_section, year)
            else:
                if hasattr(adapter, "check_year"):
                    adapter.check_year(adoc, year)
                if hasattr(adapter, "check_question"):
                    # 1冊に1科目の資格（中小企業診断士）：問題と正解の年度・科目がそろうか照合
                    adapter.check_question(qdoc, adoc, year, section)
                raw = adapter.parse_questions(qdoc)
                answers = adapter.parse_answers(adoc)
    except ParseError as e:
        return {"status": "unavailable", "reason": e.code, "detail": e.detail, "parserVersion": PARSER_VERSION}
    sec = section or adapter.SECTION
    figures, pngs = render_crops(qdoc, raw, f"{adapter.QUALIFICATION_ID}-{year}-{qsha[:12]}")
    if assets is not None:
        assets.update(pngs)
    return build_result(
        qualification_id=adapter.QUALIFICATION_ID,
        year=year,
        section=sec,
        question_source=question,
        question_sha=qsha,
        answer_source=answer,
        answer_sha=asha,
        raw_questions=raw,
        answers=answers,
        choice_count=adapter.CHOICE_COUNT,
        classify=(lambda q: adapter.classify(q, sec)) if getattr(adapter, 'BY_SECTION', False) else adapter.classify,
        figures=figures,
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
    ap.add_argument("--assets-dir", help="切り出したPNGを書き出すフォルダ")
    a = ap.parse_args(argv)
    q = PdfSource(Path(a.question_pdf).read_bytes(), a.question_url, a.question_sha256)
    ans = PdfSource(Path(a.answer_pdf).read_bytes(), a.answer_url, a.answer_sha256) if a.answer_pdf else None
    pngs = {}
    result = run(a.adapter, a.year, q, ans, a.section, pngs)
    if a.assets_dir:
        out = Path(a.assets_dir)
        out.mkdir(parents=True, exist_ok=True)
        for name, data in pngs.items():
            (out / name).write_bytes(data)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0 if result["status"] in ("ready", "partial") else 1


if __name__ == "__main__":
    sys.exit(main())
