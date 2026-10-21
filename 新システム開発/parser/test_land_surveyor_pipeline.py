"""合成PDFの午前10問・午後20問を分解サーバーと同じrun()へ通す。

合成データ専用にPINを差し替える。実PDFの真正性検証とは区別する。
"""
import hashlib
import unittest
from unittest.mock import patch

import fitz
from qlp_parser.adapters import land_surveyor
from qlp_parser.cli import run
from qlp_parser.core import PdfSource


def synthetic_question(section):
    count = len(land_surveyor.EXPECTED_2025[section])
    doc = fitz.open()
    cover = doc.new_page(width=595, height=842)
    cover.insert_text((70, 70), "午前(07)（午前の部）試験問題" if section == "午前の部" else "午後(07)（午後の部）試験問題",
                      fontname="japan", fontsize=12)
    for n in range(1, count + 1):
        page = doc.new_page(width=595, height=842)
        page.insert_text((70, 85), f"第{n} 問 合成データで出題・採点を確認する", fontname="japan", fontsize=12)
        page.insert_text((70, 500), "1 アウ 2 アエ 3 イウ 4 ウエ 5 エオ", fontname="japan", fontsize=12)
    return doc.tobytes()


def synthetic_answer():
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((70, 70), "令和７年度土地家屋調査士試験正解", fontname="japan", fontsize=13)
    page.insert_text((130, 100), "午前の部", fontname="japan", fontsize=13)
    page.insert_text((360, 100), "午後の部", fontname="japan", fontsize=13)
    for n in range(1, 21):
        y = 140 + 20 * n
        if n <= 10:
            page.insert_text((100, y), f"第{n}問", fontname="japan", fontsize=12)
            page.insert_text((240, y), str(land_surveyor.EXPECTED_2025["午前の部"][n-1]), fontname="japan", fontsize=12)
        page.insert_text((320, y), f"第{n}問", fontname="japan", fontsize=12)
        page.insert_text((440, y), str(land_surveyor.EXPECTED_2025["午後の部"][n-1]), fontname="japan", fontsize=12)
    return doc.tobytes()


class PipelineTest(unittest.TestCase):
    def test_two_exam_sections_end_to_end(self):
        answer_bytes = synthetic_answer()
        answer_sha = hashlib.sha256(answer_bytes).hexdigest()
        for section, field, count in [("午前の部", "l1", 10), ("午後の部", "l3", 20)]:
            with self.subTest(section=section):
                question_bytes = synthetic_question(section)
                q_sha = hashlib.sha256(question_bytes).hexdigest()
                with patch.dict(land_surveyor.PIN_2025, {section: q_sha, "正答": answer_sha}):
                    assets = {}
                    result = run("land_surveyor", 2025,
                        PdfSource(question_bytes, "https://files.example/official-question.pdf", q_sha),
                        PdfSource(answer_bytes, "https://files.example/official-answer.pdf", answer_sha),
                        section, assets)
                self.assertEqual(result["status"], "ready", result.get("detail"))
                self.assertEqual(result["packetCount"], count)
                self.assertEqual(result["excluded"], [])
                self.assertEqual([p["questionNumber"] for p in result["packets"]], list(range(1, count+1)))
                self.assertEqual([p["correctAnswer"] for p in result["packets"]], land_surveyor.EXPECTED_2025[section])
                self.assertTrue(all(p["fieldId"] == field for p in result["packets"]))
                self.assertTrue(all(p["stemMode"] == "official_image" and p["choiceMode"] == "official_image" for p in result["packets"]))
                self.assertEqual(len([k for k in assets if k.endswith(".png")]), count)
                self.assertTrue(all(len(assets[p["figures"][0]["file"]]) < 5 * 1024 * 1024 for p in result["packets"]))
                self.assertTrue(all(p["questionPdfSha256"] == q_sha and p["answerPdfSha256"] == answer_sha for p in result["packets"]))

    def test_year_and_section_mismatch_fail_closed(self):
        qb = synthetic_question("午前の部")
        ab = synthetic_answer()
        qsha = hashlib.sha256(qb).hexdigest()
        asha = hashlib.sha256(ab).hexdigest()
        with patch.dict(land_surveyor.PIN_2025, {"午前の部": qsha, "午後の部": qsha, "正答": asha}):
            other = run("land_surveyor", 2025, PdfSource(qb), PdfSource(ab), "午後の部")
            self.assertEqual(other["status"], "unavailable")
            self.assertEqual(other["reason"], "EXAM_SECTION_MISMATCH")
            altered = run("land_surveyor", 2025, PdfSource(qb+b"\nATTACK"), PdfSource(ab), "午前の部")
            self.assertEqual(altered["status"], "unavailable")
            self.assertEqual(altered["reason"], "SOURCE_PDF_PIN_MISMATCH")


if __name__ == "__main__":
    unittest.main()
