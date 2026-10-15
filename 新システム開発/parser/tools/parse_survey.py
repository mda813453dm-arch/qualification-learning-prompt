"""調査で見つけた公式PDF（直近10年度分）を実際に取得して分解し、年度ごとの結果を一覧にする（開発用）。

使い方: python parse_survey.py <survey_sources.py の出力フォルダ>
links.json を読み、宅建は RETIO の一覧の文言から年度・回を読み取る。
測量士補は国土地理院の一覧から読み取る。一覧は試験日ごとに「測量士（問題・解答一覧・解答例・解答用紙）」
「測量士補（問題・解答一覧）」の順に並ぶため、試験日の後、解答用紙より後のリンクを測量士補とする。
問題が「問題1」「問題2」に分かれている年度は、つなげて1つのPDFにしてから分解する。
"""

import json

import fitz
import re
import sys
import time
import traceback
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qlp_parser import fields  # noqa: E402
from qlp_parser.cli import run  # noqa: E402
from qlp_parser.core import PdfSource  # noqa: E402
from survey_sources import get  # noqa: E402

ERA = {"令和": 2018, "平成": 1988, "昭和": 1925}


def fiscal_year(label):
    m = re.search(r"(令和|平成|昭和)\s*(元|[0-9０-９]{1,2})\s*年", label)
    if not m:
        return None
    n = 1 if m.group(2) == "元" else int(m.group(2).translate(str.maketrans("０１２３４５６７８９", "0123456789")))
    return ERA[m.group(1)] + n


def session(label):
    m = re.search(r"（\s*([0-9０-９]{1,2})\s*月試験\s*）", label)
    return f"{int(m.group(1).translate(str.maketrans('０１２３４５６７８９', '0123456789')))}月" if m else "main"


def takken_sources(links):
    out = []
    for a in links:
        y = fiscal_year(a["text"])
        if y:
            out.append({"adapter": "takken", "year": y, "section": session(a["text"]), "questionUrl": a["href"], "answerUrl": None, "label": a["text"]})
    years = sorted({s["year"] for s in out}, reverse=True)[:10]
    return [s for s in out if s["year"] in years]


DATE = re.compile(r"令和\s*(元|[0-9]{1,2})\s*年\s*[0-9]{1,2}\s*月\s*[0-9]{1,2}\s*日")


def surveyor_sources(links):
    groups, cur = [], None
    for a in links:
        dates = DATE.findall(a["before"])
        if dates:
            y = 2019 if dates[-1] == "元" else 2018 + int(dates[-1])
            if not cur or cur["year"] != y:
                cur = {"year": y, "after_sheet": False, "q": [], "a": None}
                groups.append(cur)
        if not cur:
            continue
        if a["text"].startswith("解答用紙"):
            cur["after_sheet"] = True
        elif cur["after_sheet"] and a["text"].startswith("問題"):
            cur["q"].append(a["href"])
        elif cur["after_sheet"] and a["text"].startswith("解答一覧"):
            cur["a"] = a["href"]
    return [{"adapter": "surveyor", "year": g["year"], "section": "main", "questionUrls": g["q"], "answerUrl": g["a"]}
            for g in groups if g["q"] and g["a"]]


def join_pdfs(parts):
    if len(parts) == 1:
        return parts[0]
    out = fitz.open()
    for data in parts:
        with fitz.open(stream=data, filetype="pdf") as d:
            out.insert_pdf(d)
    return out.tobytes()


def classify_counts(packets, slug):
    table = fields.TAKKEN_FIELDS if slug == "takken" else fields.SURVEYOR_FIELDS
    c = Counter(p.get("fieldId") or "未分類" for p in packets)
    return {table.get(k, k): v for k, v in sorted(c.items())}


def diagnose(qbytes, abytes, adapter):
    """分解できなかったPDFの形を、ログで確かめられるように書き出す（パーサーを年度の形式に合わせるため）。"""
    from qlp_parser.cli import ADAPTERS
    ad = ADAPTERS[adapter]
    q = fitz.open(stream=qbytes, filetype="pdf")
    print(f"  [diag] pages={q.page_count} chars/page={[len(q[i].get_text()) for i in range(min(q.page_count, 6))]}")
    try:
        raw = ad.parse_questions(q)
        print(f"  [diag] parse_questions={len(raw)} numbers={[r.number for r in raw][:60]}")
    except Exception as e:  # noqa: BLE001
        print(f"  [diag] parse_questions error: {type(e).__name__}: {getattr(e, 'code', '')} {getattr(e, 'detail', '')}")
    for i in sorted({0, 1, 2}) :
        if i < q.page_count:
            print(f"  [diag] page{i + 1}:\n" + q[i].get_text(sort=True)[:1200])
    a = fitz.open(stream=abytes, filetype="pdf") if abytes else q
    print(f"  [diag] answer last page:\n" + a[a.page_count - 1].get_text(sort=True)[:2500])


def parse_one(src, outdir):
    t0 = time.time()
    urls = src.get("questionUrls") or [src["questionUrl"]]
    qbytes = join_pdfs([get(u, timeout=120)[0] for u in urls])
    abytes = None
    if src.get("answerUrl"):
        abytes, _ = get(src["answerUrl"], timeout=120)
    q = PdfSource(data=qbytes, url=urls[0])
    a = PdfSource(data=abytes, url=src["answerUrl"]) if abytes else None
    result = run(src["adapter"], src["year"], q, a, section=None if src["section"] == "main" else src["section"], assets={})
    if result.get("status") != "ready":
        print(f"----- {src['adapter']} {src['year']} {src['section']} {result.get('status')} {result.get('reason')} {result.get('detail')}")
        diagnose(qbytes, abytes, src["adapter"])
    return result, round(time.time() - t0, 1)


def main(outdir):
    out = Path(outdir)
    links = json.loads((out / "links.json").read_text(encoding="utf-8"))
    plans = {"takken": takken_sources(links.get("takken", {}).get("pdfLinks", [])),
             "surveyor": surveyor_sources(links.get("surveyor", {}).get("pdfLinks", []))}
    for slug, sources in plans.items():
        print(f"[{slug}] found: " + json.dumps(sources, ensure_ascii=False))
    summary = {}
    for slug, sources in plans.items():
        print(f"\n===== {slug}: {len(sources)} PDF")
        rows = []
        for src in sources:
            try:
                r, sec = parse_one(src, out)
                packets = r.get("packets", [])
                excl = Counter(e["reason"] for e in r.get("excluded", []))
                row = {"year": src["year"], "section": src["section"], "status": r.get("status"), "reason": r.get("reason"),
                       "packets": len(packets), "excluded": dict(excl), "fields": classify_counts(packets, slug), "seconds": sec}
                unclassified = [p["questionNumber"] for p in packets if not p.get("fieldId")]
                if unclassified:
                    row["unclassifiedQuestions"] = unclassified
                (out / f"{slug}-{src['year']}-{src['section']}.json").write_text(json.dumps(r, ensure_ascii=False), encoding="utf-8")
            except Exception as e:  # noqa: BLE001
                row = {"year": src["year"], "section": src["section"], "status": "error", "error": f"{type(e).__name__}: {e}"}
                traceback.print_exc()
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False))
        summary[slug] = rows
    (out / "parse-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "survey-out")
