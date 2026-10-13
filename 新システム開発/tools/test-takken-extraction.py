#!/usr/bin/env python3
"""Integration checks against a verified official PDF; no fabricated question content."""
import json, os, subprocess, sys, tempfile
from pathlib import Path

pdf = Path(os.environ["RUNNER_TEMP"]) / "takken-2025-verified.pdf"
script = Path("tools/extract-takken-on-demand.py")

def run(path, number):
    return subprocess.run([sys.executable, str(script), str(path), str(number)], capture_output=True, text=True)

ok = run(pdf, 29)
assert ok.returncode == 0, ok.stderr
d = json.loads(ok.stdout)
checks = {
    "question_number": d["questionNumber"] == 29,
    "four_choices": d["choicesParsed"] is True and len(d["choices"]) == 4,
    "nonempty_text": bool(d["stem"]) and all(bool(x) for x in d["choices"]),
    "page": d["pdfPage"] == 17,
    "not_display_ready": d["status"] != "ready",
    "visuals_not_assumed": d["status"] == "text_extracted_visuals_unverified",
}
for name, passed in checks.items():
    print(f"{name}: {'PASS' if passed else 'FAIL'}", flush=True)
assert all(checks.values()), "INTEGRATION_CHECK_FAILED"

for invalid in (0, 51):
    result = run(pdf, invalid)
    assert result.returncode != 0 and "QUESTION_OUT_OF_RANGE" in result.stderr
print("out_of_range_rejected: PASS")

with tempfile.TemporaryDirectory() as directory:
    tampered = Path(directory) / "tampered.pdf"
    tampered.write_bytes(pdf.read_bytes() + b"tampered")
    result = run(tampered, 29)
    assert result.returncode != 0 and "OFFICIAL_PDF_SHA256_MISMATCH" in result.stderr
print("tampered_pdf_rejected: PASS")

# Verify exact answer cells in the final official PDF page before enabling grading.
import fitz, re
with fitz.open(pdf) as official:
    answer_page = official[29].get_text(sort=True)
    normalized = re.sub(r"\s+", " ", answer_page)
    for q, expected in ((29, 2), (30, 3)):
        # Both entries are adjacent in the official answer row, following questions 21-30.
        row = re.search(r"問\s*２１.*?問\s*３０\s+([1-4](?:\s+[1-4]){9})", normalized)
        if not row:
            raise AssertionError("OFFICIAL_ANSWER_ROW_NOT_FOUND")
        cells = [int(x) for x in row.group(1).split()]
        assert cells[q-21] == expected, f"OFFICIAL_ANSWER_MISMATCH_Q{q}"
        print(f"official_answer_q{q}: PASS", flush=True)

print("INTEGRATION_TESTS_PASSED")
