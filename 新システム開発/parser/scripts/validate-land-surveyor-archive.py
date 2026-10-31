#!/usr/bin/env python3
"""Real archival PDF ingestion smoke. No PDF or question content is committed.

Only reports verified number/year/section and SHA-matched published answer.
"""
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from qlp_parser.cli import run
from qlp_parser.core import PdfSource
from qlp_parser.adapters import land_surveyor

MANIFEST = Path(__file__).resolve().parents[2]/"engine/data/land-surveyor-archive-source-manifest.json"
SUPPORTED = {year: ("午前の部", "午後の部") for year in (2015,2016,2017,2018,2019,2020,2021)}
def fetch(url):
    req=Request(url, headers={"User-Agent":"Mozilla/5.0 (compatible; qualification-learning-audit/1.0)"})
    with urlopen(req, timeout=90) as response:
        if response.status != 200 or not response.geturl().startswith("https://izuki.net/wp-content/uploads/"):
            raise RuntimeError("ARCHIVE_SOURCE_UNEXPECTED")
        data=response.read(31*1024*1024)
    if not data.startswith(b"%PDF-") or len(data)>30*1024*1024:
        raise RuntimeError("ARCHIVE_PDF_INVALID")
    return data

def main(args):
    if len(args)!=1 or not args[0].isdigit():
        raise SystemExit("Usage: validate-land-surveyor-archive.py YYYY")
    year=int(args[0])
    if year not in SUPPORTED:
        raise SystemExit("YEAR_NOT_READY_FOR_GRADED_IMPORT")
    years=json.loads(MANIFEST.read_text(encoding="utf-8"))["years"]
    row=next(x for x in years if x["year"]==year)
    if row["answerSource"]["format"]!="pdf":
        raise SystemExit("ANSWER_SOURCE_UNAVAILABLE")
    a=row["answerSource"]
    answer=PdfSource(fetch(a["url"]),a["url"],a["sha256"])
    failed=[]
    for section in SUPPORTED[year]:
        q=row["questionSources"][section]
        result=run("land_surveyor",year,PdfSource(fetch(q["url"]),q["url"],q["sha256"]),
            answer,section)
        log={"year":year,"section":section,"status":result.get("status"),
            "count":result.get("packetCount",0),"excluded":len(result.get("excluded",[])),
            "reason":result.get("reason"),
            "allOfficialIdsConsistent":all(
                p.get("questionId")==f"land_surveyor:{year}:{section}:{p.get('questionNumber')}"
                for p in result.get("packets",[])),
            "allPinnedSourcesMatch":all(
                p.get("questionPdfSha256")==q["sha256"] and p.get("answerPdfSha256")==a["sha256"]
                for p in result.get("packets",[]))}
        print("ARCHIVE_REAL_PARSE "+json.dumps(log,ensure_ascii=False),flush=True)
        expected=land_surveyor.SECTIONS[section][0]
        if (result.get("status")!="ready" or result.get("packetCount")!=expected or
                result.get("excluded") or not log["allOfficialIdsConsistent"] or not log["allPinnedSourcesMatch"]):
            failed.append(log)
    if failed:
        raise SystemExit("ARCHIVE_IMPORT_VERIFICATION_FAILED")
    print("ARCHIVE_IMPORT_VERIFIED "+str(year),flush=True)

if __name__=="__main__":
    main(sys.argv[1:])
