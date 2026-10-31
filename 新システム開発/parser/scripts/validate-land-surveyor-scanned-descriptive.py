#!/usr/bin/env python3
"""Verify all 24 non-graded descriptive questions in 2007-2014 scan PDFs.

Run with --local-dir /tmp for already downloaded immutable sources. Otherwise
fetch the archived PDFs afresh; never write PDFs into Git or the learning store.
"""
import base64
import hashlib
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qlp_parser.descriptive import extract_descriptive
from qlp_parser.scanned_descriptive import SCANNED_DESCRIPTIVE

MANIFEST = Path(__file__).resolve().parents[2]/"engine/data/land-surveyor-archive-source-manifest.json"


def fetch(url):
    request=Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; qlp-descriptive-audit/1.0)"})
    with urlopen(request,timeout=90) as response:
        if not response.geturl().startswith("https://izuki.net/wp-content/uploads/"):
            raise ValueError("SCANNED_SOURCE_UNEXPECTED")
        content=response.read(31*1024*1024)
    if not content.startswith(b"%PDF-") or len(content)>30*1024*1024:
        raise ValueError("SCANNED_SOURCE_PDF_INVALID")
    return content


def main(args):
    local_dir = None
    if args:
        if len(args)!=2 or args[0]!="--local-dir":
            raise SystemExit("Usage: validate-land-surveyor-scanned-descriptive.py [--local-dir /tmp]")
        local_dir=Path(args[1])
    years=json.loads(MANIFEST.read_text(encoding="utf-8"))["years"]
    by_year={row["year"]:row for row in years}
    verified=[]
    for year,sections in SCANNED_DESCRIPTIVE.items():
        for section, (sha,page_count,question_ranges) in sections.items():
            source=by_year[year]["questionSources"][section]
            if source["sha256"] != sha:
                raise SystemExit("SCANNED_SOURCE_MANIFEST_MISMATCH")
            if local_dir:
                short="am" if section=="午前の部" else "pm"
                data=(local_dir/f"land-surveyor-{year}-{short}.pdf").read_bytes()
            else:
                data=fetch(source["url"])
            if hashlib.sha256(data).hexdigest()!=sha:
                raise SystemExit("SCANNED_SOURCE_SHA_MISMATCH")
            for number, (start,end) in question_ranges.items():
                result=extract_descriptive(pdf_bytes=data,year=year,section=section,
                                           number=number,expected_sha=sha)
                expected=list(range(start,end+1))
                figures=[x for x in result["layout"] if x["kind"]=="figure"]
                ocr_text=[x for x in result["layout"] if x["kind"]=="text" and x.get("ocr")]
                if not (result["status"]=="ready" and result["kind"]=="descriptive" and
                        result["pageNumbers"]==expected and result["gradingMode"]=="none" and
                        result["solutionAvailable"] is False and result["textComplete"] is False and
                        result["questionSha256"]==sha and len(figures)==len(expected) and
                        len(ocr_text)>=1 and all(f.get("sourceOnly") for f in figures) and
                        len(result["pages"])==len(expected) and len(result["diagrams"])==len(expected) and
                        "correctAnswer" not in result and "answerPdfSha256" not in result and
                        all((lambda png: png.startswith(b"\x89PNG\r\n\x1a\n") and
                             len(png)<=5*1024*1024)(base64.b64decode(result["pages"][f"p{p}.png"]))
                            for p in expected)):
                    raise SystemExit("SCANNED_DESCRIPTIVE_VERIFICATION_FAILED")
                verified.append((year,section,number))
                print("SCANNED_DESCRIPTIVE_VERIFIED",year,section,number,
                      "pages",start,end,"of",page_count,flush=True)
    if len(verified)!=24:
        raise SystemExit("SCANNED_DESCRIPTIVE_COUNT_MISMATCH")
    print("ALL_SCANNED_DESCRIPTIVE_VERIFIED 24 non-graded questions",flush=True)


if __name__=="__main__":
    main(sys.argv[1:])
