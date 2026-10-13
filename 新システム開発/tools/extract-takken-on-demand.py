#!/usr/bin/env python3
"""Extract ONE requested question from a locally verified official Takken PDF.

Usage: python extract-takken-on-demand.py PDF QUESTION_NUMBER
Outputs JSON; never claims display-ready if figures or extraction are uncertain.
Requires PyMuPDF. Does not persist a 50-question bank or use a personal plan.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

EXPECTED_SHA = "829cde5778e22d1a8f0050ce2ff8b4b8089749bcab5456fbde6d1d843a3ed8ed"
HEADING = re.compile(r"【問[ 　]*(\d{1,2})】")
CHOICE = re.compile(r"(?m)^[ \\t]*([1-4])[ 　]+")
ANSWERS = [
  3,3,3,4,4,1,1,2,1,3, 3,3,3,1,4,4,2,2,2,4,
  4,4,1,2,1,4,1,2,2,3, 4,2,3,3,1,4,4,3,4,3,
  1,2,4,2,4,2,3,2,1,1
]

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract-takken-on-demand.py PDF QUESTION_NUMBER")
    path = Path(sys.argv[1])
    number = int(sys.argv[2])
    if not 1 <= number <= 50:
        raise SystemExit("QUESTION_OUT_OF_RANGE")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA:
        raise SystemExit("OFFICIAL_PDF_SHA256_MISMATCH")
    import fitz
    doc = fitz.open(path)
    if len(doc) != 30:
        raise SystemExit("PDF_PAGE_COUNT_MISMATCH")
    located = []
    for index in range(1, 29):
        page = doc[index]
        text = page.get_text(sort=True)
        matches = list(HEADING.finditer(text))
        for j, match in enumerate(matches):
            if int(match.group(1)) != number:
                continue
            end = matches[j + 1].start() if j + 1 < len(matches) else len(text)
            chunk = text[match.end():end].strip()
            located.append((index, chunk, len(page.get_images(full=True)), len(page.get_drawings())))
    if len(located) != 1:
        raise SystemExit("QUESTION_LOCATION_NOT_UNIQUE_OR_PAGE_SPAN_REQUIRES_REVIEW")
    index, chunk, images, drawings = located[0]
    markers = list(CHOICE.finditer(chunk))
    choices_ok = len(markers) == 4 and [int(m.group(1)) for m in markers] == [1,2,3,4]
    stem = chunk[:markers[0].start()].strip() if choices_ok else None
    choices = [chunk[m.end():markers[i+1].start() if i+1 < 4 else len(chunk)].strip()
               for i,m in enumerate(markers)] if choices_ok else []
    # A lone printed page number at the end is not part of choice 4.
    if choices_ok:
        choices[-1] = re.sub(r"\s+[0-9]{1,2}\s*$", "", choices[-1]).strip()
    # Page-level drawings are not proof that this question contains a figure.
    # Never mark a packet ready without question-level visual and answer-key verification.
    print(json.dumps({
      "status": "text_extracted_visuals_unverified" if choices_ok else "needs_manual_review",
      "questionNumber": number, "pdfPage": index+1, "pdfSha256": digest,
      "stem": stem, "choices": choices, "answerNumber": None, "unverifiedAnswerHint": ANSWERS[number-1],
      "answerEvidencePdfPage": 30, "rasterImagesOnPage": images,
      "vectorDrawingsOnPage": drawings, "choicesParsed": choices_ok,
      "answerVerified": False, "displayReady": False,
      "note": "Answer hint is not grading authority. Source-cell verification and question-level visual review required before display."
    }, ensure_ascii=False, indent=2))
if __name__ == "__main__":
    main()
