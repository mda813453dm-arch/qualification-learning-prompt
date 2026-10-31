#!/usr/bin/env python3
"""Discover archived land surveyor exam PDFs from the user-specified index.

This tool NEVER declares PDFs or answers verified for scoring and NEVER stores
copyrighted PDF bytes in Git. It records URLs, SHA-256, page count, and audit cues.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

INDEX = "https://izuki.net/chousashi-past-tests/"
FILE_RE = re.compile(r"^c_((?:h\d{2}|r\d{1,2}))(am|pm)_q\.pdf$", re.I)
ANSWER_RE = re.compile(r"^c_((?:h\d{2}|r\d{1,2}))_a\.pdf$", re.I)
LIMIT_BYTES = 30 * 1024 * 1024
SECTIONS = {"am": "午前の部", "pm": "午後の部"}

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            target = dict(attrs).get("href")
            if target:
                self.links.append(urljoin(INDEX, target))

def fetch(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ("izuki.net", "www.izuki.net"):
        raise ValueError("SOURCE_HOST_UNEXPECTED")
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; qualification-learning-archive-audit/1.0)", "Accept": "application/pdf,text/html;q=0.8"})
    with urlopen(request, timeout=90) as response:
        if response.status != 200:
            raise ValueError("SOURCE_HTTP_" + str(response.status))
        if urlparse(response.geturl()).hostname not in ("izuki.net", "www.izuki.net"):
            raise ValueError("SOURCE_REDIRECT_HOST")
        data = response.read(LIMIT_BYTES + 1)
    if len(data) > LIMIT_BYTES:
        raise ValueError("SOURCE_EXCEEDS_SIZE_LIMIT")
    return data

def year_from_era(era):
    value = int(era[1:])
    if era[0].lower() == "h":
        return 1988 + value
    return 2018 + value

def catalog(html):
    links = Links()
    links.feed(html.decode("utf-8", errors="replace"))
    out = {}
    for link in links.links:
        path = urlparse(link).path
        name = path.rsplit("/", 1)[-1].lower()
        match = FILE_RE.fullmatch(name)
        answer = ANSWER_RE.fullmatch(name)
        if not (match or answer):
            continue
        year = year_from_era((match or answer).group(1))
        if year < 2007 or year > 2021:
            continue
        # 2007/2008: archived filename section abbreviations are reversed
        # relative to the user's 11/22-total-question section rule.
        # 11 = morning (10 MC + 1 written), 22 = afternoon (20 MC + 2 written).
        # A page count alone never establishes a validated question set.
        part = SECTIONS[match.group(2).lower()] if match else "正答"
        if match and year <= 2008:
            part = "午後の部" if part == "午前の部" else "午前の部"
        record = out.setdefault(year, {})
        if part in record and record[part] != link:
            raise ValueError("DUPLICATE_SOURCE_"+str(year)+"_"+part)
        record[part] = link
    return out


def probe_answer_rows(doc, year):
    """Independently inspect the answer PDF's two-column 10/20 table.

    Extracted numbers are candidates until original source and each question
    are verified. Never infer a missing digit or permit a section crossover.
    """
    import unicodedata
    title = unicodedata.normalize("NFKC", doc[0].get_text("text", sort=True))
    if "土地家屋調査士" not in title or "午前の部" not in title or "午後の部" not in title:
        raise ValueError("ANSWER_TITLE_OR_SECTION_MISMATCH")
    era = ("令和(?:元|1)" if year == 2019 else "令和" + str(year - 2018)) if year >= 2019 else "平成" + str(year - 1988)
    if not re.search(era, re.sub(r"\s+", "", title)):
        raise ValueError("ANSWER_YEAR_MISMATCH")
    answers = {}
    for page in doc:
        words = page.get_text("words", sort=True)
        mid = page.rect.width / 2
        for sec, count, left in (("午前の部", 10, True), ("午後の部", 20, False)):
            for w in words:
                value = unicodedata.normalize("NFKC", str(w[4]))
                m = re.fullmatch(r"第\s*(\d+)\s*問", value)
                if not m or ((w[0] < mid) != left):
                    continue
                n = int(m.group(1))
                if not (1 <= n <= count):
                    raise ValueError("ANSWER_QUESTION_NUMBER_OUT_OF_RANGE")
                candidates = [v for v in words if
                    abs((v[1]+v[3])-(w[1]+w[3])) <= 2.2
                    and v[0] > w[2]+8 and (v[0] < mid if left else True)
                    and re.fullmatch(r"[1-5]", unicodedata.normalize("NFKC",str(v[4])))]
                if len(candidates) != 1:
                    raise ValueError("ANSWER_ROW_AMBIGUOUS_"+sec+"_"+str(n))
                a = answers.setdefault(sec, {})
                if n in a:
                    raise ValueError("ANSWER_ROW_DUPLICATE_"+sec+"_"+str(n))
                a[n] = int(unicodedata.normalize("NFKC",str(candidates[0][4])))
    out = {}
    for sec, count in (("午前の部", 10), ("午後の部", 20)):
        rows = answers.get(sec,{})
        if sorted(rows) != list(range(1,count+1)):
            raise ValueError("ANSWER_ROWS_INCOMPLETE_"+sec+"_"+str(len(rows)))
        out[sec] = [rows[i] for i in range(1,count+1)]
    return out

def inspect_pdf(url, year, section):
    import fitz
    data = fetch(url)
    if not data.startswith(b"%PDF-"):
        raise ValueError("SOURCE_NOT_PDF")
    doc = fitz.open(stream=data, filetype="pdf")
    if not doc.page_count:
        raise ValueError("SOURCE_EMPTY_PDF")
    first = doc[0].get_text("text", sort=True)[:500]
    sample_chars = sum(len(doc[p].get_text("text")) for p in range(min(doc.page_count, 4)))
    probe = {"status":"not_probed"}
    if 2015 <= year <= 2021:
        try:
            if section == "正答":
                probe = {"status":"answer_rows_extracted", "candidateAnswers":probe_answer_rows(doc,year)}
            else:
                from qlp_parser.adapters import land_surveyor
                questions = land_surveyor.parse_questions(doc,section)
                probe = {"status":"questions_parsed", "count":len(questions),
                    "textQuestions":sum(q.stem_mode=="text" for q in questions),
                    "imageQuestions":sum(q.stem_mode=="official_image" for q in questions)}
        except Exception as exc:
            probe = {"status":"needs_parser_update","error":str(exc)[:120],
                     "detail":getattr(exc,"detail",{})}
    return {"probe":probe, "url": url, "sha256": hashlib.sha256(data).hexdigest(),
        "byteLength": len(data), "pageCount": doc.page_count,
        "textSampleCharacters": sample_chars,
        "coverExcerpt": re.sub(r"\s+", " ", first).strip()[:260],
        "role": section, "year": year}

def audit(years):
    html = fetch(INDEX)
    sources = catalog(html)
    report = {
        "archiveIndex": INDEX,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "status": "source-discovery-only-not-verified-for-scoring",
        "results": [], "missing": []
    }
    for year in years:
        group = sources.get(year, {})
        year_record = {"year": year, "sections": {}, "answerSource": None, "errors": []}
        for section in ("午前の部", "午後の部", "正答"):
            url = group.get(section)
            if not url:
                if section != "正答":
                    year_record["errors"].append(section + ": PDF link missing")
                continue
            try:
                item = inspect_pdf(url, year, section)
                if section == "正答":
                    year_record["answerSource"] = item
                else:
                    year_record["sections"][section] = item
            except Exception as exc:
                year_record["errors"].append(section + ": " + type(exc).__name__ + ":" + str(exc)[:90])
        if not year_record["answerSource"]:
            year_record["answerWebIndex"] = INDEX
            year_record["answerWebStatus"] = "not_verified"
        report["results"].append(year_record)
        print("ARCHIVE_AUDIT "+json.dumps({
            "year":year,"questionSections":list(year_record["sections"]),
            "answerPdf":bool(year_record["answerSource"]),
            "errors":year_record["errors"],
            "meta":{section:{"sha":v["sha256"],"pages":v["pageCount"],"textChars":v["textSampleCharacters"],"cover":v["coverExcerpt"][:95]}
                    for section,v in year_record["sections"].items()},
            "probes":{section:v.get("probe") for section,v in year_record["sections"].items()},
            "answerProbe":year_record["answerSource"].get("probe") if year_record["answerSource"] else None,
            "answer":({"sha":year_record["answerSource"]["sha256"],
                       "pages":year_record["answerSource"]["pageCount"],
                       "textChars":year_record["answerSource"]["textSampleCharacters"],
                       "cover":year_record["answerSource"]["coverExcerpt"][:95]}
                      if year_record["answerSource"] else None)
            }, ensure_ascii=False), flush=True)
    return report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", default="2017,2018,2019,2020,2021")
    parser.add_argument("--out", default="archive-audit.json")
    args = parser.parse_args()
    years = [int(x) for x in args.years.split(",") if x.strip()]
    if not years or any(x < 2007 or x > 2021 for x in years) or len(set(years)) != len(years):
        parser.error("Years must be distinct between 2007 and 2021")
    report = audit(years)
    with open(args.out, "w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    fail = [v for v in report["results"] if v["errors"] or len(v["sections"])!=2]
    print("ARCHIVE_AUDIT_SUMMARY "+json.dumps({"years":len(years),
        "completeQuestionPairs":len(years)-len(fail),
        "answerPdfs":sum(bool(v["answerSource"]) for v in report["results"]),
        "incompleteYears":[v["year"] for v in fail]}),flush=True)
    if fail:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
