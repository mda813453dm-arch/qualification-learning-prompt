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
        part = SECTIONS[match.group(2).lower()] if match else "正答"
        record = out.setdefault(year, {})
        if part in record and record[part] != link:
            raise ValueError("DUPLICATE_SOURCE_"+str(year)+"_"+part)
        record[part] = link
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
    return {"url": url, "sha256": hashlib.sha256(data).hexdigest(),
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
