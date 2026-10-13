import hashlib
import tempfile
import unittest
from pathlib import Path

import fitz
from extract_attached_pdf_figure import extract_attached_pdf_figure


class AttachedPdfFigureTests(unittest.TestCase):
    def setUp(self):
        doc = fitz.open()
        page = doc.new_page(width=600, height=800)
        page.insert_text((40, 45), "Official question")
        page.draw_line((130, 180), (130, 500), color=(0, 0, 0), width=2)
        page.draw_line((130, 500), (430, 330), color=(0, 0, 0), width=2)
        page.draw_circle((130, 500), 5, color=(0, 0, 0), fill=(0, 0, 0))
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.pdf = self.root / "attached.pdf"
        self.pdf.write_bytes(doc.tobytes())
        doc.close()
        self.sha = hashlib.sha256(self.pdf.read_bytes()).hexdigest()
        self.kwargs = dict(
            expected_pdf_sha256=self.sha,
            attachment_id="attachment-from-this-chat",
            chat_id="chat-current",
            question_id="land-surveyor:2025:morning:2",
            page_number=1,
            crop={"x0": 80, "y0": 140, "x1": 470, "y1": 560},
            output_dir=self.root / "out",
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_fresh_png_is_cropped_from_current_attached_pdf(self):
        first = extract_attached_pdf_figure(self.pdf, **self.kwargs)
        second = extract_attached_pdf_figure(self.pdf, **self.kwargs)
        self.assertEqual(first["status"], "ready")
        self.assertEqual(first["mediaType"], "image/png")
        self.assertTrue(Path(first["imagePath"]).read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertNotEqual(first["imagePath"], second["imagePath"])
        self.assertEqual(first["generatedInChatId"], "chat-current")
        self.assertEqual(first["derivedFromPdf"]["fileId"], "attachment-from-this-chat")
        self.assertEqual(first["derivedFromPdf"]["pdfSha256"], self.sha)
        self.assertEqual(first["derivedFromPdf"]["page"], 1)
        self.assertTrue(first["derivedFromPdf"]["extractionVerified"])
        self.assertRegex(first["imageSha256"], r"^[a-f0-9]{64}$")

    def test_wrong_pdf_hash_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "ATTACHED_PDF_HASH_MISMATCH"):
            extract_attached_pdf_figure(self.pdf, **{**self.kwargs, "expected_pdf_sha256": "0" * 64})

    def test_missing_current_chat_attachment_binding_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "CURRENT_CHAT_ATTACHMENT_BINDING_REQUIRED"):
            extract_attached_pdf_figure(self.pdf, **{**self.kwargs, "chat_id": ""})

    def test_crop_outside_page_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "CROP_OUTSIDE_PAGE_OR_EMPTY"):
            extract_attached_pdf_figure(self.pdf, **{**self.kwargs, "crop": {"x0": 500, "y0": 700, "x1": 650, "y1": 820}})

    def test_missing_reviewed_crop_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "REVIEWED_CROP_REQUIRED"):
            extract_attached_pdf_figure(self.pdf, **{**self.kwargs, "crop": None})


if __name__ == "__main__":
    unittest.main()
