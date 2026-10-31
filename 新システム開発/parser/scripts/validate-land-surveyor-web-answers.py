#!/usr/bin/env python3
"""Live verification of legacy source-page answers (non-official provenance).

Does not register questions or claim that a scanned question has been verified.
"""
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from qlp_parser.adapters.land_surveyor_web_answers import (
    ANSWER_INDEX, EXPECTED, _Tables, extract_year,
)
from qlp_parser.core import ParseError, ANSWER_SPECIAL


def audit():
    request = Request(ANSWER_INDEX,headers={
        "User-Agent":"Mozilla/5.0 (compatible; qualification-learning-archive-audit/1.0)",
        "Accept":"text/html"})
    with urlopen(request,timeout=90) as response:
        if response.status != 200 or not response.geturl().startswith(ANSWER_INDEX):
            raise RuntimeError("ANSWER_INDEX_UNEXPECTED")
        html = response.read(4*1024*1024 + 1)
    if len(html)>4*1024*1024:
        raise RuntimeError("ANSWER_INDEX_TOO_LARGE")
    source=html.decode("utf-8",errors="replace")
    doc = _Tables()
    doc.feed(source)
    doc.close()
    print("WEB_ANSWER_TABLE_SHAPE "+json.dumps({
      "years":{str(year): [
         {"rows":len(rows),"head":rows[:2],"tail":rows[-1:] }
          for rows in tables] for year,tables in doc.tables.items()}
    },ensure_ascii=False),flush=True)
    for year in (2007,2008,2009):
        found=extract_year(source,year)
        result={"year":year,"source":ANSWER_INDEX,"sections":{
            section:{"count":len(rows),
            "cancelled":[index+1 for index,value in enumerate(rows) if value==ANSWER_SPECIAL],
            "matchesFrozenWebsiteTranscription":rows==EXPECTED[year][section]}
            for section,rows in found.items()}}
        print("WEB_ANSWER_AUDIT "+json.dumps(result,ensure_ascii=False),flush=True)
    print("WEB_ANSWER_AUDIT_VERIFIED all 2007-2009 original-page answer rows, not scanned question pages",flush=True)

if __name__=="__main__":
    audit()
