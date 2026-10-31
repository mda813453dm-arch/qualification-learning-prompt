"""Run against the five official 2025 PDFs (downloaded to CUSTOMS_SOURCE_DIR by CI).

Protects against displaying written questions as full-page image placeholders,
mixing answers, or hiding real tables.
"""
import os
import pathlib
import unittest

from qlp_parser.cli import run
from qlp_parser.core import PdfSource

BASE = "https://www.customs.go.jp/tsukanshi/59_shiken/"
FILENAMES = {
    "通関業法": "20251005tukanshi01.pdf",
    "関税法等": "20251005tukanshi02.pdf",
    "通関実務": "20251005tukanshi03.pdf",
}
EXPECTED = {"通関業法": 9, "関税法等": 15, "通関実務": 5}


@unittest.skipUnless(os.environ.get("CUSTOMS_SOURCE_DIR"), "official files not supplied")
class CustomsOfficialTextTests(unittest.TestCase):
    def test_prose_questions_are_real_text_with_exact_answers(self):
        folder = pathlib.Path(os.environ["CUSTOMS_SOURCE_DIR"])
        answer_file = folder / "59shiken_seikai.pdf"
        self.assertTrue(answer_file.is_file())
        answer = PdfSource(answer_file.read_bytes(), BASE + answer_file.name)
        for section, filename in FILENAMES.items():
            with self.subTest(section=section):
                src = PdfSource((folder / filename).read_bytes(), BASE + filename)
                result = run("tsukanshi", 2025, src, answer, section)
                self.assertIn(result["status"], ("ready", "partial"), result)
                packets = result["packets"]
                self.assertEqual(len(packets), EXPECTED[section])
                self.assertTrue(all(p["stemMode"] == "text" for p in packets))
                self.assertTrue(all(p["choiceMode"] == "text" for p in packets))
                self.assertTrue(all(len(p["choices"]) == 5 and
                    all(len(c) >= 10 for c in p["choices"]) for p in packets))
                self.assertTrue(all(len(p["stem"]) >= 25 for p in packets))
                self.assertTrue(all(p["verification"]["questionText"] == "runtime_pdf_checked"
                    for p in packets))
                numbers = {p["questionNumber"] for p in packets}
                self.assertEqual(len(numbers), len(packets))
                if section == "通関業法":
                    self.assertNotIn(18, numbers)  # official answer 0; not forced into 1-5
                if section == "関税法等":
                    q16 = next(p for p in packets if p["questionNumber"] == 16)
                    self.assertIn("関税の修正申告", q16["stem"])
                    self.assertIn("環太平洋パートナーシップ", q16["choices"][0])
                    self.assertEqual(q16["figures"], [])
                if section == "通関実務":
                    assert images := {p["questionNumber"] for p in packets if p["figures"]}
                    self.assertEqual(images, {15, 16}, "only actual source tables should be images")
                    q15 = next(p for p in packets if p["questionNumber"] == 15)
                    self.assertNotIn("関税率表の部及び類の表題第１部", q15["choices"][4])
                    self.assertIn("歯科用椅子", q15["choices"][4])


if __name__ == "__main__":
    unittest.main()
