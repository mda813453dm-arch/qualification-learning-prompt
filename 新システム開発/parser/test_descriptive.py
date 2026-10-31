"""記述式の問11/21/22は、択一と違い答案を自動採点しない。"""
import unittest
import hashlib
from unittest.mock import patch

import fitz
from qlp_parser import descriptive
from qlp_parser.scanned_descriptive import SCANNED_DESCRIPTIVE

from qlp_parser.descriptive import DescriptiveError, extract_descriptive, find_descriptive_pages


class DescriptiveTest(unittest.TestCase):
    def sample(self, section, headings):
        class Page:
            def __init__(self, text): self.text = text
            def get_text(self, *args, **kwargs): return self.text
        return [Page(title) for title in headings]

    def test_morning_11_stops_before_appendix(self):
        doc = self.sample("午前の部", ["第10問", "第11問", "計算資料", "関数表", "注意"])
        self.assertEqual(find_descriptive_pages(doc, "午前の部", 11), [2, 3])
        self.assertRaises(DescriptiveError, find_descriptive_pages, doc, "午前の部", 21)

    def test_afternoon_21_and_22_are_distinct(self):
        doc = self.sample("午後の部", ["第20問", "第21問", "資料のつづき", "第22問", "図面のつづき", "答案用紙"])
        self.assertEqual(find_descriptive_pages(doc, "午後の部", 21), [2, 3])
        self.assertEqual(find_descriptive_pages(doc, "午後の部", 22), [4, 5])

    def test_split_centered_pdf_page_numbers_are_not_displayed(self):
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((60, 95), "第21問", fontname="japan")
        page.insert_text((60, 130), "測量成果を使う", fontname="japan")
        page.insert_text((275, 818), "(   ) 12")
        # A real number inside the page body must not be swallowed.
        page.insert_text((270, 530), "(   ) 12")
        self.assertTrue(descriptive._is_printed_page_number("(   ) 12",
                        fitz.Rect(273, 804, 324, 823), page))
        self.assertTrue(descriptive._is_printed_page_number("12",
                        fitz.Rect(294, 808, 312, 823), page))
        self.assertTrue(descriptive._is_printed_page_number("(",
                        fitz.Rect(276, 808, 284, 823), page))
        self.assertFalse(descriptive._is_printed_page_number("(   ) 12",
                         fitz.Rect(273, 515, 324, 533), page))
        self.assertFalse(descriptive._is_printed_page_number("200.00",
                         fitz.Rect(294, 808, 345, 823), page))
        with patch("qlp_parser.server.page_layout", return_value=([], [])):
            layout, _ = descriptive.structured_descriptive(doc, [1])
        combined = "".join(x["text"] for x in layout if x["kind"] == "text")
        self.assertEqual(combined.count("(   ) 12"), 1,
                         "only the problem-body number remains, never the footer")
        doc.close()

    def test_never_accepts_unpinned_pdf(self):
        doc = self.sample("午後の部", ["令和7年度 午後の部", "第21問", "第22問"])
        with self.assertRaisesRegex(DescriptiveError, "DESCRIPTIVE_SHA_MISMATCH"):
            extract_descriptive(pdf_bytes=b'%PDF-test-not-a-pinned-original', year=2025, section="午後の部",
                                number=21, expected_sha="0" * 64)

    def test_pinned_historical_table_error_keeps_original_pages_without_grading(self):
        doc = fitz.open()
        cover = doc.new_page()
        cover.insert_text((50, 70), "平成29年度 午前の部", fontname="japan")
        question = doc.new_page()
        question.insert_text((50, 70), "第11問 記述式", fontname="japan")
        raw_pdf = doc.tobytes()
        doc.close()
        sha = hashlib.sha256(raw_pdf).hexdigest()
        with patch.object(descriptive, "PIN_BY_YEAR", {2017:{"午前の部":sha}}), \
             patch.object(descriptive, "structured_descriptive",
                          side_effect=DescriptiveError("DESCRIPTIVE_TABLE_CELL_UNVERIFIED")):
            result = extract_descriptive(pdf_bytes=raw_pdf, year=2017,
                section="午前の部", number=11, expected_sha=sha)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["gradingMode"], "none")
        self.assertFalse(result["solutionAvailable"])
        self.assertEqual(result["pageNumbers"], [2])
        self.assertEqual([b["kind"] for b in result["layout"]],
                         ["text", "text", "figure"])
        self.assertEqual(len(result["diagrams"]), 1)

    def test_scanned_original_has_local_ocr_and_collapsed_source_images_never_graded(self):
        doc = fitz.open()
        for _ in range(4):
            doc.new_page(width=595,height=842)
        raw_pdf = doc.tobytes()
        doc.close()
        sha = hashlib.sha256(raw_pdf).hexdigest()
        fake = {2007:{"午前の部":(sha,4,{11:(2,3)})}}
        from qlp_parser import ocr
        lines = [(100,115,"第11問　原本からOCRした問題文を記録します。観測記録と図面を照合します。",80,[])]
        with patch.object(descriptive,"SCANNED_DESCRIPTIVE",fake), \
             patch.object(ocr,"available",return_value=True), \
             patch.object(ocr,"page_ocr_local",return_value=lines):
            result = extract_descriptive(pdf_bytes=raw_pdf,year=2007,
                section="午前の部",number=11,expected_sha=sha)
            with self.assertRaisesRegex(DescriptiveError,"DESCRIPTIVE_SHA_MISMATCH"):
                extract_descriptive(pdf_bytes=raw_pdf,year=2007,
                    section="午前の部",number=11,expected_sha="0"*64)
        self.assertEqual(result["pageNumbers"],[2,3])
        self.assertEqual([x["kind"] for x in result["layout"]],
                         ["text","text","figure","text","figure"])
        self.assertTrue(all(x.get("sourceOnly") for x in result["layout"] if x["kind"]=="figure"))
        self.assertIn("第11問", result["text"])
        self.assertEqual(result["gradingMode"],"none")
        self.assertFalse(result["textComplete"])
        self.assertFalse(result["solutionAvailable"])
        self.assertNotIn("correctAnswer",result)

    def test_scanned_page_intervals_are_disjoint_and_bounded(self):
        self.assertEqual(set(SCANNED_DESCRIPTIVE),set(range(2007,2015)))
        for year, sections in SCANNED_DESCRIPTIVE.items():
            self.assertEqual(set(sections),{"午前の部","午後の部"})
            for section,(sha,page_count,questions) in sections.items():
                self.assertRegex(sha,r"^[0-9a-f]{64}$")
                self.assertEqual(set(questions),{11} if section=="午前の部" else {21,22})
                ranges=list(questions.values())
                for start,end in ranges:
                    self.assertGreater(start,1)
                    self.assertLessEqual(start,end)
                    self.assertLessEqual(end,page_count)
                    self.assertLessEqual(end-start+1,12)
                if section=="午後の部":
                    self.assertEqual(questions[21][1]+1,questions[22][0])
                    self.assertEqual(questions[22][1],page_count-1,
                                     "answer-sheet sample must not appear")
                else:
                    self.assertEqual(questions[11][1],page_count-2,
                                     "function table and answer-sheet sample must not appear")

    def test_missing_japanese_ocr_stops_without_returning_image_only_question(self):
        from qlp_parser import ocr
        doc=fitz.open()
        doc.new_page(width=595,height=842)
        doc.new_page(width=595,height=842)
        pdf=doc.tobytes()
        doc.close()
        sha=hashlib.sha256(pdf).hexdigest()
        fake={2007:{"午前の部":(sha,2,{11:(1,1)})}}
        with patch.object(descriptive,"SCANNED_DESCRIPTIVE",fake), \
             patch.object(ocr,"available",return_value=False):
            with self.assertRaisesRegex(DescriptiveError,"DESCRIPTIVE_SCANNED_OCR_UNAVAILABLE"):
                extract_descriptive(pdf_bytes=pdf,year=2007,section="午前の部",number=11,expected_sha=sha)


if __name__ == "__main__":
    unittest.main()
