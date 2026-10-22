"""公式の問題が次ページに続き、続きの直下に次問が載る配置の回帰試験。"""

import unittest
from types import SimpleNamespace

import fitz

from qlp_parser.adapters import surveyor


class SurveyorContinuationTest(unittest.TestCase):
    def test_corrupted_native_number_markers(self):
        # 古い公式PDFでは「1.」が文字コード上「1㸬」になっている。
        words = [(80, 75 + k*21, 98, 88 + k*21, f"{k + 1}㸬", 0, k, 0)
                 for k in range(5)]
        page = SimpleNamespace(get_text=lambda *args, **kwargs: words)
        # 数字だけの続きページはOCR不要と判定されても復元する必要がある。
        region = SimpleNamespace(page=page, words=words, limit=700, ocr=False)
        marks = surveyor._choice_markers(region)
        self.assertEqual(len(marks), 5)
        self.assertEqual([m[4] for m in marks], [f"{k}㸬" for k in range(1, 6)])

    def test_continuation_does_not_capture_next_heading(self):
        doc = fitz.open()
        a = doc.new_page(width=595, height=842)
        a.insert_text((70, 95), "[No. 1]", fontname="helv", fontsize=12)
        # 続きページを示す文言がOCRで欠落しても、次問の直前までの5択は連結する。
        a.insert_text((80, 135), "測量法について選べ。", fontname="japan", fontsize=12)
        a.draw_rect(fitz.Rect(80, 180, 350, 360))
        b = doc.new_page(width=595, height=842)
        for n in range(1, 6):
            b.insert_text((83, 90 + 30*n), f"{n}. {n*100} m", fontsize=11)
        b.insert_text((70, 400), "[No. 2]", fontname="helv", fontsize=12)
        b.insert_text((80, 435), "測量法について選べ。", fontname="japan", fontsize=12)
        for n in range(1, 6):
            b.insert_text((83, 440 + 27*n), f"{n}. {n*10} m", fontsize=11)
        q = surveyor.parse_questions(doc)
        self.assertEqual([x.number for x in q], [1, 2])
        self.assertEqual(q[0].pages, [1, 2])
        self.assertEqual(q[1].pages, [2])
        self.assertEqual(len(q[0].choices), 5)
        self.assertTrue(q[0].crops[1][1][3] < 400)
        self.assertIn('question_continues_next_page', q[0].notes)
        doc.close()


if __name__ == '__main__':
    unittest.main()
