"""記述式の問11/21/22は、択一と違い答案を自動採点しない。"""
import unittest

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

    def test_never_accepts_unpinned_pdf(self):
        doc = self.sample("午後の部", ["令和7年度 午後の部", "第21問", "第22問"])
        with self.assertRaisesRegex(DescriptiveError, "DESCRIPTIVE_SHA_MISMATCH"):
            extract_descriptive(pdf_bytes=doc.tobytes(), year=2025, section="午後の部",
                                number=21, expected_sha="0" * 64)


if __name__ == "__main__":
    unittest.main()
